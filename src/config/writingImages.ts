/**
 * 拍照作文的前端設定
 *
 * 這幾個數字在三個地方各擋一次：這裡（前端）、api/writing-images-process.ts、
 * 以及 Storage bucket 的 file_size_limit。三層都擋是刻意的——
 * 前端可以被繞過，API 可能有 bug，bucket 那層繞不過。
 */

/** 一篇作文最多幾張照片。與 writing_images.page_number 的 CHECK 一致。 */
export const MAX_PAGES = 5;

/**
 * 單張上傳上限 10 MB。
 *
 * 這是「收不收」的上限，不是保存的大小 —— 伺服器會把它正規化成
 * 長邊 2200px 的 JPEG（約 0.5–1.5 MB）之後才長期保存，原檔隔天就清掉。
 * 訂 10 MB 是為了不要退回一般手機的正常照片。
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 檔案挑選器接受的型別。HEIC 由瀏覽器端轉成 JPEG 再上傳（iPhone 預設格式）。 */
export const ACCEPTED_IMAGE_TYPES =
  "image/jpeg,image/png,image/webp,image/heic,image/heif";

/** 直接上傳、不在瀏覽器重新編碼的格式（伺服器的 sharp 讀得懂，EXIF 也由它處理）。 */
export const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const RAW_BUCKET = "writing-raw";
export const ARCHIVE_BUCKET = "writing-archive";

/** 縮圖用的 signed URL 有效期（秒）。短一點沒關係，畫面會即時取得。 */
export const SIGNED_URL_TTL_SECONDS = 300;
