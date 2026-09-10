/**
 * GET|POST /api/writing-images-cleanup   —— 每天一次的影像清理（Vercel Cron）
 *
 * 只有排程可以呼叫（CRON_SECRET）。學生與老師都碰不到這支端點。
 *
 * 保存策略（產品決策，2026-09）：
 *   RAW        送出後條件齊備即刪 —— 通常是隔天的這一次清理
 *   ARCHIVE    送出滿 60 天刪除
 *   ABANDONED  草稿放置滿 30 天，原檔與封存圖一起帶走
 *
 * 🛑 什麼可以刪，完全由資料庫的 writing_images_cleanup_candidates() 判斷。
 *    這支程式只負責「照名單刪檔案，然後回報刪了什麼」。
 *    正規化失敗、辨識沒成功、文字沒落地、還沒送出 —— 任一成立就不會出現在名單裡。
 *
 * 順序固定：先刪 Storage 的檔案，成功之後才標記資料庫。
 * 反過來會留下「資料庫說刪了、檔案還在」的孤兒，而且再也沒有人會去找它。
 *
 * 試跑：?dryRun=1 只列出要刪什麼、不真的刪。上線前先這樣跑幾天看數字。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const config = {
  maxDuration: 60,
};

/** 一次最多處理幾個檔案。跑不完明天繼續——不會有一次刪爆的可能。 */
const BATCH_LIMIT = 200;

type CleanupKind = "RAW" | "ARCHIVE" | "ABANDONED";
const KINDS: CleanupKind[] = ["RAW", "ARCHIVE", "ABANDONED"];

interface Candidate {
  image_id: string;
  essay_id: string;
  storage_bucket: string;
  storage_path: string;
}

/**
 * Vercel 的 req / res 在這個專案沒有型別定義（api/_lib/essayAuth.ts 的那組沒有 query）。
 * 這裡只宣告這支端點真正用到的欄位，比 any 精確，也不必為此裝 @vercel/node。
 */
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

/**
 * 刪掉一批檔案，回傳成功標記的筆數。
 *
 * Storage 回報「檔案不存在」視同成功：那表示上一次跑到一半斷了，
 * 檔案已經沒了但時間戳沒寫上。這種情況要補寫時間戳，不是每天重試一次直到天荒地老。
 */
async function purge(
  admin: SupabaseClient,
  bucket: string,
  candidates: Candidate[],
): Promise<{ removed: number; marked: number; errors: string[] }> {
  if (candidates.length === 0) return { removed: 0, marked: 0, errors: [] };

  const paths = candidates.map((c) => c.storage_path);
  const { data, error } = await admin.storage.from(bucket).remove(paths);

  if (error) {
    // 整批失敗（權限、bucket 不存在）：什麼都不標記，明天再來。
    return { removed: 0, marked: 0, errors: [`${bucket}: ${error.message}`] };
  }

  const removed = data?.length ?? 0;
  const { data: marked, error: markError } = await admin.rpc("writing_images_mark_deleted", {
    p_image_ids: candidates.map((c) => c.image_id),
    p_bucket: bucket,
  });

  if (markError) {
    // 檔案已經刪了但標記失敗——下一次會再撈到同一批，remove() 回報不存在，
    // 然後標記成功。所以這裡不需要補償邏輯，只要記下來。
    return { removed, marked: 0, errors: [`${bucket} mark: ${markError.message}`] };
  }

  return { removed, marked: (marked as number) ?? 0, errors: [] };
}

export default async function handler(req: CronRequest, res: CronResponse) {
  // Vercel Cron 用 GET 呼叫
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // FAIL CLOSED：沒設 CRON_SECRET 就拒絕執行，而不是放行。
  // 這支端點會刪檔案，開著門的代價是有人可以把學生的作文照片清光。
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[writing-images-cleanup] CRON_SECRET is not configured; refusing to run.");
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

  const dryRunParam = firstValue(req.query?.dryRun);
  const dryRun = dryRunParam === "1" || dryRunParam === "true";
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report: Record<string, unknown> = { dryRun, at: new Date().toISOString() };
  const errors: string[] = [];

  for (const kind of KINDS) {
    const { data, error } = await admin.rpc("writing_images_cleanup_candidates", {
      p_kind: kind,
      p_limit: BATCH_LIMIT,
    });

    if (error) {
      console.error(`[writing-images-cleanup] ${kind} 候選查詢失敗:`, error.message);
      errors.push(`${kind}: ${error.message}`);
      report[kind] = { candidates: 0, removed: 0, marked: 0 };
      continue;
    }

    const candidates = (data ?? []) as Candidate[];
    if (dryRun) {
      report[kind] = {
        candidates: candidates.length,
        sample: candidates.slice(0, 3).map((c) => `${c.storage_bucket}/${c.storage_path}`),
      };
      continue;
    }

    // ABANDONED 一批裡可能同時有兩個 bucket 的檔案，依 bucket 分開刪。
    const byBucket = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const list = byBucket.get(c.storage_bucket) ?? [];
      list.push(c);
      byBucket.set(c.storage_bucket, list);
    }

    let removed = 0;
    let marked = 0;
    for (const [bucket, list] of byBucket) {
      const result = await purge(admin, bucket, list);
      removed += result.removed;
      marked += result.marked;
      errors.push(...result.errors);
    }

    report[kind] = { candidates: candidates.length, removed, marked };
  }

  if (errors.length > 0) {
    report.errors = errors;
    console.error("[writing-images-cleanup] 有錯誤:", errors.join(" | "));
  }

  console.log("[writing-images-cleanup]", JSON.stringify(report));
  return res.status(200).json(report);
}
