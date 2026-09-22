/**
 * 草稿維護的核心動作：刪掉一整篇、或換掉其中一頁。
 *
 * 住在 _lib/ 有兩個理由：
 *   1. 底線開頭的目錄不會被 Vercel 當成 serverless function ——
 *      Hobby 方案一個部署只能有 12 支，而這個專案已經用滿了。
 *      （13 支的那一次部署，三個專案同時失敗。）
 *   2. 這兩件事的正確性【全在順序上】，必須能被測試直接呼叫。
 *      見 scripts/verify-essay-delete-order.ts 與 verify-image-replace.ts。
 *
 * 授權與 DRAFT 檢查都在路由那一層（api/writing-draft-edit.ts）做完才進來。
 * 這裡只負責「刪得對」與「換得對」。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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


export interface ReplaceInput {
  essayId: string;
  pageNumber: number;
  rawPath: string;
  rawBytes: number | null;
  rawMime: string | null;
  /** 這篇作文的擁有者。路徑前綴必須是他 —— 不是呼叫者（管理員可以代刪代傳） */
  ownerId: string;
}

export type ReplaceOutcome =
  | { ok: true; staleFiles: number }
  | { ok: false; status: number; error: string };

/** 這個物件在 Storage 實際有多大。拿不到大小時回 null。 */
async function storedSize(
  admin: SupabaseClient,
  bucket: string,
  path: string,
): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const { data, error } = await admin.storage
    .from(bucket)
    .list(path.slice(0, slash), { search: path.slice(slash + 1) });
  if (error) return null;
  const found = data?.find((o) => o.name === path.slice(slash + 1));
  if (!found) return -1;
  const size = (found.metadata as { size?: unknown } | null)?.size;
  return typeof size === "number" ? size : null;
}

/**
 * 換掉一頁。抽成獨立的 export 是為了可測試性 —— 見
 * scripts/verify-image-replace.ts。
 *
 * 順序：
 *   1. 驗路徑歸屬（service-role 繞過 RLS，這裡是唯一的關）
 *   2. 驗新檔案真的在、而且大小對得上（截斷的上傳在這裡就被擋掉）
 *   3. 更新資料列指向新檔案，狀態回到 UPLOADED、清掉錯誤與舊的封存圖欄位
 *   4. 才刪舊檔案
 *
 * 第 3 步之前失敗，會把剛上傳的新檔案刪掉 —— 否則它就成了沒有任何資料列
 * 指向的孤兒。第 4 步失敗不算失敗：那一頁已經可以重新處理了，舊檔案只是
 * 佔空間，回報 staleFiles 讓呼叫端知道。
 */
export async function replaceImagePage(
  admin: SupabaseClient,
  input: ReplaceInput,
): Promise<ReplaceOutcome> {
  const { essayId, pageNumber, rawPath, rawBytes, rawMime, ownerId } = input;

  /** 失敗時把剛上傳的新檔案收掉，不要留下孤兒。 */
  const abandonNewFile = async () => {
    await admin.storage.from(RAW_BUCKET).remove([rawPath]);
  };

  // ── 1. 路徑歸屬 ──────────────────────────────────────────────
  const expectedPrefix = `${ownerId}/${essayId}/`;
  if (!rawPath.startsWith(expectedPrefix)) {
    // 這裡【不刪檔案】：路徑不屬於這篇作文，它可能是別人的檔案。
    return { ok: false, status: 403, error: "檔案路徑與作文不符" };
  }

  // ── 2. 新檔案在不在、完不完整 ────────────────────────────────
  const actual = await storedSize(admin, RAW_BUCKET, rawPath);
  if (actual === -1) {
    return { ok: false, status: 400, error: "找不到剛上傳的照片，請再試一次" };
  }
  if (actual !== null && rawBytes !== null && actual !== rawBytes) {
    // 上傳被截斷。這正是造成「永遠辨識不了」的那一種壞檔，擋在這裡。
    await abandonNewFile();
    return { ok: false, status: 400, error: "照片沒有完整上傳（可能是網路中斷），請再試一次" };
  }

  // ── 3. 換掉那一頁 ────────────────────────────────────────────
  const { data: existing, error: readError } = await admin
    .from("writing_images")
    .select("id, raw_path, archive_path")
    .eq("essay_id", essayId)
    .eq("page_number", pageNumber)
    .maybeSingle();

  if (readError) {
    console.error("[writing-image-replace] 讀取頁面失敗:", readError.message);
    await abandonNewFile();
    return { ok: false, status: 500, error: "讀取這一頁失敗，請稍後再試" };
  }
  if (!existing) {
    await abandonNewFile();
    return { ok: false, status: 404, error: "找不到這一頁" };
  }

  const { error: updateError } = await admin
    .from("writing_images")
    .update({
      raw_path: rawPath,
      raw_bytes: rawBytes,
      raw_mime: rawMime,
      raw_uploaded_at: new Date().toISOString(),
      raw_deleted_at: null,
      // 回到未處理狀態，下一次 writing-images-process 會重新正規化這一頁。
      state: "UPLOADED",
      error_code: null,
      error_message: null,
      // 🛑 舊的封存圖是【前一張照片】的，不能留著：留著的話這一頁會同時
      //    宣稱「未處理」與「已經有封存圖」，而辨識讀的正是封存圖。
      archive_path: null,
      archive_bytes: null,
      archive_width: null,
      archive_height: null,
      archive_created_at: null,
      archive_verified_at: null,
      archive_deleted_at: null,
    })
    .eq("id", existing.id);

  if (updateError) {
    console.error("[writing-image-replace] 更新頁面失敗:", updateError.message);
    await abandonNewFile();
    return { ok: false, status: 500, error: "更新這一頁失敗，請稍後再試" };
  }

  // ── 4. 舊檔案 ────────────────────────────────────────────────
  // 到這裡為止這一頁已經可以重新處理了。舊檔案刪不掉只是佔空間，
  // 不該讓整個重傳失敗 —— 但也不能假裝沒發生，所以回報數量。
  let stale = 0;
  const oldRaw = existing.raw_path as string | null;
  const oldArchive = existing.archive_path as string | null;

  if (oldRaw && oldRaw !== rawPath) {
    const { error } = await admin.storage.from(RAW_BUCKET).remove([oldRaw]);
    if (error) {
      console.error("[writing-image-replace] 舊原檔刪除失敗:", { essayId, pageNumber, message: error.message });
      stale += 1;
    }
  }
  if (oldArchive) {
    const { error } = await admin.storage.from(ARCHIVE_BUCKET).remove([oldArchive]);
    if (error) {
      console.error("[writing-image-replace] 舊封存圖刪除失敗:", { essayId, pageNumber, message: error.message });
      stale += 1;
    }
  }

  return { ok: true, staleFiles: stale };
}

/**
 * 🛑 這兩個守衛不是多餘的。tsconfig.check.json 的 strictNullChecks 是關的，
 *    那個設定下 TypeScript【不會】用 `ok: false` 這個判別式自動窄化 union ——
 *    `if (!outcome.ok) outcome.status` 會直接是型別錯誤。
 *    api/_lib/essayAuth.ts 的 isDenied() 也是為了同一件事存在。
 */
export function deleteFailed(o: DeleteOutcome): o is Extract<DeleteOutcome, { ok: false }> {
  return o.ok === false;
}

export function replaceFailed(o: ReplaceOutcome): o is Extract<ReplaceOutcome, { ok: false }> {
  return o.ok === false;
}
