/**
 * POST /api/speaking-queue-worker —— 口說批改佇列的 worker
 *
 * 一次呼叫做【一件】批改，然後踢下一棒。
 *
 * 與作文 worker 的差別：
 *   作文一篇要 Stage 1 四支 pass + 綜合層，一次請求跑不完，所以有
 *   stage1_progress 讓已經過的 pass 不重跑。口說是一次呼叫——下載音訊、
 *   丟給模型、寫回結果，十幾二十秒就結束。所以這裡沒有 stage、沒有續跑點，
 *   失敗就是整件重來。
 *
 * concurrency = 1：
 *   由 speaking_grading_claim() 在資料庫層保證（advisory lock 778812 +
 *   活租約檢查）。這支程式不自律也繞不過去。
 *   ⚠️ 778812 與作文的 778811 不同——口說在跑不會擋住作文。
 *
 * 鏈斷掉了怎麼辦：
 *   租約會過期，工作回到佇列，但沒有人會去認領。收件匣有一顆
 *   「繼續處理佇列」按鈕，按下去就是再踢一腳。
 *   speaking_grading_summary() 的 work_waiting 決定那顆按鈕出不出現。
 *
 * 授權：只有 CRON_SECRET。fail closed——沒設就拒絕執行，不是放行。
 */

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { kickWorker } from "./_lib/workerKick.js";
import { gradeSpeaking, SpeakingGradeError } from "./_lib/geminiSpeaking.js";
import type { VercelLikeRequest, VercelLikeResponse } from "./_lib/essayAuth.js";

export const config = {
  maxDuration: 60,
};

const BUCKET = "speaking-recordings";
/** 批改本身的硬性期限，留 10 秒給下載音訊與寫回結果。 */
const DEADLINE_MS = 45_000;
/** 租約長度。比 DEADLINE_MS 長，讓正常結束的那一次來得及自己放開。 */
const LEASE_SECONDS = 150;
/** 串接深度上限。純粹是失控保險，不影響佇列語意。 */
const MAX_CHAIN_DEPTH = 500;

interface ClaimResult {
  claimed: boolean;
  reason?: "BUSY" | "EMPTY";
  analysis_id?: string;
  recording_id?: string;
  attempts?: number;
  storage_path?: string;
  mime_type?: string;
  prompt_part?: number;
  prompt_text?: string;
  duration_seconds?: number;
  expired?: number;
  failed?: number;
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // FAIL CLOSED。這支端點會花錢呼叫模型，開著門的代價是帳單。
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[speaking-queue-worker] CRON_SECRET is not configured; refusing to run.");
    return res.status(503).json({ error: "CRON_SECRET_NOT_CONFIGURED" });
  }
  const authHeader = firstValue(req.headers?.authorization ?? req.headers?.Authorization);
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!provided || !secretMatches(provided, cronSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Missing environment variables" });
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("[speaking-queue-worker] 缺少 GEMINI_API_KEY");
    return res.status(503).json({ error: "GEMINI_API_KEY_NOT_CONFIGURED" });
  }

  const body = (req.body ?? {}) as { depth?: number };
  const depth = typeof body.depth === "number" && body.depth >= 0 ? Math.floor(body.depth) : 0;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workerId = `${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}#${Date.now().toString(36)}`;

  // ── 認領 ────────────────────────────────────────────────────
  const { data: claimRaw, error: claimError } = await admin.rpc("speaking_grading_claim", {
    p_worker: workerId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claimError) {
    console.error("[speaking-queue-worker] 認領失敗:", claimError.message);
    return res.status(500).json({ error: claimError.message });
  }

  const claim = (claimRaw ?? {}) as ClaimResult;

  if (!claim.claimed) {
    // BUSY：另一個 worker 正在跑，它做完會自己踢下一棒。
    // EMPTY：佇列空了，鏈到此為止。
    console.log("[speaking-queue-worker]", JSON.stringify({ depth, ...claim }));
    return res.status(200).json({ worked: false, ...claim });
  }

  const analysisId = claim.analysis_id;
  const storagePath = claim.storage_path;
  if (!analysisId || !storagePath) {
    return res.status(500).json({ error: "認領結果不完整" });
  }

  const deadlineAt = Date.now() + DEADLINE_MS;
  let outcome: "completed" | "failed" = "failed";
  let detail = "";

  try {
    // ── 下載音訊 ──────────────────────────────────────────────
    // 用 service_role 直接從 bucket 拿 bytes，不繞 signed URL：
    // 少一次往返，也少一個會過期的東西。
    const { data: blob, error: dlError } = await admin.storage.from(BUCKET).download(storagePath);
    if (dlError || !blob) {
      // 檔案不見了。重試也不會回來。
      throw new SpeakingGradeError("讀不到錄音檔，無法批改。", false);
    }

    const result = await gradeSpeaking({
      audio: await blob.arrayBuffer(),
      mimeType: claim.mime_type || "audio/webm",
      promptPart: claim.prompt_part ?? null,
      promptText: claim.prompt_text ?? null,
      deadlineAt,
    });

    const { data: ok, error: completeError } = await admin.rpc("speaking_grading_complete", {
      p_analysis_id: analysisId,
      p_transcript: result.transcript,
      p_fluency: result.fluency,
      p_lexical: result.lexical,
      p_grammar: result.grammar,
      p_pronunciation: result.pronunciation,
      p_overall: result.overall,
      p_feedback: result.feedback,
      p_suggestions: result.suggestions,
      p_model: result.model,
      p_telemetry: result.telemetry,
    });
    if (completeError) throw new SpeakingGradeError(completeError.message, true);
    if (ok !== true) throw new SpeakingGradeError("這件批改已經不在佇列裡了。", false);

    outcome = "completed";
  } catch (err) {
    const retryable = err instanceof SpeakingGradeError ? err.retryable : true;
    detail = err instanceof Error ? err.message : "批改失敗";

    // 🛑 一定要回報失敗，否則這一列會停在 ANALYZING 直到租約過期——
    //    白白佔住 concurrency = 1 的那個位置兩分半鐘。
    const { error: failError } = await admin.rpc("speaking_grading_fail", {
      p_analysis_id: analysisId,
      p_detail: detail,
      p_retryable: retryable,
    });
    if (failError) {
      console.error("[speaking-queue-worker] 連失敗都回報不了:", failError.message);
    }
  }

  // ── 踢下一棒 ────────────────────────────────────────────────
  // 不管這一件成功或失敗都要踢：一件失敗不該讓整批停下來。
  let chained = false;
  if (depth < MAX_CHAIN_DEPTH) {
    chained = (await kickWorker(depth + 1, "/api/speaking-queue-worker")).kicked;
  }

  console.log(
    "[speaking-queue-worker]",
    JSON.stringify({ depth, analysisId, outcome, detail: detail || undefined, chained }),
  );

  return res.status(200).json({ worked: true, outcome, chained });
}
