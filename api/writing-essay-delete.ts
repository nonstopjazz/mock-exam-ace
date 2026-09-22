/**
 * POST /api/writing-essay-delete —— 刪掉一篇還沒送出的作文
 *
 * 請求： { "essayId": "<uuid>" }
 * 回應： { deleted: true, files: { removed, missing } }
 *
 * 授權沿用 api/_lib/essayAuth.ts 的 requireEssayAccess()：學生只能刪自己的，
 * 管理員可以刪任何人的。授權通過之前 service-role client 不存在。
 *
 *
 * 為什麼需要這支端點（而不是直接開 RLS 的 DELETE 政策）
 *
 *   圖片作文的那一列是 Storage 檔案的【唯一索引】。列一被刪掉，writing_images
 *   跟著 cascade，bucket 裡的照片就再也沒有人找得到，連每天的清理工作都掃不到
 *   —— 永久佔用空間。relax_writing_image_checks.sql 因此把學生的 DELETE 政策
 *   收窄成只有 text 草稿可刪，並把圖片草稿交給「30 天後清理」。
 *
 *   但那個配套只清掉【檔案】：writing_images_cleanup_candidates('ABANDONED')
 *   回傳的是檔案，writing_submissions 那一列永遠不會消失。結果是學生看著一篇
 *   永遠完成不了、也刪不掉的草稿，30 天後連照片都沒了，更不可能完成辨識。
 *
 *   所以真正缺的不是「放寬政策」，是【先處理檔案再刪列】的那條路徑。這支端點
 *   就是那條路徑，而 RLS 政策維持原樣 —— 從瀏覽器直接刪圖片草稿依然不行。
 *
 *
 * 🛑 順序不可以顛倒：先刪 Storage 的檔案，全部成功才刪資料列。
 *    反過來會留下「資料庫說沒有這篇、檔案還在」的孤兒，而且再也沒有人會去找它。
 *    這與 api/writing-images-cleanup.ts 的紀律相同。
 *
 * 🛑 只能刪 DRAFT。已送出的作文不可變，而且七張子表全是 ON DELETE CASCADE ——
 *    刪一篇已送出的作文會連 AI 分析、error findings、老師講評與檢閱紀錄一起帶走。
 *    那種情況要逐筆確認，不該是一顆按鈕。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isDenied,
  requireEssayAccess,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from "./_lib/essayAuth.js";

export const config = {
  maxDuration: 30,
};

const RAW_BUCKET = "writing-raw";
const ARCHIVE_BUCKET = "writing-archive";

interface ImageRow {
  raw_path: string | null;
  raw_deleted_at: string | null;
  archive_path: string | null;
  archive_deleted_at: string | null;
}

/**
 * 刪掉一個 bucket 裡的一批檔案。
 *
 * Storage 的 remove() 對【不存在】的路徑不算錯誤，只是不會出現在回傳的清單裡。
 * 這正是我們要的：已經被清理工作帶走的檔案不該讓刪除失敗，
 * 但真正的錯誤（權限、bucket 不存在、網路）必須讓整件事停下來。
 */
async function removeAll(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<{ removed: number; error: string | null }> {
  if (paths.length === 0) return { removed: 0, error: null };
  const { data, error } = await admin.storage.from(bucket).remove(paths);
  if (error) return { removed: 0, error: `${bucket}: ${error.message}` };
  return { removed: data?.length ?? 0, error: null };
}

/** 刪除的結果。成功與失敗都有形狀，呼叫端不必猜。 */
export type DeleteOutcome =
  | { ok: true; files: { removed: number; missing: number } }
  | { ok: false; status: number; error: string };

/**
 * 真正做事的部分：先清檔案，全部成功才刪資料列。
 *
 * 抽成獨立的 export 而不是寫死在 handler 裡，是為了【可測試性】——
 * 順序反了就會留下孤兒檔案，那是這支端點存在的全部理由，
 * 必須測得到。見 scripts/verify-essay-delete-order.ts。
 *
 * 呼叫端負責授權與 DRAFT 檢查；這裡只負責刪得對。
 */
export async function deleteDraftEssay(
  admin: SupabaseClient,
  essayId: string,
): Promise<DeleteOutcome> {
  // ── 1. 先把這篇的檔案清乾淨 ────────────────────────────────
  const { data: images, error: imagesError } = await admin
    .from("writing_images")
    .select("raw_path, raw_deleted_at, archive_path, archive_deleted_at")
    .eq("essay_id", essayId);

  if (imagesError) {
    console.error("[writing-essay-delete] 讀取圖片列失敗:", imagesError.message);
    return { ok: false, status: 500, error: "無法讀取這篇作文的照片，請稍後再試" };
  }

  const rows = (images ?? []) as ImageRow[];
  // 已標記刪除的仍然一併送進 remove()：標記與實際檔案可能不同步
  // （清理工作刪檔成功、標記失敗就是這種狀態），多刪一次不會有副作用。
  const rawPaths = rows.map((r) => r.raw_path).filter((p): p is string => Boolean(p));
  const archivePaths = rows.map((r) => r.archive_path).filter((p): p is string => Boolean(p));

  const [raw, archive] = await Promise.all([
    removeAll(admin, RAW_BUCKET, rawPaths),
    removeAll(admin, ARCHIVE_BUCKET, archivePaths),
  ]);

  const errors = [raw.error, archive.error].filter((e): e is string => Boolean(e));
  if (errors.length > 0) {
    // 🛑 檔案沒清掉就【不刪資料列】—— 留著這一列，至少檔案還找得到。
    //    這裡讓步的話，這支端點就沒有存在的意義了。
    console.error("[writing-essay-delete] 刪除檔案失敗，保留資料列:", { essayId, errors });
    return {
      ok: false,
      status: 502,
      error: "照片沒有刪除成功，所以這篇作文暫時保留。請稍後再試一次。",
    };
  }

  // ── 2. 檔案清乾淨了，才刪資料列 ────────────────────────────
  // writing_images / writing_ocr_runs / writing_texts / writing_analyses 等
  // 七張子表都是 ON DELETE CASCADE，所以刪這一列就會一起走。
  const { error: deleteError } = await admin
    .from("writing_submissions")
    .delete()
    .eq("id", essayId)
    .eq("status", "DRAFT"); // 競態保險：這中間被送出就不要刪

  if (deleteError) {
    console.error("[writing-essay-delete] 刪除作文失敗:", deleteError.message);
    return { ok: false, status: 500, error: "刪除失敗，請稍後再試" };
  }

  const removed = raw.removed + archive.removed;
  return {
    ok: true,
    files: {
      removed,
      // 已經被清理工作帶走、或從來沒上傳成功的：不是錯誤，但值得回報。
      missing: rawPaths.length + archivePaths.length - removed,
    },
  };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "只接受 POST" });
  }

  const body = (req.body ?? {}) as { essayId?: unknown };
  const essayId = typeof body.essayId === "string" ? body.essayId : "";

  // 授權排在其他檢查之前：參數錯誤的訊息也是資訊。
  const access = await requireEssayAccess(req, essayId);
  if (isDenied(access)) {
    return res.status(access.status).json({ error: access.error });
  }
  const { admin, essay } = access;

  if (essay.status !== "DRAFT") {
    return res.status(409).json({
      error: "已經送出的作文不能刪除。如果真的需要移除，請聯絡老師。",
    });
  }

  const outcome = await deleteDraftEssay(admin, essayId);
  if (!outcome.ok) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  return res.status(200).json({ deleted: true, files: outcome.files });
}
