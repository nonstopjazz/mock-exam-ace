/**
 * POST /api/writing-images-process
 *
 * 把一篇拍照作文的照片處理完：正規化 → 辨識文字。
 *
 * 請求： { "essayId": "<uuid>" }
 * 回應： { pages: [{ pageNumber, state, errorCode, errorMessage }], ocr: { runId, text } | null }
 *
 * 授權沿用 api/_lib/essayAuth.ts 的 requireEssayAccess()：
 * 驗 JWT → 解析身分 → 檢查這篇作文是不是他的（或他是管理員）→ 通過才拿到 service-role client。
 * 學生本人可以呼叫（辨識自己的作文不需要老師動手），但只能呼叫自己的。
 *
 *
 * 兩段式，可重入
 *
 *   第一段 正規化：state = 'UPLOADED' 或 'NORMALIZE_FAILED' 的頁面才處理。
 *                 轉正 → 縮到長邊 2200 → JPEG q84 → 上傳 writing-archive → 讀回驗證。
 *   第二段 辨識：  所有頁面都 NORMALIZED 才進行。任何一頁失敗就停在第一段，
 *                 回傳每頁的狀態讓學生知道要重拍哪一張。
 *
 * 重試就是再打一次同一支端點：已經處理好的頁面會被跳過。
 *
 *
 * 為什麼原檔不從這支端點上傳
 *
 * Vercel serverless 的請求本文上限約 4.5 MB，10 MB 的手機照片穿不過來。
 * 因此瀏覽器用自己的登入身分直傳 Storage（writing-raw 的 RLS 只讓他寫自己的資料夾），
 * 伺服器再用 service-role 從 Storage 取回。這也是 register_writing_image() 必須
 * 驗證路徑歸屬的原因——service-role 讀 Storage 時繞過 RLS，路徑若能亂填，
 * 這支端點就會忠實地把別人的作文抓來辨識。
 */

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isDenied,
  requireEssayAccess,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from "./_lib/essayAuth.js";

export const config = {
  maxDuration: 60,
};

/** 硬性期限。maxDuration 是 60 秒，留 10 秒給收尾與回應。 */
const DEADLINE_MS = 50_000;

const RAW_BUCKET = "writing-raw";
const ARCHIVE_BUCKET = "writing-archive";

/**
 * 正規化參數。
 *
 * 🛑 這三個數字上線前要用真實學生手寫頁校準過（見 docs/learn/writing-images.md）。
 *    壓過頭的代價不是「圖片醜一點」，是辨識變差、學生得整篇重打。
 */
const LONG_EDGE_PX = 2200;
const JPEG_QUALITY = 84;
const MAX_PAGES = 5;

/** 每篇作文最多辨識成功幾次。辨識要花錢，不能讓人按著玩。 */
const MAX_OCR_RUNS = 3;

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
/** 手寫作文用 DOCUMENT_TEXT_DETECTION；TEXT_DETECTION 是給招牌那種稀疏文字的。 */
const VISION_FEATURE = "DOCUMENT_TEXT_DETECTION";
const PAGE_SEPARATOR = "\n\n";

interface ImageRow {
  id: string;
  page_number: number;
  raw_path: string | null;
  raw_deleted_at: string | null;
  archive_path: string | null;
  archive_deleted_at: string | null;
  state: "UPLOADED" | "NORMALIZED" | "NORMALIZE_FAILED";
  error_code: string | null;
  error_message: string | null;
}

interface PageResult {
  pageNumber: number;
  state: ImageRow["state"];
  errorCode: string | null;
  errorMessage: string | null;
}

class Deadline {
  private readonly endsAt: number;
  constructor(budgetMs: number) {
    this.endsAt = Date.now() + budgetMs;
  }
  get exceeded(): boolean {
    return Date.now() >= this.endsAt;
  }
  get remainingMs(): number {
    return Math.max(0, this.endsAt - Date.now());
  }
}

/** 封存圖與原檔放在各自的 bucket，但路徑相同（副檔名一律 .jpg）——出事時好對照。 */
function archivePathFor(rawPath: string): string {
  return rawPath.replace(/\.[^./]+$/, "") + ".jpg";
}

async function downloadToBuffer(
  admin: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Buffer> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || "檔案讀取失敗");
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * 一頁的正規化。
 *
 * 失敗時把原因寫回資料列（state = NORMALIZE_FAILED），不丟例外——
 * 一頁壞掉不該讓其他頁也停下來，學生要看到的是「第 2 張請重拍」而不是整批失敗。
 */
async function normalizePage(
  admin: SupabaseClient,
  row: ImageRow,
): Promise<PageResult> {
  const fail = async (code: string, message: string): Promise<PageResult> => {
    await admin
      .from("writing_images")
      .update({ state: "NORMALIZE_FAILED", error_code: code, error_message: message })
      .eq("id", row.id);
    return { pageNumber: row.page_number, state: "NORMALIZE_FAILED", errorCode: code, errorMessage: message };
  };

  if (!row.raw_path || row.raw_deleted_at) {
    return fail("RAW_MISSING", "原始照片已不存在，請重新上傳這一頁");
  }

  let raw: Buffer;
  try {
    raw = await downloadToBuffer(admin, RAW_BUCKET, row.raw_path);
  } catch (err) {
    return fail("DOWNLOAD_FAILED", err instanceof Error ? err.message : "讀取原始照片失敗");
  }

  let archive: Buffer;
  let width: number | undefined;
  let height: number | undefined;
  try {
    // .rotate() 不帶參數 = 依 EXIF 轉正。手機直拍的照片幾乎都靠這一步才不會躺著。
    archive = await sharp(raw)
      .rotate()
      .resize({ width: LONG_EDGE_PX, height: LONG_EDGE_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(archive).metadata();
    width = meta.width;
    height = meta.height;
  } catch (err) {
    return fail("DECODE_FAILED", err instanceof Error ? err.message : "這張照片無法處理");
  }

  const archivePath = archivePathFor(row.raw_path);
  const { error: uploadError } = await admin.storage
    .from(ARCHIVE_BUCKET)
    .upload(archivePath, archive, { contentType: "image/jpeg", upsert: true });
  if (uploadError) {
    return fail("UPLOAD_FAILED", uploadError.message);
  }

  // 讀回來驗證：沒有這一步就沒有 archive_verified_at，清理工作也就永遠不會刪原檔。
  // 「上傳 API 沒報錯」與「檔案真的在而且讀得出來」是兩件事。
  try {
    const readBack = await downloadToBuffer(admin, ARCHIVE_BUCKET, archivePath);
    const meta = await sharp(readBack).metadata();
    if (!meta.width || !meta.height) throw new Error("讀回來的檔案解析不出尺寸");
  } catch (err) {
    return fail("VERIFY_FAILED", err instanceof Error ? err.message : "封存圖驗證失敗");
  }

  const { error: updateError } = await admin
    .from("writing_images")
    .update({
      state: "NORMALIZED",
      error_code: null,
      error_message: null,
      archive_path: archivePath,
      archive_bytes: archive.byteLength,
      archive_width: width ?? null,
      archive_height: height ?? null,
      archive_created_at: new Date().toISOString(),
      archive_verified_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateError) {
    return fail("DB_UPDATE_FAILED", updateError.message);
  }

  return { pageNumber: row.page_number, state: "NORMALIZED", errorCode: null, errorMessage: null };
}

interface VisionPageResult {
  text: string;
  confidence: number | null;
}

async function recognisePage(apiKey: string, image: Buffer, timeoutMs: number): Promise<VisionPageResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        requests: [
          {
            image: { content: image.toString("base64") },
            features: [{ type: VISION_FEATURE }],
            imageContext: { languageHints: ["en"] },
          },
        ],
      }),
    });

    if (!response.ok) {
      // 不把回應原文丟給前端：可能含有金鑰相關訊息。
      const detail = await response.text().catch(() => "");
      console.error("[writing-images-process] Vision HTTP", response.status, detail.slice(0, 400));
      throw new Error(`辨識服務回應 ${response.status}`);
    }

    const body = (await response.json()) as {
      responses?: Array<{
        error?: { message?: string };
        fullTextAnnotation?: { text?: string; pages?: Array<{ confidence?: number }> };
      }>;
    };

    const first = body.responses?.[0];
    if (first?.error?.message) {
      throw new Error(first.error.message);
    }

    return {
      text: first?.fullTextAnnotation?.text ?? "",
      confidence: first?.fullTextAnnotation?.pages?.[0]?.confidence ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const deadline = new Deadline(DEADLINE_MS);
  const body = (req.body ?? {}) as { essayId?: string; essay_id?: string };
  const essayId: string = body.essayId || body.essay_id || "";

  const access = await requireEssayAccess(req, essayId);
  if (isDenied(access)) {
    return res.status(access.status).json({ error: access.error });
  }
  const { admin, essay, user } = access;

  if (essay.submission_type !== "image") {
    return res.status(400).json({ error: "這不是拍照作文" });
  }
  if (essay.status !== "DRAFT") {
    return res.status(409).json({ error: "這篇作文已經送出，不能再處理照片" });
  }

  const { data: rows, error: rowsError } = await admin
    .from("writing_images")
    .select("id, page_number, raw_path, raw_deleted_at, archive_path, archive_deleted_at, state, error_code, error_message")
    .eq("essay_id", essayId)
    .order("page_number");

  if (rowsError) {
    console.error("[writing-images-process] 讀取頁面失敗:", rowsError.message);
    return res.status(500).json({ error: "讀取照片資料失敗" });
  }

  const pages = (rows ?? []) as ImageRow[];
  if (pages.length === 0) {
    return res.status(400).json({ error: "這篇作文還沒有照片" });
  }
  if (pages.length > MAX_PAGES) {
    return res.status(400).json({ error: `一篇作文最多 ${MAX_PAGES} 張照片` });
  }

  // ── 第一段：正規化 ────────────────────────────────────────────
  const results: PageResult[] = [];
  for (const row of pages) {
    if (row.state === "NORMALIZED") {
      results.push({ pageNumber: row.page_number, state: "NORMALIZED", errorCode: null, errorMessage: null });
      continue;
    }
    if (deadline.exceeded) {
      results.push({
        pageNumber: row.page_number,
        state: row.state,
        errorCode: "TIMEOUT",
        errorMessage: "這次處理時間不夠，請再按一次繼續",
      });
      continue;
    }
    results.push(await normalizePage(admin, row));
  }

  const allNormalized = results.every((r) => r.state === "NORMALIZED");
  if (!allNormalized) {
    // 有頁面沒過就不辨識：辨識半篇作文只會讓學生拿到一份殘缺的文字，
    // 而他不會知道少了哪一段。
    return res.status(200).json({ pages: results, ocr: null });
  }

  // ── 第二段：辨識 ─────────────────────────────────────────────
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    console.error("[writing-images-process] GOOGLE_VISION_API_KEY 未設定");
    return res.status(503).json({ pages: results, error: "辨識服務尚未設定，請聯絡老師" });
  }

  const { count: successCount } = await admin
    .from("writing_ocr_runs")
    .select("id", { count: "exact", head: true })
    .eq("essay_id", essayId)
    .eq("status", "SUCCEEDED");

  if ((successCount ?? 0) >= MAX_OCR_RUNS) {
    return res.status(429).json({
      pages: results,
      error: `這篇作文已經辨識過 ${MAX_OCR_RUNS} 次。請直接修改文字，或改用打字輸入。`,
    });
  }

  const { count: totalRuns } = await admin
    .from("writing_ocr_runs")
    .select("id", { count: "exact", head: true })
    .eq("essay_id", essayId);

  const { data: runRow, error: runError } = await admin
    .from("writing_ocr_runs")
    .insert({
      essay_id: essayId,
      status: "RUNNING",
      attempt_no: (totalRuns ?? 0) + 1,
      triggered_by: user.id,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !runRow) {
    console.error("[writing-images-process] 建立辨識紀錄失敗:", runError?.message);
    return res.status(500).json({ pages: results, error: "無法開始辨識" });
  }
  const runId = runRow.id as string;

  const markRunFailed = async (code: string, message: string) => {
    await admin
      .from("writing_ocr_runs")
      .update({ status: "FAILED", error_code: code, error_message: message, finished_at: new Date().toISOString() })
      .eq("id", runId);
  };

  try {
    const fresh = await admin
      .from("writing_images")
      .select("page_number, archive_path")
      .eq("essay_id", essayId)
      .order("page_number");

    const archivePages = (fresh.data ?? []) as Array<{ page_number: number; archive_path: string | null }>;

    const perPage: VisionPageResult[] = [];
    for (const page of archivePages) {
      if (!page.archive_path) throw new Error(`第 ${page.page_number} 頁沒有可辨識的圖片`);
      if (deadline.exceeded) throw new Error("DEADLINE");
      const buffer = await downloadToBuffer(admin, ARCHIVE_BUCKET, page.archive_path);
      perPage.push(await recognisePage(apiKey, buffer, Math.min(deadline.remainingMs, 20_000)));
    }

    const text = perPage
      .map((p) => p.text.trim())
      .filter((s) => s.length > 0)
      .join(PAGE_SEPARATOR);

    if (text.length === 0) {
      await markRunFailed("NO_TEXT", "沒有讀到任何文字");
      return res.status(200).json({
        pages: results,
        ocr: null,
        error: "這次沒有讀出文字。請確認照片清楚、光線足夠，再試一次。",
      });
    }

    await admin
      .from("writing_ocr_runs")
      .update({
        status: "SUCCEEDED",
        raw_text: text,
        page_texts: archivePages.map((page, i) => ({
          page_number: page.page_number,
          text: perPage[i]?.text ?? "",
          confidence: perPage[i]?.confidence ?? null,
        })),
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return res.status(200).json({ pages: results, ocr: { runId, text } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "辨識失敗";
    const isDeadline = message === "DEADLINE";
    await markRunFailed(isDeadline ? "DEADLINE" : "OCR_FAILED", message);
    console.error("[writing-images-process] 辨識失敗:", message);
    return res.status(200).json({
      pages: results,
      ocr: null,
      error: isDeadline
        ? "辨識時間超過限制，請再試一次。"
        : "辨識沒有成功，可以再試一次，或改用打字輸入。",
    });
  }
}
