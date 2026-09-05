/**
 * POST /api/analyze-writing
 *
 * 觸發（或重跑）一篇作文的 AI 分析。【僅限管理員】。
 *
 * 請求：
 *   { "essayId": "<uuid>", "mode": "stage1" | "synthesis" }
 *   mode 預設 "stage1"。兩個 Stage 是兩次請求，不是一次。
 *
 * 授權（決策 L13，順序不可調換）：
 *   1. 驗證呼叫端 JWT
 *   2. 解析呼叫者身分
 *   3. 檢查授權（adminOnly）
 *   4. 通過之後才碰 DeepSeek 與 service-role 寫入
 *   → 全部包在 requireEssayAccess() 裡，忘了檢查是寫不出來的。
 *
 * 排入佇列與重跑綜合層都走【呼叫者身分】的 RPC，讓資料庫層的 is_admin()
 * 再把關一次。應用層擋下來不算數，要兩層都成立。
 *
 * 執行結構——兩次請求，各自獨立面對 50 秒期限：
 *
 *   請求 A（mode "stage1"）
 *     四支平行（Promise.all），各自獨立驗證，任何一支失敗 → FAILED，
 *     綜合層永遠不會被呼叫。全部通過 → 落地 + ANALYZED + synthesis_status PENDING。
 *
 *   請求 B（mode "synthesis"）
 *     只吃已落地的 Stage 1 結果，產生 overall_evaluation / strengths /
 *     needs_work / next_steps，驗證 refs，然後才 COMPLETED。
 *     失敗時四軸原封不動保留，可以只重跑這一支。
 *
 * 為什麼拆成兩次請求：v3 prompt 之後單次執行量到 48.5 秒，對 50 秒期限只剩
 * 1.5 秒餘裕——任何一次驗證重試都必定超時，而重試正是驗證失敗時的既定行為。
 * 縮 prompt 會退回 v2 的校準品質，調高 DEADLINE_MS 只是把緩衝吃掉，
 * 所以改成讓兩個 Stage 各自擁有完整的 50 秒。
 *
 * 老師只按一次「開始 AI 批改」：請求 B 由前端在請求 A 成功後自動接續發出，
 * 不需要第二次人為動作（src/pages/admin/WritingDebug.tsx 的 runAnalysis）。
 *
 * 為什麼 Stage 1 是四支而不是一支：29 個高分特徵加 23 個能力節點的完整覆蓋，
 * 單一 prompt 的輸出量會逼近 token 上限，而且一支失敗就全毀。
 * 拆開之後 Stage 1 的延遲等於最慢那一支，不是四支相加。
 *
 * maxDuration 是 60 秒（與 api/generate-pack-audio.ts 相同），所以這裡設一個
 * 50 秒的硬性期限。超時的那一次標 FAILED 並說明可以重試，不會留下半套資料。
 */

import {
  isDenied,
  requireEssayAccess,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from "./_lib/essayAuth.js";
import {
  isPassOk,
  runValidatedPass,
  repairInstruction,
  DeadlineExceeded,
  DEFAULT_MODEL,
  type PassFailure,
  type PassOutcome,
  type PassTelemetry,
} from "./_lib/deepseek.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compressForSynthesis,
  competencyMessages,
  errorMessages,
  highScoreCategoriesFor,
  highScoreMessages,
  synthesisMessages,
  HIGH_SCORE_PASS_A,
  HIGH_SCORE_PASS_B,
  type EssayInput,
} from "./_lib/writingPrompts.js";
import {
  collectCitableRefs,
  validateCompetencyAnalysis,
  validateErrorAnalysis,
  validateHighScoreAnalysis,
  validateSynthesis,
  type CompetencyAnalysis,
  type ErrorAnalysis,
  type HighScoreAnalysis,
  type ValidationIssue,
} from "./_lib/analysisContract.js";
import { WRITING_TAXONOMY_VERSION } from "./_lib/taxonomy.js";

export const config = {
  maxDuration: 60,
};

/** 留 10 秒給收尾的資料庫寫入，不要讓平台在寫回狀態之前就砍掉這次執行。 */
const DEADLINE_MS = 50_000;

type PassLabel =
  | "competency"
  | "error"
  | "high_score_h1_h3"
  | "high_score_h4_h5"
  | "synthesis";

/**
 * admin 是 service-role client、caller 是呼叫者身分的 client。
 * 需要 auth.uid() / is_admin() 生效的 RPC 一律走 caller，資料庫才擋得到。
 */
interface RunContext {
  res: VercelLikeResponse;
  admin: SupabaseClient;
  caller: SupabaseClient;
  essayId: string;
  apiKey: string;
  signal: AbortSignal;
}

interface Stage1Result {
  competency: CompetencyAnalysis;
  errors: ErrorAnalysis;
  highScoreA: HighScoreAnalysis;
  highScoreB: HighScoreAnalysis;
}

/** 數一個【尚未驗證】的回傳裡某個陣列有幾筆。形狀不對就回 -1，不丟例外。 */
function countArray(raw: unknown, key: string): number {
  const list = (raw as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(list) ? list.length : -1;
}

function fail(res: VercelLikeResponse, status: number, error: string) {
  res.status(status).json({ error });
}

/**
 * ANALYZING 的列到底是「真的還在跑」還是「上一次執行被平台砍掉、狀態卡住」？
 *
 * 沒有心跳可看，只能用時間判斷：一次執行最多活 DEADLINE_MS，加一點寬限。
 * 超過那個窗還停在 ANALYZING，就是死掉的執行，讓下一次請求接手重跑，
 * 不然那篇作文會永遠卡住（唯一索引也不讓它開新的一版）。
 */
function isStillInFlight(startedAt: string | null | undefined): boolean {
  if (!startedAt) return true;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return true;
  return Date.now() - started < DEADLINE_MS + 10_000;
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return fail(res, 405, "只接受 POST");
  }

  const body = (req.body ?? {}) as { essayId?: string; mode?: string };
  const essayId = typeof body.essayId === "string" ? body.essayId : "";

  const rawMode = body.mode ?? "stage1";

  // ── 授權：碰到 DeepSeek 或 service-role 之前 ────────────────────
  // 這一段必須排在所有其他檢查之前。參數格式錯誤的回應也是資訊——未通過授權的
  // 呼叫端只該看到 401/403，不該從錯誤訊息裡讀出這個端點接受哪些參數。
  const access = await requireEssayAccess(req, essayId, { adminOnly: true });
  if (isDenied(access)) {
    return fail(res, access.status, access.error);
  }
  const { admin, caller } = access;

  // 嚴格比對，不做別名對應。以前的 "full" 代表「一次請求跑完兩個 Stage」，
  // 那個語意已經不存在了；靜靜地把它當成 stage1 只會讓過期的前端看起來正常，
  // 實際上少跑了綜合層。明確擋下來，錯誤訊息一眼看得出要改什麼。
  if (rawMode !== "stage1" && rawMode !== "synthesis") {
    return fail(res, 400, `mode 必須是 "stage1" 或 "synthesis"，收到 "${rawMode}"`);
  }
  const mode = rawMode;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("[analyze-writing] 缺少 DEEPSEEK_API_KEY");
    return fail(res, 500, "伺服器設定不完整");
  }

  // 用具名的中斷理由，不是無參數的 abort()。abort(reason) 的 reason 會原封不動
  // 變成 fetch 的 rejection，所以下游能用 instanceof 認出「這是我們自己砍的」，
  // 而不是收到一句對任何中斷都一樣的 "This operation was aborted"。
  const invocationStartedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DeadlineExceeded(DEADLINE_MS, Date.now() - invocationStartedAt)),
    DEADLINE_MS,
  );

  try {
    if (mode === "synthesis") {
      return await runSynthesisOnly({ res, admin, caller, essayId, apiKey, signal: controller.signal });
    }
    return await runStage1({ res, admin, caller, essayId, apiKey, signal: controller.signal });
  } catch (err) {
    console.error("[analyze-writing] 未預期的錯誤:", err instanceof Error ? err.message : err);
    return fail(res, 500, "分析過程發生未預期的錯誤");
  } finally {
    clearTimeout(timer);
  }
}

/* ──────────────── 請求 A：Stage 1（可續跑） ──────────────── */

/**
 * Stage 1 的每一支 pass 各自有狀態，而且跨請求保存。
 *
 *   PENDING         還沒跑過
 *   RUNNING         某一次請求正在跑它
 *   VALID           已通過驗證，結果保存在 progress.value，【永遠不會重跑】
 *   RETRY_REQUIRED  這一次沒過，但值得在下一次請求裡重試
 *   FAILED          終局失敗（不可重試的錯誤，或重試次數用盡）
 */
export type PassState = "PENDING" | "RUNNING" | "VALID" | "RETRY_REQUIRED" | "FAILED";

export interface PassProgress {
  state: PassState;
  /** 累計嘗試次數，跨請求累加 */
  attempts: number;
  /** 進入 RUNNING 的時間。用來分辨「另一次請求正在跑」與「卡住的殘留狀態」 */
  runningSince?: string;
  lastDetail?: string;
  /** 上一次的缺漏清單。跨請求重試時用來組修正指示。 */
  lastIssues?: readonly ValidationIssue[];
  /** 上一次沒過驗證的原始輸出。餵回去讓重試是「修正」而不是「從頭重寫」。 */
  lastRaw?: unknown;
  /** VALID 時的已驗證結果 */
  value?: unknown;
}

export type Stage1Progress = Record<string, PassProgress>;

export const STAGE1_PASSES = [
  "competency",
  "error",
  "high_score_h1_h3",
  "high_score_h4_h5",
] as const;

/**
 * 每一支 pass 的總嘗試上限（跨請求累計）。
 * 一次原始 + 兩次修正。用完還是不過就是 FAILED，不再無限重試下去。
 */
export const MAX_PASS_ATTEMPTS = 3;

/** 一次請求最多為每支 pass 打一次 DeepSeek——重試是【下一次請求】的事。 */
const ATTEMPTS_PER_REQUEST = 1;

function emptyProgress(): Stage1Progress {
  const p: Stage1Progress = {};
  for (const label of STAGE1_PASSES) p[label] = { state: "PENDING", attempts: 0 };
  return p;
}

function readProgress(raw: unknown): Stage1Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== "object") return base;
  for (const label of STAGE1_PASSES) {
    const entry = (raw as Record<string, unknown>)[label];
    if (entry && typeof entry === "object") base[label] = { ...base[label], ...(entry as PassProgress) };
  }
  return base;
}

async function runStage1(ctx: RunContext) {
  const admin = ctx.admin;
  const requestStartedAt = Date.now();

  // 排入佇列走呼叫者身分，資料庫再擋一次「只有管理員能觸發」。
  // 重試請求也走同一條路——授權在每一次請求都重做一遍，不因為是續跑就放寬。
  const { data: analysisId, error: enqueueError } = await ctx.caller.rpc(
    "writing_enqueue_analysis",
    { p_essay_id: ctx.essayId },
  );
  if (enqueueError || typeof analysisId !== "string") {
    return fail(ctx.res, 400, enqueueError?.message ?? "無法排入分析");
  }

  const { data: current } = await admin
    .from("writing_analyses")
    .select("status, started_at, synthesis_status, stage1_progress, stage1_telemetry")
    .eq("id", analysisId)
    .maybeSingle();

  if (current?.status === "ANALYZED") {
    // Stage 1 早就跑完了。這是「請求 A 重送」，不是錯誤：直接告訴前端可以接
    // 請求 B，不重跑四軸，也不動已凍結的資料。
    return ctx.res.status(200).json({
      analysisId,
      stage: "stage1",
      status: "ANALYZED",
      synthesisStatus: current.synthesis_status ?? "PENDING",
      reportReady: false,
      alreadyDone: true,
      nextRequest: "synthesis",
      note: "Stage 1 先前已完成，未重跑；請接續發出綜合層請求",
    });
  }

  const progress = readProgress(current?.stage1_progress);

  // ── 重複請求的防護 ───────────────────────────────────────────
  // 現在不能再用「status = ANALYZING」當判準：續跑請求進來時 status 本來就是
  // ANALYZING。真正要擋的是「另一次請求正在跑同一支 pass」，所以看逐支的
  // RUNNING 與它的時間戳。超過期限窗還停在 RUNNING 的是被平台砍掉的殘留，
  // 讓這一次接手，否則那篇作文會永遠卡住（唯一索引不讓它開新的一版）。
  const inFlight = STAGE1_PASSES.filter(
    (label) => progress[label].state === "RUNNING" && isStillInFlight(progress[label].runningSince),
  );
  if (inFlight.length > 0) {
    return fail(ctx.res, 409, `這篇作文的 Stage 1 正在進行中（${inFlight.join("、")}），請等它結束再試`);
  }

  // 這一次要跑哪幾支：沒跑過的、要重試的、以及卡住的殘留。VALID 的一律跳過。
  const todo = STAGE1_PASSES.filter((label) => progress[label].state !== "VALID"
    && progress[label].state !== "FAILED");

  if (todo.length === 0) {
    // 全部 VALID 卻還沒 ANALYZED：上一次請求在收尾時掛掉了。直接收尾，不重跑。
    return finaliseStage1(ctx, analysisId, progress, requestStartedAt);
  }

  // 取最新的正規文字。evidence 的引用都以這一版為準。
  const { data: text, error: textError } = await admin
    .from("writing_texts")
    .select("content")
    .eq("essay_id", ctx.essayId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: essayMeta } = await admin
    .from("writing_submissions")
    .select("title, essay_topic")
    .eq("id", ctx.essayId)
    .maybeSingle();

  if (textError || !text?.content) {
    await markFailed(admin, analysisId, "competency", "這篇作文沒有正規文字，無法分析", []);
    return fail(ctx.res, 400, "這篇作文沒有正規文字，無法分析");
  }

  const essay: EssayInput = {
    title: essayMeta?.title ?? "",
    topic: essayMeta?.essay_topic ?? null,
    content: text.content,
  };

  // 佔位：把這一次要跑的幾支標成 RUNNING，讓並行的另一次請求看得到。
  const now = new Date().toISOString();
  for (const label of todo) {
    progress[label] = { ...progress[label], state: "RUNNING", runningSince: now };
  }
  await admin
    .from("writing_analyses")
    .update({
      status: "ANALYZING",
      // started_at 只在第一次寫入。續跑請求不重設它——那是 Stage 1 的起點。
      ...(current?.started_at ? {} : { started_at: now }),
      model: DEFAULT_MODEL,
      taxonomy_version: WRITING_TAXONOMY_VERSION,
      stage1_progress: progress,
    })
    .eq("id", analysisId);

  // ── 跑這一次該跑的那幾支，各自獨立驗證 ─────────────────────
  // maxAttempts 是 1：驗證失敗【不在這一次請求裡重打】。重試是下一次請求的事，
  // 那樣它才能拿到完整的 50 秒，而不是跟第一次擠同一個預算。
  const outcomes = await Promise.all(
    todo.map((label) =>
      runPass(label, essay, progress[label], {
        apiKey: ctx.apiKey,
        signal: ctx.signal,
      }).then((pass) => ({ label, pass })),
    ),
  );

  applyPassOutcomes(progress, outcomes);

  const telemetry = mergeTelemetry(current?.stage1_telemetry, outcomes);
  const totalAttempts = STAGE1_PASSES.reduce((n, l) => n + progress[l].attempts, 0);

  // ── 收尾 ─────────────────────────────────────────────────────
  const failed = STAGE1_PASSES.filter((l) => progress[l].state === "FAILED");
  const retryable = STAGE1_PASSES.filter((l) => progress[l].state === "RETRY_REQUIRED");

  if (failed.length > 0) {
    // 終局失敗。已通過的那幾支【原封不動保留在 progress 裡】，不丟棄——
    // 重新分析時可以直接沿用，不必再付一次那些成功呼叫的錢。
    const first = progress[failed[0]];
    await markFailed(
      admin,
      analysisId,
      failed[0] as PassLabel,
      first.lastDetail ?? "Stage 1 失敗",
      first.lastIssues ?? [],
      telemetry,
      totalAttempts,
      progress,
    );
    return ctx.res.status(502).json({
      analysisId,
      stage: "stage1",
      status: "FAILED",
      failedPass: failed[0],
      error: first.lastDetail,
      issueCount: (first.lastIssues ?? []).length,
      passStates: passStates(progress),
      preserved: STAGE1_PASSES.filter((l) => progress[l].state === "VALID"),
      stage1: telemetrySummary(telemetry),
    });
  }

  await admin
    .from("writing_analyses")
    .update({
      stage1_progress: progress,
      stage1_telemetry: telemetry,
      attempt_count: totalAttempts,
    })
    .eq("id", analysisId);

  if (retryable.length > 0) {
    // 還沒好，但也還沒死。已通過的那幾支保存著，下一次請求只重跑這幾支。
    return ctx.res.status(200).json({
      analysisId,
      stage: "stage1",
      status: "ANALYZING",
      reportReady: false,
      retryRequired: true,
      nextRequest: "stage1",
      retryPasses: retryable,
      passStates: passStates(progress),
      preserved: STAGE1_PASSES.filter((l) => progress[l].state === "VALID"),
      requestLatencyMs: Date.now() - requestStartedAt,
      stage1: telemetrySummary(telemetry),
    });
  }

  return finaliseStage1(ctx, analysisId, progress, requestStartedAt, telemetry, totalAttempts);
}

/** 四支全部 VALID 時才走到這裡：組出 canonical 三軸，進入 ANALYZED。 */
async function finaliseStage1(
  ctx: RunContext,
  analysisId: string,
  progress: Stage1Progress,
  requestStartedAt: number,
  telemetry?: Record<string, PassTelemetry>,
  totalAttempts?: number,
) {
  const missing = STAGE1_PASSES.filter((l) => progress[l].state !== "VALID" || !progress[l].value);
  if (missing.length > 0) {
    // 防呆：完整性由這裡把關，不靠呼叫端記得檢查。
    return fail(ctx.res, 500, `Stage 1 尚未完整（${missing.join("、")}），不應進入 ANALYZED`);
  }

  const hsA = progress.high_score_h1_h3.value as HighScoreAnalysis;
  const hsB = progress.high_score_h4_h5.value as HighScoreAnalysis;
  const mergedHighScore: HighScoreAnalysis = {
    taxonomy_version: WRITING_TAXONOMY_VERSION,
    features: [...hsA.features, ...hsB.features],
  };

  const { error: persistError } = await ctx.admin
    .from("writing_analyses")
    .update({
      status: "ANALYZED",
      analyzed_at: new Date().toISOString(),
      competency_analysis: progress.competency.value,
      error_analysis: progress.error.value,
      high_score_feature_analysis: mergedHighScore,
      synthesis_status: "PENDING",
      stage1_progress: progress,
      ...(telemetry ? { stage1_telemetry: telemetry } : {}),
      ...(totalAttempts !== undefined ? { attempt_count: totalAttempts } : {}),
    })
    .eq("id", analysisId);

  if (persistError) {
    console.error("[analyze-writing] 寫入四軸結果失敗:", persistError.message);
    return fail(ctx.res, 500, "寫入分析結果失敗");
  }

  return ctx.res.status(200).json({
    analysisId,
    stage: "stage1",
    status: "ANALYZED",
    synthesisStatus: "PENDING",
    reportReady: false,
    nextRequest: "synthesis",
    passStates: passStates(progress),
    requestLatencyMs: Date.now() - requestStartedAt,
    ...(telemetry ? { stage1: telemetrySummary(telemetry) } : {}),
  });
}

/**
 * 跑一支 pass。
 *
 * 這一支上一次若是驗證失敗，就把它上次的輸出與缺漏清單接在訊息後面——
 * 那樣重試才是「修正」，而不是從零重寫一份同樣可能出錯的東西。
 * 跨請求也成立，因為 lastRaw／lastIssues 存在 stage1_progress 裡。
 */
function runPass(
  label: (typeof STAGE1_PASSES)[number],
  essay: EssayInput,
  prior: PassProgress,
  shared: { apiKey: string; signal: AbortSignal },
): Promise<PassOutcome<unknown>> {
  const repair =
    prior.lastIssues && prior.lastIssues.length > 0 && prior.lastRaw !== undefined
      ? [
          { role: "assistant" as const, content: JSON.stringify(prior.lastRaw) },
          { role: "user" as const, content: repairInstruction(prior.lastIssues) },
        ]
      : [];

  const common = { ...shared, maxAttempts: ATTEMPTS_PER_REQUEST };

  switch (label) {
    case "competency":
      return runValidatedPass({
        ...common,
        label: "Writing Competency",
        messages: [...competencyMessages(essay), ...repair],
        validate: (raw) => validateCompetencyAnalysis(raw, essay.content),
        describe: (raw) => ({ categories: countArray(raw, "categories") }),
      });
    case "error":
      return runValidatedPass({
        ...common,
        label: "Writing Error",
        messages: [...errorMessages(essay), ...repair],
        validate: (raw) => validateErrorAnalysis(raw, essay.content),
        // findings 是四支裡唯一沒有上限的輸出，而且它的長度與「作文有多少錯」
        // 成正比。要回答「弱作文是不是因為 findings 暴增才超時」就得數它，
        // 而且必須在驗證之前數——驗證沒過的那一次也要有數字。
        describe: (raw) => ({ findings: countArray(raw, "findings") }),
      });
    case "high_score_h1_h3":
      return runValidatedPass({
        ...common,
        label: "High-Score Feature H1–H3",
        messages: [...highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_A)), ...repair],
        validate: (raw) => validateHighScoreAnalysis(raw, HIGH_SCORE_PASS_A, essay.content),
        describe: (raw) => ({ features: countArray(raw, "features") }),
      });
    case "high_score_h4_h5":
      return runValidatedPass({
        ...common,
        label: "High-Score Feature H4–H5",
        messages: [...highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_B)), ...repair],
        validate: (raw) => validateHighScoreAnalysis(raw, HIGH_SCORE_PASS_B, essay.content),
        describe: (raw) => ({ features: countArray(raw, "features") }),
      });
  }
}

/**
 * 依這一次的結果更新逐支狀態。就地修改 progress。
 *
 * 抽出來是為了能單獨測——這裡是整個設計裡最危險的一段：判斷錯了不是壞掉，
 * 是安靜地丟掉已經付過錢的結果，或是無限重試下去。
 */
export function applyPassOutcomes(
  progress: Stage1Progress,
  outcomes: { label: string; pass: PassOutcome<unknown> }[],
): void {
  for (const { label, pass } of outcomes) {
    const before = progress[label] ?? { state: "PENDING" as PassState, attempts: 0 };
    const attempts = before.attempts + pass.attempts;

    if (isPassOk(pass)) {
      // 通過了就定案。之後任何一次請求都不會再碰它。
      progress[label] = { state: "VALID", attempts, value: pass.value };
      continue;
    }

    const failure = pass as PassFailure;
    const outcome = failure.telemetry.finalOutcome;
    // 不可重試的錯誤（例如 401 金鑰錯）再花一次請求也是一樣的結果。
    // 429 與 5xx 是暫時性的，值得重試。
    const worthRetrying =
      outcome !== "HTTP_ERROR" ||
      failure.telemetry.records.some((r) => r.httpStatus === 429 || (r.httpStatus ?? 0) >= 500);
    const budgetLeft = attempts < MAX_PASS_ATTEMPTS;

    progress[label] = {
      state: worthRetrying && budgetLeft ? "RETRY_REQUIRED" : "FAILED",
      attempts,
      lastDetail: failure.detail,
      // 逐次的缺漏清單完整保留在 telemetry；這裡留一份是為了組下一次的修正指示。
      lastIssues: failure.issues.length > 0 ? failure.issues : undefined,
      lastRaw: failure.lastRaw,
      // 保留上一次成功的結果（如果有的話）——理論上不會走到，但萬一狀態機
      // 有 bug，寧可留著已付費的資料，也不要靜靜地把它抹掉。
      ...(before.state === "VALID" ? { value: before.value } : {}),
    };
  }
}

/** 逐支狀態的濃縮版，放進回應讓前端與人都看得懂現在卡在哪。 */
function passStates(progress: Stage1Progress): Record<string, string> {
  return Object.fromEntries(
    STAGE1_PASSES.map((l) => [l, `${progress[l].state}(${progress[l].attempts})`]),
  );
}

/**
 * 把這一次請求的量測併進既有的量測，不覆蓋。
 * 跨請求的重試要看得到「第 1 次請求跑了什麼、第 2 次請求跑了什麼」。
 */
function mergeTelemetry(
  existing: unknown,
  outcomes: { label: string; pass: PassOutcome<unknown> }[],
): Record<string, PassTelemetry> {
  const merged: Record<string, PassTelemetry> =
    existing && typeof existing === "object" ? { ...(existing as Record<string, PassTelemetry>) } : {};

  for (const { label, pass } of outcomes) {
    const prior = merged[label];
    merged[label] = prior
      ? {
          ...pass.telemetry,
          attempts: prior.attempts + pass.telemetry.attempts,
          totalLatencyMs: prior.totalLatencyMs + pass.telemetry.totalLatencyMs,
          retried: true,
          hitDeadline: prior.hitDeadline || pass.telemetry.hitDeadline,
          records: [
            ...prior.records,
            ...pass.telemetry.records.map((r) => ({ ...r, attempt: prior.records.length + r.attempt })),
          ],
        }
      : pass.telemetry;
  }
  return merged;
}

/** 回應裡給人一眼看懂的濃縮版；完整紀錄在資料庫的 stage1_telemetry。 */
function telemetrySummary(telemetry: Record<string, PassTelemetry>) {
  return Object.fromEntries(
    Object.entries(telemetry).map(([label, t]) => [
      label,
      {
        attempts: t.attempts,
        totalLatencyMs: t.totalLatencyMs,
        finalOutcome: t.finalOutcome,
        retried: t.retried,
        hitDeadline: t.hitDeadline,
        perAttempt: t.records.map((r) => ({
          attempt: r.attempt,
          latencyMs: r.latencyMs,
          outcome: r.outcome,
          issueCount: r.issueCount,
          responseChars: r.responseChars,
          completionTokens: r.completionTokens,
          shape: r.shape,
        })),
      },
    ]),
  );
}

/* ──────────────── 請求 B：Stage 2 綜合層 ──────────────── */

/**
 * 這條路徑同時是「正常流程的請求 B」與「綜合層失敗後的重試」——兩者的動作完全
 * 一樣：讀已落地的四軸、產生摘要、驗證 refs、才 COMPLETED。差別只在進來時
 * synthesis_status 是 PENDING 還是 FAILED，而那個判斷在資料庫的 RPC 裡。
 *
 * 這裡不重跑、也不可能重跑 Stage 1：四軸資料在 ANALYZED 之後由 trigger 凍結。
 */
async function runSynthesisOnly(ctx: RunContext) {
  const admin = ctx.admin;
  const stage2StartedAt = Date.now();

  const { data: row, error: readError } = await admin
    .from("writing_analyses")
    .select(
      "id, status, synthesis_status, synthesis_started_at, competency_analysis, error_analysis, high_score_feature_analysis",
    )
    .eq("essay_id", ctx.essayId)
    .order("analysis_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError || !row) {
    return fail(ctx.res, 404, "找不到可跑綜合層的分析");
  }
  if (row.status !== "ANALYZED") {
    return fail(
      ctx.res,
      409,
      row.status === "COMPLETED"
        ? "這篇分析已經完成，綜合層不需要再跑"
        : `只有四軸已驗證完成（ANALYZED）的分析才能跑綜合層，目前為 ${row.status}`,
    );
  }

  // ── 重複請求的防護 ───────────────────────────────────────────
  // synthesis_status = RUNNING 代表另一次請求 B 正在飛。RPC 本來就會擋，
  // 但那會是一句看不懂的資料庫錯誤，而且卡住的 RUNNING（上一次執行被平台砍掉）
  // 會讓這一列永遠重試不了。所以先自己判斷：還在窗內就 409，超過窗就收成
  // FAILED（RUNNING → FAILED 是合法轉移），讓 RPC 能把它推回 RUNNING。
  if (row.synthesis_status === "RUNNING") {
    if (isStillInFlight(row.synthesis_started_at)) {
      return fail(ctx.res, 409, "這篇作文的綜合層正在進行中，請等它結束再試");
    }
    await admin
      .from("writing_analyses")
      .update({
        synthesis_status: "FAILED",
        synthesis_failed_at: new Date().toISOString(),
        synthesis_error_detail: "上一次綜合層執行沒有收尾（可能被平台中斷），已收成 FAILED 以便重試",
      })
      .eq("id", row.id);
  }

  // 走呼叫者身分：資料庫再確認一次是管理員，並把 synthesis_status 推到 RUNNING。
  const { error: retryError } = await ctx.caller.rpc("writing_retry_synthesis", {
    p_analysis_id: row.id,
  });
  if (retryError) {
    return fail(ctx.res, 409, retryError.message);
  }

  const highScore = row.high_score_feature_analysis as HighScoreAnalysis;
  const synthesis = await performSynthesis({
    admin,
    analysisId: row.id,
    competency: row.competency_analysis as CompetencyAnalysis,
    errors: row.error_analysis as ErrorAnalysis,
    highScore: [highScore],
    apiKey: ctx.apiKey,
    signal: ctx.signal,
    alreadyRunning: true,
  });

  return ctx.res.status(synthesis.ok ? 200 : 502).json({
    analysisId: row.id,
    stage: "synthesis",
    status: synthesis.ok ? "COMPLETED" : "ANALYZED",
    synthesisStatus: synthesis.ok ? "COMPLETED" : "FAILED",
    reportReady: synthesis.ok,
    stage2LatencyMs: Date.now() - stage2StartedAt,
    ...(synthesis.telemetry
      ? { stage2: telemetrySummary({ synthesis: synthesis.telemetry }).synthesis }
      : {}),
    ...(synthesis.telemetry?.hitDeadline ? { hitDeadline: true } : {}),
    // 綜合層失敗時明講四軸還在，老師才知道只要重跑摘要就好。
    ...(synthesis.ok
      ? {}
      : { error: synthesis.detail, retryable: true, note: "四軸分析已保留，可只重跑綜合層" }),
  });
}

/* ──────────────── 綜合層本體 ──────────────── */

interface SynthesisOutcome {
  ok: boolean;
  detail: string;
  telemetry?: PassTelemetry;
}

async function performSynthesis(args: {
  admin: SupabaseClient;
  analysisId: string;
  competency: CompetencyAnalysis;
  errors: ErrorAnalysis;
  highScore: readonly HighScoreAnalysis[];
  apiKey: string;
  signal: AbortSignal;
  alreadyRunning?: boolean;
}): Promise<SynthesisOutcome> {
  const { admin, analysisId } = args;

  if (!args.alreadyRunning) {
    await admin
      .from("writing_analyses")
      .update({
        synthesis_status: "RUNNING",
        synthesis_started_at: new Date().toISOString(),
        synthesis_attempt_count: 1,
      })
      .eq("id", analysisId);
  }

  // 綜合層只能引用 Stage 1 真的有證據的節點——這是紅線 A 與 C 的執行方式。
  const citable = collectCitableRefs(args.competency, args.errors, args.highScore);
  const digest = compressForSynthesis(args.competency, args.errors, args.highScore);

  const pass = await runValidatedPass({
    label: "Synthesis",
    messages: synthesisMessages(digest, [...citable]),
    validate: (raw) => validateSynthesis(raw, citable),
    apiKey: args.apiKey,
    signal: args.signal,
    maxTokens: 3000,
  });

  if (!isPassOk(pass)) {
    const failure = pass as PassFailure;
    await admin
      .from("writing_analyses")
      .update({
        synthesis_status: "FAILED",
        synthesis_failed_at: new Date().toISOString(),
        synthesis_error_detail: failure.detail,
        synthesis_validation_issues: failure.issues,
        synthesis_telemetry: failure.telemetry,
      })
      .eq("id", analysisId);
    return { ok: false, detail: failure.detail, telemetry: failure.telemetry };
  }

  const { error: writeError } = await admin
    .from("writing_analyses")
    .update({
      synthesis_status: "COMPLETED",
      synthesis_completed_at: new Date().toISOString(),
      overall_evaluation: pass.value.overall_evaluation,
      strengths: pass.value.strengths,
      needs_work: pass.value.needs_work,
      next_steps: pass.value.next_steps,
      synthesis_telemetry: pass.telemetry,
    })
    .eq("id", analysisId);

  if (writeError) {
    console.error("[analyze-writing] 寫入綜合層失敗:", writeError.message);
    return { ok: false, detail: "寫入綜合層結果失敗" };
  }

  // 只有到這裡，報告才算 ready。trigger 會再確認一次三軸與綜合層都齊備。
  const { error: completeError } = await admin
    .from("writing_analyses")
    .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
    .eq("id", analysisId);

  if (completeError) {
    console.error("[analyze-writing] 標記完成失敗:", completeError.message);
    return { ok: false, detail: "標記完成失敗" };
  }

  return { ok: true, detail: "", telemetry: pass.telemetry };
}

/* ──────────────── 失敗收尾 ──────────────── */

async function markFailed(
  admin: SupabaseClient,
  analysisId: string,
  failedPass: PassLabel,
  detail: string,
  issues: readonly ValidationIssue[],
  telemetry?: Record<string, PassTelemetry>,
  attempts?: number,
  progress?: unknown,
) {
  await admin
    .from("writing_analyses")
    .update({
      status: "FAILED",
      failed_at: new Date().toISOString(),
      failed_pass: failedPass,
      error_detail: detail,
      // 缺漏清單完整保留：讓「AI 忘了分析」永遠查得出來，
      // 而且永遠不會被誤讀成「學生沒有表現出來」。
      //
      // ⚠️ 這一欄只有【最後一次】嘗試的清單。attempt 1 驗證失敗、attempt 2 撞上
      // 期限時，這裡會是空陣列——重試的原因在 stage1_telemetry 的逐次紀錄裡。
      validation_issues: issues,
      ...(telemetry ? { stage1_telemetry: telemetry } : {}),
      ...(attempts !== undefined ? { attempt_count: attempts } : {}),
      // 已通過的那幾支保留下來，失敗不等於全部作廢。
      ...(progress ? { stage1_progress: progress } : {}),
    })
    .eq("id", analysisId);
}
