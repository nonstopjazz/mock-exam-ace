import { supabase } from "@/lib/supabase";
import { prepareImage } from "@/lib/writing/prepareImage";
import { RAW_BUCKET } from "@/config/writingImages";

/**
 * 上傳一頁原檔，並且【確認它真的完整上傳】。
 *
 * 為什麼需要確認這件事
 *
 *   Storage 的 upload() 回傳成功，只代表請求沒有報錯。手機在上傳途中換網路、
 *   進隧道、切到背景，都可能讓伺服器收下一個【被截斷】的檔案而不視為錯誤。
 *
 *   production 就有一筆：VipsJpeg: premature end of JPEG image。
 *   那一頁永遠正規化不了，於是整篇作文永遠無法辨識 —— 而且在加上重傳功能
 *   之前，學生連刪都刪不掉。
 *
 *   所以上傳完要回頭問 Storage：你收到的那個檔案，有幾個 byte？
 *   對不起來就當場刪掉重來，而不是讓它變成一頁壞掉的資料。
 *
 * 🛑 這個檢查【不能】改成只比對本地檔案。截斷發生在傳輸途中，
 *    本地的 blob 永遠是完整的 —— 要問的是伺服器那一端。
 */

export class UploadIncompleteError extends Error {
  constructor(pageNumber: number) {
    super(`第 ${pageNumber} 張照片沒有完整上傳（可能是網路中斷），請再試一次`);
    this.name = "UploadIncompleteError";
  }
}

export interface UploadedPage {
  path: string;
  bytes: number;
  contentType: string;
}

/** 問 Storage 這個物件實際有多大。拿不到大小時回 null（不等於不一致）。 */
async function storedSize(path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);

  const { data, error } = await supabase.storage.from(RAW_BUCKET).list(dir, { search: name });
  if (error) return null;

  const found = data?.find((o) => o.name === name);
  if (!found) return -1; // 找得到目錄卻沒有這個檔案 —— 這是真的有問題
  const size = (found.metadata as { size?: unknown } | null)?.size;
  return typeof size === "number" ? size : null;
}

/**
 * 上傳一頁並驗證完整性。失敗時會把半吊子的檔案刪掉，不留殘骸。
 *
 * @param essayId 作文 id（路徑的一部分，同時是 register 那支 RPC 會驗的歸屬）
 * @param userId  學生自己的 uid，路徑前綴
 */
export async function uploadRawPage(
  file: File,
  userId: string,
  essayId: string,
  pageNumber: number,
): Promise<UploadedPage> {
  const prepared = await prepareImage(file);
  const path = `${userId}/${essayId}/${pageNumber}-${crypto.randomUUID()}.${prepared.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(RAW_BUCKET)
    .upload(path, prepared.blob, { contentType: prepared.contentType, upsert: false });
  if (uploadError) throw new Error(`第 ${pageNumber} 張上傳失敗：${uploadError.message}`);

  const actual = await storedSize(path);
  // null = 問不到大小（權限、API 變動）。問不到就不要假裝驗過了，但也不該
  // 因此擋下上傳 —— 伺服器端還會再驗一次，那裡是最後一道。
  if (actual !== null && actual !== prepared.blob.size) {
    await supabase.storage.from(RAW_BUCKET).remove([path]);
    throw new UploadIncompleteError(pageNumber);
  }

  return { path, bytes: prepared.blob.size, contentType: prepared.contentType };
}
