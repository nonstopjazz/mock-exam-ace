/**
 * POST /api/analyze-writing
 *
 * 觸發（或重跑）一篇作文的 AI 分析。【僅限管理員】。
 *
 * 請求：
 *   { "essayId": "<uuid>", "mode": "full" | "synthesis" }
 *   mode 預設 "full"。"synthesis" 只重跑綜合層，不動已驗證的四軸資料。
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
 * 執行結構：
 *   Stage 1  四支平行（Promise.all），各自獨立驗證，任何一支失敗 → FAILED
 *   Stage 2  綜合層，只吃 Stage 1 的壓縮摘要
 *
 * 為什麼是四支而不是一支：29 個高分特徵加 23 個能力節點的完整覆蓋，
 * 單一 prompt 的輸出量會逼近 token 上限，而且一支失敗就全毀。
 * 拆開之後總延遲等於最慢那一支，不是四支相加。
 *
 * maxDuration 是 60 秒（與 api/generate-pack-audio.ts 相同），所以這裡設一個
 * 50 秒的硬性期限。超時的那一次標 FAILED 並說明可以重試，不會留下半套資料。
 */

import {
  isDenied,
  requireEssayAccess,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from "./_lib/essayAuth";
import {
  isPassOk,
  runValidatedPass,
  DEFAULT_MODEL,
  type PassFailure,
  type PassOutcome,
} from "./_lib/deepseek";
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
} from "./_lib/writingPrompts";
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
} from "../src/lib/writing/analysisContract";
import { WRITING_TAXONOMY_VERSION } from "../src/lib/writing/taxonomy";

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

function fail(res: VercelLikeResponse, status: number, error: string) {
  res.status(status).json({ error });
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return fail(res, 405, "只接受 POST");
  }

  const body = (req.body ?? {}) as { essayId?: string; mode?: string };
  const essayId = typeof body.essayId === "string" ? body.essayId : "";
  const mode = body.mode === "synthesis" ? "synthesis" : "full";

  // ── 授權：碰到 DeepSeek 或 service-role 之前 ────────────────────
  const access = await requireEssayAccess(req, essayId, { adminOnly: true });
  if (isDenied(access)) {
    return fail(res, access.status, access.error);
  }
  const { admin, caller } = access;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("[analyze-writing] 缺少 DEEPSEEK_API_KEY");
    return fail(res, 500, "伺服器設定不完整");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);

  try {
    if (mode === "synthesis") {
      return await runSynthesisOnly({ res, admin, caller, essayId, apiKey, signal: controller.signal });
    }
    return await runFullAnalysis({ res, admin, caller, essayId, apiKey, signal: controller.signal });
  } catch (err) {
    console.error("[analyze-writing] 未預期的錯誤:", err instanceof Error ? err.message : err);
    return fail(res, 500, "分析過程發生未預期的錯誤");
  } finally {
    clearTimeout(timer);
  }
}

/* ──────────────── 完整分析 ──────────────── */

async function runFullAnalysis(ctx: RunContext) {
  const admin = ctx.admin;

  // 排入佇列走呼叫者身分，資料庫再擋一次「只有管理員能觸發」。
  const { data: analysisId, error: enqueueError } = await ctx.caller.rpc(
    "writing_enqueue_analysis",
    { p_essay_id: ctx.essayId },
  );
  if (enqueueError || typeof analysisId !== "string") {
    return fail(ctx.res, 400, enqueueError?.message ?? "無法排入分析");
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

  await admin
    .from("writing_analyses")
    .update({
      status: "ANALYZING",
      started_at: new Date().toISOString(),
      model: DEFAULT_MODEL,
      taxonomy_version: WRITING_TAXONOMY_VERSION,
      attempt_count: 1,
    })
    .eq("id", analysisId);

  // ── Stage 1：四支平行，各自獨立驗證 ─────────────────────────
  const shared = { apiKey: ctx.apiKey, signal: ctx.signal };
  const [competencyPass, errorPass, hsAPass, hsBPass] = await Promise.all([
    runValidatedPass({
      ...shared,
      label: "Writing Competency",
      messages: competencyMessages(essay),
      validate: validateCompetencyAnalysis,
    }),
    runValidatedPass({
      ...shared,
      label: "Writing Error",
      messages: errorMessages(essay),
      validate: validateErrorAnalysis,
    }),
    runValidatedPass({
      ...shared,
      label: "High-Score Feature H1–H3",
      messages: highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_A)),
      validate: (raw) => validateHighScoreAnalysis(raw, HIGH_SCORE_PASS_A),
    }),
    runValidatedPass({
      ...shared,
      label: "High-Score Feature H4–H5",
      messages: highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_B)),
      validate: (raw) => validateHighScoreAnalysis(raw, HIGH_SCORE_PASS_B),
    }),
  ]);

  // 任何一支沒過，就不發佈半套報告。
  const outcomes: { label: PassLabel; pass: PassOutcome<unknown> }[] = [
    { label: "competency", pass: competencyPass },
    { label: "error", pass: errorPass },
    { label: "high_score_h1_h3", pass: hsAPass },
    { label: "high_score_h4_h5", pass: hsBPass },
  ];
  const broken = outcomes.find((o) => !isPassOk(o.pass));
  if (broken) {
    const failure = broken.pass as PassFailure;
    await markFailed(admin, analysisId, broken.label, failure.detail, failure.issues);
    return ctx.res.status(502).json({
      analysisId,
      status: "FAILED",
      failedPass: broken.label,
      error: failure.detail,
      issueCount: failure.issues.length,
    });
  }

  const stage1: Stage1Result = {
    competency: (competencyPass as { value: CompetencyAnalysis }).value,
    errors: (errorPass as { value: ErrorAnalysis }).value,
    highScoreA: (hsAPass as { value: HighScoreAnalysis }).value,
    highScoreB: (hsBPass as { value: HighScoreAnalysis }).value,
  };

  // 四軸先落地，再跑綜合層。這一步之後三軸就被資料庫凍結了，
  // 綜合層失敗也不會讓這些昂貴的結果消失。
  const mergedHighScore: HighScoreAnalysis = {
    taxonomy_version: WRITING_TAXONOMY_VERSION,
    features: [...stage1.highScoreA.features, ...stage1.highScoreB.features],
  };

  const { error: persistError } = await admin
    .from("writing_analyses")
    .update({
      status: "ANALYZED",
      competency_analysis: stage1.competency,
      error_analysis: stage1.errors,
      high_score_feature_analysis: mergedHighScore,
      synthesis_status: "PENDING",
    })
    .eq("id", analysisId);

  if (persistError) {
    console.error("[analyze-writing] 寫入四軸結果失敗:", persistError.message);
    return fail(ctx.res, 500, "寫入分析結果失敗");
  }

  // ── Stage 2 ──────────────────────────────────────────────────
  const synthesis = await performSynthesis({
    admin,
    analysisId,
    competency: stage1.competency,
    errors: stage1.errors,
    highScore: [stage1.highScoreA, stage1.highScoreB],
    apiKey: ctx.apiKey,
    signal: ctx.signal,
  });

  return ctx.res.status(synthesis.ok ? 200 : 502).json({
    analysisId,
    status: synthesis.ok ? "COMPLETED" : "ANALYZED",
    synthesisStatus: synthesis.ok ? "COMPLETED" : "FAILED",
    reportReady: synthesis.ok,
    // 綜合層失敗時明講四軸還在，老師才知道只要重跑摘要就好。
    ...(synthesis.ok
      ? {}
      : { error: synthesis.detail, retryable: true, note: "四軸分析已保留，可只重跑綜合層" }),
  });
}

/* ──────────────── 只重跑綜合層 ──────────────── */

async function runSynthesisOnly(ctx: RunContext) {
  const admin = ctx.admin;

  const { data: row, error: readError } = await admin
    .from("writing_analyses")
    .select(
      "id, status, synthesis_status, competency_analysis, error_analysis, high_score_feature_analysis",
    )
    .eq("essay_id", ctx.essayId)
    .order("analysis_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError || !row) {
    return fail(ctx.res, 404, "找不到可重跑的分析");
  }
  if (row.status !== "ANALYZED") {
    return fail(ctx.res, 409, `只有四軸已驗證完成的分析才能重跑綜合層，目前為 ${row.status}`);
  }

  // 同樣走呼叫者身分：資料庫再確認一次是管理員，並把 synthesis_status 推回 RUNNING。
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
    status: synthesis.ok ? "COMPLETED" : "ANALYZED",
    synthesisStatus: synthesis.ok ? "COMPLETED" : "FAILED",
    reportReady: synthesis.ok,
    ...(synthesis.ok
      ? {}
      : { error: synthesis.detail, retryable: true, note: "四軸分析已保留，可再次重跑綜合層" }),
  });
}

/* ──────────────── 綜合層本體 ──────────────── */

interface SynthesisOutcome {
  ok: boolean;
  detail: string;
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
      })
      .eq("id", analysisId);
    return { ok: false, detail: failure.detail };
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

  return { ok: true, detail: "" };
}

/* ──────────────── 失敗收尾 ──────────────── */

async function markFailed(
  admin: SupabaseClient,
  analysisId: string,
  failedPass: PassLabel,
  detail: string,
  issues: readonly ValidationIssue[],
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
      validation_issues: issues,
    })
    .eq("id", analysisId);
}
