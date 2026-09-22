/**
 * POST /api/writing-image-replace —— 重傳某一頁照片
 *
 * 請求： { "essayId": "<uuid>", "pageNumber": 1,
 *          "rawPath": "<uid>/<essayId>/1-<uuid>.jpg",
 *          "rawBytes": 1234567, "rawMime": "image/jpeg" }
 * 回應： { replaced: true, staleFiles: number }
 *
 * 瀏覽器先把新照片直傳 Storage（10 MB 的照片穿不過 serverless 的請求本文上限），
 * 再打這支端點把那一頁換掉。
 *
 *
 * 為什麼需要這支端點
 *
 *   一頁正規化失敗（照片壞掉、上傳被截斷）之後，那一頁永遠是 NORMALIZE_FAILED，
 *   而第二段辨識要求【每一頁】都 NORMALIZED 才會跑。所以整篇作文再也無法辨識，
 *   按幾次「再試一次」都一樣 —— 重試是拿同一個壞檔再解一次。
 *
 *   在此之前唯一的出路是把整篇草稿刪掉重來。這支端點讓學生只重拍壞掉的那一張。
 *
 *
 * 🛑 路徑歸屬要在這裡再驗一次。register_writing_image() 有同樣的檢查，理由寫在
 *    那支 RPC 上：伺服器是用 service-role 去 Storage 取檔的，那把鑰匙繞過 RLS。
 *    路徑若能亂填，伺服器就會忠實地把別人的作文抓來辨識，再寫進這篇作文裡。
 *    這支端點同樣用 service-role 寫入，所以同樣的檢查必須自己做一遍 ——
 *    不能因為「RPC 那邊驗過了」就省略，這裡根本不會經過那支 RPC。
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

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "只接受 POST" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const essayId = typeof body.essayId === "string" ? body.essayId : "";
  const pageNumber = typeof body.pageNumber === "number" ? body.pageNumber : NaN;
  const rawPath = typeof body.rawPath === "string" ? body.rawPath : "";

  const access = await requireEssayAccess(req, essayId);
  if (isDenied(access)) {
    return res.status(access.status).json({ error: access.error });
  }
  const { admin, essay } = access;

  if (essay.status !== "DRAFT") {
    return res.status(409).json({ error: "已經送出的作文不能再更換照片" });
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 5) {
    return res.status(400).json({ error: "頁碼不正確" });
  }
  if (!rawPath) {
    return res.status(400).json({ error: "缺少檔案路徑" });
  }

  const outcome = await replaceImagePage(admin, {
    essayId,
    pageNumber,
    rawPath,
    rawBytes: typeof body.rawBytes === "number" ? body.rawBytes : null,
    rawMime: typeof body.rawMime === "string" ? body.rawMime : null,
    // 🛑 用作文擁有者，不是呼叫者：管理員代為重傳時，路徑仍然必須在
    //    學生自己的資料夾底下（Storage 的路徑規則綁的是學生）。
    ownerId: essay.student_id,
  });

  if (!outcome.ok) {
    return res.status(outcome.status).json({ error: outcome.error });
  }
  return res.status(200).json({ replaced: true, staleFiles: outcome.staleFiles });
}
