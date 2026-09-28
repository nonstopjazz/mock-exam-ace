/**
 * 課程封面上傳的規則。純函式，所以測得動。
 *
 * 🛑 這裡的三個限制要跟 create_course_cover_bucket.sql【一致】。
 *    bucket 那一層才是真的擋得住的（前端可以被繞過），但先在這裡擋，
 *    使用者才會看到「這張圖太大」而不是一串 RLS 的錯誤訊息。
 */

export const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB
export const COVER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 建議尺寸。卡片顯示寬度約 429px，高解析螢幕 2 倍 → 858px */
export const RECOMMENDED_WIDTH = 1280;
export const RECOMMENDED_HEIGHT = 720;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type CoverCheck = { ok: true } | { ok: false; message: string };

/** 送出之前先擋掉明顯不行的 */
export function validateCoverFile(file: { name: string; size: number; type: string }): CoverCheck {
  if (!(COVER_MIME_TYPES as readonly string[]).includes(file.type)) {
    // 🛑 SVG 要特別講——它看起來就是圖片，但公開 bucket 放 SVG
    //    等於開一個誰都打得開的網址放可執行內容
    if (file.type === "image/svg+xml") {
      return { ok: false, message: "不接受 SVG。封面請用 JPG、PNG 或 WebP。" };
    }
    return { ok: false, message: "只接受 JPG、PNG 或 WebP。" };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: "這個檔案是空的。" };
  }
  if (file.size > MAX_COVER_BYTES) {
    return {
      ok: false,
      message: `檔案 ${formatBytes(file.size)}，超過 2 MB。${RECOMMENDED_WIDTH}×${RECOMMENDED_HEIGHT} 的 JPG 通常只有 200 KB 左右。`,
    };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * bucket 裡的檔名。
 *
 * 🛑 不沿用使用者的檔名。中文、空白、括號都會變成難處理的網址，
 *    而且兩門課各上傳一張 cover.jpg 就會互相蓋掉。
 *
 * 加上時間戳還有一個作用：換封面時網址一定不同，CDN 不會回舊的那張。
 */
export function coverObjectName(slug: string, mime: string, now = Date.now()): string {
  const ext = EXT_BY_MIME[mime] ?? "jpg";
  const safe = (slug || "course").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40)
    || "course";
  return `${safe}-${now}.${ext}`;
}

/**
 * 這個 cover_path 是不是 bucket 裡的檔案。
 *
 * 🛑 換封面時要刪舊檔，但外部網址不能拿去 remove()——那不是我們的東西，
 *    而且路徑長得完全不一樣。
 */
export const isBucketObject = (path: string | null): boolean =>
  !!path && path.trim().length > 0 && !/^https?:\/\//i.test(path);

/**
 * 比例差太多要提醒。卡片是 16:9 而且 object-cover，所以不是變形，是【裁掉】。
 *
 * 容許一點誤差：1280×719 沒有人需要被念。
 */
export function aspectWarning(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const ratio = width / height;
  const target = 16 / 9;
  if (Math.abs(ratio - target) <= 0.08) return null;

  return ratio > target
    ? "這張圖比 16:9 更寬，左右兩側會被裁掉。"
    : "這張圖比 16:9 更高，上下會被裁掉。";
}

/** 太小的圖放大會糊 */
export function resolutionWarning(width: number): string | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  if (width >= 880) return null;
  return `寬度只有 ${Math.round(width)}px，在高解析螢幕上會糊。建議至少 880px。`;
}
