/**
 * GET|POST /api/speaking-cleanup —— 每天一次的錄音清理（Vercel Cron）
 *
 * 只有排程可以呼叫（CRON_SECRET）。學生與老師都碰不到這支端點。
 *
 * 保存策略（產品決策）：錄音檔 90 天，到期刪除。
 *   ⚠️ 90 天從 uploaded_at 起算，不是 created_at。學生可能開了一次練習
 *      就跑掉、三個月後才回來錄——用 created_at 的話那個檔案一上傳就
 *      符合刪除條件。這條規則寫在 speaking_cleanup_candidates() 裡。
 *
 * 🛑 什麼可以刪，完全由資料庫判斷。這支程式只負責「照名單刪檔案，
 *    然後回報刪了什麼」。
 *
 * 🛑 練習紀錄【永遠留著】。刪掉的只有 Storage 裡的音訊檔，
 *    speaking_recordings 那一列還在——練了幾次、練了哪些題、什麼時候練的
 *    都查得到，畫面上只是不再提供播放。批改結果（分數、逐字稿、回饋）
 *    也不受影響：那些是文字，不佔空間，而且是學生真正想留下來的東西。
 *
 * 順序固定：先刪 Storage 的檔案，成功之後才標記資料庫。
 * 反過來會留下「資料庫說刪了、檔案還在」的孤兒，而且再也沒有人找得到它。
 *
 * 試跑：?dryRun=1 只列出要刪什麼、不真的刪。上線前先這樣跑幾天看數字。
 */

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const config = {
  maxDuration: 60,
};

const BUCKET = "speaking-recordings";
/** 一次最多處理幾個檔案。跑不完明天繼續——不會有一次刪爆的可能。 */
const BATCH_LIMIT = 200;

interface Candidate {
  recording_id: string;
  storage_path: string;
}

interface CronRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

interface CronResponse {
  status(code: number): CronResponse;
  json(body: unknown): void;
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req: CronRequest, res: CronResponse) {
  // Vercel Cron 用 GET 呼叫
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // FAIL CLOSED：沒設 CRON_SECRET 就拒絕執行，而不是放行。
  // 這支端點會刪檔案，開著門的代價是有人可以把學生的錄音清光。
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[speaking-cleanup] CRON_SECRET is not configured; refusing to run.");
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

  const dryRun = firstValue(req.query?.dryRun) === "1";
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("speaking_cleanup_candidates", {
    p_limit: BATCH_LIMIT,
  });
  if (error) {
    console.error("[speaking-cleanup] 取清單失敗:", error.message);
    return res.status(500).json({ error: error.message });
  }

  const candidates = (data ?? []) as Candidate[];

  if (dryRun) {
    return res.status(200).json({
      dryRun: true,
      candidates: candidates.length,
      // 只回路徑的前綴，不回完整路徑——那是學生的 uid。
      sample: candidates.slice(0, 3).map((c) => c.recording_id),
    });
  }

  if (candidates.length === 0) {
    return res.status(200).json({ candidates: 0, removed: 0, marked: 0 });
  }

  const { data: removedData, error: removeError } = await admin.storage
    .from(BUCKET)
    .remove(candidates.map((c) => c.storage_path));

  if (removeError) {
    // 整批失敗（權限、bucket 不存在）：什麼都不標記，明天再來。
    console.error("[speaking-cleanup] 刪檔失敗:", removeError.message);
    return res.status(500).json({ error: removeError.message });
  }

  // Storage 回報「檔案不存在」視同成功：那表示上一次跑到一半斷了，
  // 檔案已經沒了但時間戳沒寫上。要補寫時間戳，不是每天重試到天荒地老。
  const { data: marked, error: markError } = await admin.rpc("speaking_mark_deleted", {
    p_recording_ids: candidates.map((c) => c.recording_id),
  });

  if (markError) {
    // 檔案已經刪了但標記失敗——下一次會再撈到同一批，remove() 回報不存在，
    // 然後標記成功。所以這裡不需要補償邏輯，只要記下來。
    console.error("[speaking-cleanup] 標記失敗:", markError.message);
    return res.status(500).json({
      candidates: candidates.length,
      removed: removedData?.length ?? 0,
      marked: 0,
      error: markError.message,
    });
  }

  const result = {
    candidates: candidates.length,
    removed: removedData?.length ?? 0,
    marked: (marked as number) ?? 0,
  };
  console.log("[speaking-cleanup]", JSON.stringify(result));
  return res.status(200).json(result);
}
