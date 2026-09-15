/**
 * 瀏覽器錄音的型別協商與格式工具
 *
 * 取自 ieltscoach-dashboard 的 pickSupportedMimeType()，但候選清單收窄成
 * bucket 的 allowed_mime_types 收得下的那幾種。原本的清單有 audio/aac，
 * 那個型別上傳會被 bucket 直接退回——在瀏覽器支援、卻在上傳最後一步失敗，
 * 是最難查的那種錯。
 *
 * 各瀏覽器實際會挑到的：
 *   Chrome / Edge / Firefox   audio/webm;codecs=opus
 *   Safari (iOS / macOS)      audio/mp4
 */

/** 依偏好順序排列。第一個 isTypeSupported 為真的就是我們要用的。 */
const CANDIDATE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

/** 這個瀏覽器錄得出來、而且 bucket 收得下的型別；都不支援時回 null。 */
export function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of CANDIDATE_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* isTypeSupported 在少數瀏覽器會 throw，當成不支援就好 */
    }
  }
  return null;
}

/**
 * 去掉 `;codecs=...`，只留 `audio/webm` 這樣的主型別。
 *
 * 🛑 上傳時要傳這個，不能傳 MediaRecorder 給的完整字串。
 *    bucket 的 allowed_mime_types 是精確比對，`audio/webm;codecs=opus`
 *    不等於 `audio/webm`，會被擋在門外。
 */
export function baseMimeOf(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/** 給檔名用的副檔名。認不得的一律 bin —— 寧可難看，也不要謊報格式。 */
export function extensionFor(mime: string): string {
  switch (baseMimeOf(mime)) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    default:
      return "bin";
  }
}

/** 0:07 / 2:31 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 讀得懂的檔案大小。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 麥克風權限失敗的原因，翻成學生看得懂、而且知道下一步要做什麼的句子。 */
export function micErrorMessage(err: unknown): string {
  const name = (err as DOMException | undefined)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "瀏覽器擋住了麥克風。請在網址列旁的權限設定裡允許麥克風，再重新整理這一頁。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "找不到麥克風。請確認裝置上有可用的麥克風。";
  }
  if (name === "NotReadableError") {
    return "麥克風正被其他程式使用（例如視訊會議）。請先關掉那個程式再試一次。";
  }
  return err instanceof Error ? err.message : "無法開始錄音，請再試一次。";
}
