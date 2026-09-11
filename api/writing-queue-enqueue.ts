/**
 * POST /api/writing-queue-enqueue —— 老師把多篇作文排入分析佇列
 *
 * 請求：
 *   { "essayIds": ["<uuid>", ...], "force": false }   排入並踢第一腳
 *   { "kickOnly": true }                              只踢一腳（「繼續處理佇列」）
 *
 * 這支端點【不做分析】，只做兩件事：
 *   1. 呼叫 writing_enqueue_analysis_batch()，把工作寫進資料庫
 *   2. 踢一腳給 worker
 *
 * 所以老師的瀏覽器在第 2 步之後就沒事了。關掉頁面、關掉電腦，佇列照跑——
 * 推進它的是 worker 的自我串接，不是這個分頁。
 *
 * 為什麼「排入」與「推進」要分兩支端點：
 * 排入必須是老師的身分（資料庫的 is_admin() 要擋得到），推進必須是排程的
 * 身分（沒有人的 JWT）。把兩件事塞進同一支端點，等於讓一個入口同時接受
 * 兩種身分——那是授權漏洞最常見的長相。
 *
 * 授權：登入的管理員。逐篇的狀態檢查在資料庫的 RPC 裡再做一次。
 */

import { isDenied, requireAdmin, type VercelLikeRequest, type VercelLikeResponse } from "./_lib/essayAuth.js";
import { kickWorker } from "./_lib/workerKick.js";

export const config = {
  maxDuration: 30,
};

/** 與 writing_enqueue_analysis_batch() 裡的上限一致。兩層都擋是刻意的。 */
const MAX_BATCH = 50;

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "只接受 POST" });
  }

  // 授權排在所有其他檢查之前：參數格式的錯誤訊息也是資訊，
  // 未通過授權的呼叫端只該看到 401/403。
  const access = await requireAdmin(req);
  if (isDenied(access)) {
    return res.status(access.status).json({ error: access.error });
  }

  const body = (req.body ?? {}) as { essayIds?: unknown; force?: unknown; kickOnly?: unknown };

  // ── 只踢一腳：鏈斷掉之後的人工重新點火 ──────────────────────────
  // 不排入任何新工作，所以按幾次都沒有副作用：worker 認領不到就安靜退場。
  if (body.kickOnly === true) {
    const kick = await kickWorker(0);
    return res.status(200).json({ kickOnly: true, ...kick });
  }

  const essayIds = Array.isArray(body.essayIds)
    ? body.essayIds.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];

  if (essayIds.length === 0) {
    return res.status(400).json({ error: "沒有選取任何作文" });
  }
  if (essayIds.length > MAX_BATCH) {
    return res.status(400).json({ error: `一次最多排入 ${MAX_BATCH} 篇，這次是 ${essayIds.length} 篇` });
  }

  // 走呼叫者身分：資料庫的 is_admin() 再擋一次，並逐篇檢查
  // 「已送出、有正規文字、不是已完成」。應用層擋下來不算數，兩層都要成立。
  const { data, error } = await access.caller.rpc("writing_enqueue_analysis_batch", {
    p_essay_ids: essayIds,
    p_force: body.force === true,
  });

  if (error) {
    console.error("[writing-queue-enqueue] 排入失敗:", error.message);
    return res.status(400).json({ error: error.message });
  }

  // 踢第一腳。踢不出去不是致命錯誤——工作已經寫進資料庫了，
  // 老師可以按「繼續處理佇列」，或等下一次排入時一起被帶動。
  const kick = await kickWorker(0);

  return res.status(200).json({ ...(data as object), kicked: kick.kicked, kickReason: kick.reason });
}
