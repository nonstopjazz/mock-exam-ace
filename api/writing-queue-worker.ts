/**
 * POST /api/writing-queue-worker —— 作文分析佇列的 worker
 *
 * 一次呼叫做【一個工作單位】，然後踢下一棒。
 *
 * 為什麼一次只做一個單位：
 *   一篇作文不是一次請求跑得完。Stage 1 最多 4 次（某一支 pass 沒通過驗證
 *   就再跑一次），加綜合層 1 次，每一次都要吃滿 50 秒。Vercel 的 maxDuration
 *   是 60 秒，所以一次呼叫只塞得下一個單位。stage1_progress 讓已經 VALID 的
 *   pass 永遠不重跑，中斷的代價只有當下那一支。
 *
 * concurrency = 1：
 *   由 writing_queue_claim() 在資料庫層保證（advisory lock + 活租約檢查），
 *   不是靠這支程式自律，也不是靠前端停用按鈕。兩個 worker 同時打進來，
 *   其中一個必然拿到 BUSY 然後安靜退場。
 *
 * 佇列怎麼在瀏覽器關掉之後活下去：
 *   佇列是資料庫裡的 QUEUED 列，推進它的是這條自我串接的鏈。
 *   老師的瀏覽器只負責「排入」與「顯示」，從來不負責「推進」。
 *
 * 鏈斷掉了怎麼辦：
 *   平台把某一次呼叫砍掉，鏈就停了。租約會過期，工作會回到佇列，
 *   但沒有人會去認領它——所以收件匣有一顆「繼續處理佇列」按鈕，
 *   按下去就是再踢一腳。writing_queue_summary() 的 work_waiting 會告訴前端
 *   什麼時候該顯示那顆按鈕。
 *
 * 授權：只有 CRON_SECRET。fail closed——沒設就拒絕執行，不是放行。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { DeadlineExceeded } from "./_lib/deepseek.js";
import { kickWorker } from "./_lib/workerKick.js";
import { runStage1, runSynthesisOnly, type RunGate } from "./analyze-writing.js";
import type { VercelLikeRequest, VercelLikeResponse } from "./_lib/essayAuth.js";

export const config = {
  maxDuration: 60,
};

/** 分析本身的硬性期限，與 api/analyze-writing.ts 一致。 */
const DEADLINE_MS = 50_000;
/** 租約長度。比 DEADLINE_MS 長，讓正常結束的那一次永遠來得及自己放開。 */
const LEASE_SECONDS = 150;
/** 串接深度上限。純粹是失控保險，不影響佇列語意。 */
const MAX_CHAIN_DEPTH = 500;

interface ClaimResult {
  claimed: boolean;
  reason?: "BUSY" | "EMPTY";
  analysis_id?: string;
  essay_id?: string;
  mode?: "stage1" | "synthesis";
  attempts?: number;
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

/**
 * 假的 res。
 *
 * runStage1 / runSynthesisOnly 是為了 HTTP 端點寫的，結果寫進 res。worker 要的是
 * 那個結果本身，不是一個 HTTP 回應。與其把 879 行的分析邏輯改成回傳值
 * （那是真正會出錯的重寫），不如給它一個把寫入接下來的 res——
 * 分析流程一個字都不必動。
 */
function captureResponse(): VercelLikeResponse & { captured: { status: number; body: unknown } } {
  const captured = { status: 0, body: undefined as unknown };
  const res = {
    captured,
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
    },
    setHeader() {
      /* worker 不需要 header */
    },
    end() {
      /* 同上 */
    },
  };
  return res;
}

/**
 * worker 的 gate：兩個需要身分的動作都走 service_role 專用的 RPC。
 *
 * 刻意【不】重用老師端那兩支（writing_enqueue_analysis /
 * writing_retry_synthesis）——它們的語意是「登入的管理員按下按鈕」，
 * 把 service_role 加進去會讓那句話不再成立。
 *
 * 還有一個更重要的差別：worker 的 ensureAnalysis 永遠不建立新的分析列。
 * 工作只由老師排入，worker 只推進既有的工作。worker 生不出工作，
 * 也就不可能因為一個 bug 而自己替全班的作文開始花錢。
 */
function workerGate(admin: SupabaseClient): RunGate {
  return {
    async ensureAnalysis(essayId) {
      const { data, error } = await admin.rpc("writing_queue_ensure_analysis", {
        p_essay_id: essayId,
      });
      if (error) return { error: error.message };
      if (typeof data !== "string") {
        return { error: "這篇作文目前沒有正在飛行的分析（可能已完成或已被收成失敗）" };
      }
      return { id: data };
    },
    async beginSynthesis(analysisId) {
      const { error } = await admin.rpc("writing_queue_begin_synthesis", {
        p_analysis_id: analysisId,
      });
      return error ? { error: error.message } : {};
    },
  };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // FAIL CLOSED。這支端點會花錢呼叫 DeepSeek，開著門的代價是帳單。
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[writing-queue-worker] CRON_SECRET is not configured; refusing to run.");
    return res.status(503).json({ error: "CRON_SECRET_NOT_CONFIGURED" });
  }
  const authHeader = firstValue(req.headers?.authorization ?? req.headers?.Authorization);
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!provided || !secretMatches(provided, cronSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Missing environment variables" });
  }
  if (!apiKey) {
    console.error("[writing-queue-worker] 缺少 DEEPSEEK_API_KEY");
    return res.status(503).json({ error: "DEEPSEEK_API_KEY_NOT_CONFIGURED" });
  }

  const body = (req.body ?? {}) as { depth?: number };
  const depth = typeof body.depth === "number" && body.depth >= 0 ? Math.floor(body.depth) : 0;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workerId = `${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}#${Date.now().toString(36)}`;

  // ── 認領 ────────────────────────────────────────────────────
  const { data: claimRaw, error: claimError } = await admin.rpc("writing_queue_claim", {
    p_worker: workerId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claimError) {
    console.error("[writing-queue-worker] 認領失敗:", claimError.message);
    return res.status(500).json({ error: claimError.message });
  }

  const claim = (claimRaw ?? {}) as ClaimResult;

  if (!claim.claimed) {
    // BUSY：另一個 worker 正在跑，它做完會自己踢下一棒，這裡什麼都不做。
    // EMPTY：佇列空了，鏈到此為止。
    console.log("[writing-queue-worker]", JSON.stringify({ depth, ...claim }));
    return res.status(200).json({ worked: false, ...claim });
  }

  const { analysis_id: analysisId, essay_id: essayId, mode } = claim;
  if (!analysisId || !essayId || !mode) {
    return res.status(500).json({ error: "認領結果不完整" });
  }

  // ── 做一個單位 ──────────────────────────────────────────────
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DeadlineExceeded(DEADLINE_MS, Date.now() - startedAt)),
    DEADLINE_MS,
  );

  const inner = captureResponse();
  let crashed: string | null = null;

  try {
    const ctx = {
      res: inner,
      admin,
      caller: admin, // gate 覆蓋了所有需要身分的動作，這裡不會被用到
      essayId,
      apiKey,
      signal: controller.signal,
      gate: workerGate(admin),
    };
    if (mode === "synthesis") {
      await runSynthesisOnly(ctx);
    } else {
      await runStage1(ctx);
    }
  } catch (err) {
    crashed = err instanceof Error ? err.message : String(err);
    console.error("[writing-queue-worker] 分析過程未預期的錯誤:", crashed);
  } finally {
    clearTimeout(timer);
  }

  // ── 放開租約 ────────────────────────────────────────────────
  // 一定要做，即使上面炸了：不放開的話這一列要等 150 秒租約到期才動得了，
  // 整條佇列會停在原地。終局的列（已 COMPLETED / FAILED）這一支不會動它們。
  const { error: releaseError } = await admin.rpc("writing_queue_release", {
    p_analysis_id: analysisId,
  });
  if (releaseError) {
    console.error("[writing-queue-worker] 放開租約失敗:", releaseError.message);
  }

  const result = {
    depth,
    essayId,
    mode,
    attempts: claim.attempts ?? 0,
    innerStatus: inner.captured.status,
    elapsedMs: Date.now() - startedAt,
    ...(crashed ? { crashed } : {}),
  };
  console.log("[writing-queue-worker]", JSON.stringify(result));

  // ── 踢下一棒 ────────────────────────────────────────────────
  // 這一篇成功或失敗都要踢：一篇失敗【不得】停下整批，下一篇照跑。
  let chained = false;
  if (depth < MAX_CHAIN_DEPTH) {
    chained = (await kickWorker(depth + 1)).kicked;
  } else {
    console.warn("[writing-queue-worker] 已達串接深度上限，停止自我串接");
  }

  return res.status(200).json({ worked: true, chained, ...result });
}
