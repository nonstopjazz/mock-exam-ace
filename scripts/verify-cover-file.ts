/**
 * 封面上傳規則的測試。
 *
 * npx tsx scripts/verify-cover-file.ts
 */
import {
  aspectWarning, coverObjectName, formatBytes, isBucketObject,
  MAX_COVER_BYTES, resolutionWarning, validateCoverFile,
} from "../src/lib/learn/course/coverFile";

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const f = (type: string, size: number, name = "x") => ({ name, size, type });

console.log("");
console.log("════════ A. 格式 ════════");
check(validateCoverFile(f("image/jpeg", 1000)).ok, "A1 JPG 可以");
check(validateCoverFile(f("image/png", 1000)).ok, "A2 PNG 可以");
check(validateCoverFile(f("image/webp", 1000)).ok, "A3 WebP 可以");
check(!validateCoverFile(f("image/gif", 1000)).ok, "A4 GIF 不行");
check(!validateCoverFile(f("application/pdf", 1000)).ok, "A5 PDF 不行");
{
  const r = validateCoverFile(f("image/svg+xml", 1000));
  check(!r.ok, "🛑 A6 SVG 不行");
  check(!r.ok && r.message.includes("SVG"),
    "🛑 A7 而且訊息要指名 SVG——它看起來就是圖片，使用者需要知道為什麼被擋");
}

console.log("");
console.log("════════ B. 大小 ════════");
check(validateCoverFile(f("image/jpeg", MAX_COVER_BYTES)).ok, "B1 剛好 2MB 可以");
check(!validateCoverFile(f("image/jpeg", MAX_COVER_BYTES + 1)).ok, "B2 多一個 byte 就不行");
check(!validateCoverFile(f("image/jpeg", 0)).ok, "B3 空檔案不行");
check(!validateCoverFile(f("image/jpeg", -5)).ok, "B4 負數不行");
{
  const r = validateCoverFile(f("image/jpeg", 5 * 1024 * 1024));
  check(!r.ok && r.message.includes("5.0 MB"),
    "🛑 B5 訊息要說出【實際幾 MB】，不是只說「太大」");
}

console.log("");
console.log("════════ C. 檔名 ════════");
check(coverObjectName("my-course", "image/jpeg", 1700000000000) === "my-course-1700000000000.jpg",
  "C1 slug + 時間戳 + 副檔名");
check(coverObjectName("my-course", "image/png", 1).endsWith(".png"), "C2 PNG 的副檔名");
check(coverObjectName("my-course", "image/webp", 1).endsWith(".webp"), "C3 WebP 的副檔名");
check(coverObjectName("", "image/jpeg", 1) === "course-1.jpg", "C4 沒有 slug 也產得出名字");
check(coverObjectName("中文 課程!", "image/jpeg", 1) === "course-1.jpg",
  "🛑 C5 非英數一律剔除——中文與空白在網址裡是麻煩");
check(coverObjectName("a".repeat(100), "image/jpeg", 1).length < 60, "C6 過長會被截斷");
check(coverObjectName("x", "image/jpeg", 1) !== coverObjectName("x", "image/jpeg", 2),
  "🛑 C7 時間戳不同檔名就不同——換封面時 CDN 不會回舊的那張");

console.log("");
console.log("════════ D. 要不要刪舊檔 ════════");
check(isBucketObject("my-course-123.jpg"), "D1 bucket 裡的檔案");
check(!isBucketObject("https://example.com/a.jpg"),
  "🛑 D2 外部網址不是我們的東西，不可以拿去 remove()");
check(!isBucketObject("http://example.com/a.jpg"), "D3 http 也一樣");
check(!isBucketObject(null), "D4 null");
check(!isBucketObject("   "), "D5 空白");

console.log("");
console.log("════════ E. 比例提醒 ════════");
check(aspectWarning(1280, 720) === null, "E1 剛好 16:9 不提醒");
check(aspectWarning(1920, 1080) === null, "E2 同比例不同尺寸也不提醒");
check(aspectWarning(1280, 719) === null, "🛑 E3 差一個 pixel 不該被念");
{
  const wide = aspectWarning(2400, 720);
  check(wide !== null && wide.includes("左右"), "E4 太寬 → 講左右被裁");
  const tall = aspectWarning(800, 1000);
  check(tall !== null && tall.includes("上下"), "E5 太高 → 講上下被裁");
}
check(aspectWarning(0, 100) === null, "E6 壞資料不提醒（不是報錯）");
check(aspectWarning(NaN, NaN) === null, "E7 NaN 不提醒");

console.log("");
console.log("════════ F. 解析度提醒 ════════");
check(resolutionWarning(1280) === null, "F1 建議尺寸不提醒");
check(resolutionWarning(880) === null, "F2 剛好到下限不提醒");
check(resolutionWarning(400) !== null, "F3 太小要提醒");
check(resolutionWarning(0) === null, "F4 壞資料不提醒");

console.log("");
console.log("════════ G. 檔案大小顯示 ════════");
check(formatBytes(500) === "500 B", "G1 位元組");
check(formatBytes(2048) === "2 KB", "G2 KB");
check(formatBytes(1572864) === "1.5 MB", "G3 MB 到小數一位");
check(formatBytes(-1) === "0 KB", "G4 負數不會印出奇怪的東西");

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
