/**
 * 觀看累計規則的測試。
 *
 * npx tsx scripts/verify-watch-progress.ts
 */
import {
  accumulate, initialWatchState, remainingSeconds, reportable,
  resetAnchor, watchPercent, type WatchState,
} from "../src/lib/learn/course/watchProgress";

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

/** 餵一串時間回報進去 */
const feed = (times: number[], start = initialWatchState()): WatchState =>
  times.reduce(accumulate, start);

console.log("");
console.log("════════ A. 正常播放 ════════");
{
  // 每 0.5 秒回報一次，播了 5 秒
  const times = Array.from({ length: 11 }, (_, i) => i * 0.5);
  const s = feed(times);
  check(Math.abs(s.watched - 5) < 0.001, "A1 連續播放累加得準");
  check(s.lastTime === 5, "A2 基準點停在最後一次");

  check(initialWatchState().watched === 0, "A3 初始是 0");
  check(initialWatchState(120).watched === 120, "A4 可以從伺服器的既有值接續");
  check(feed([3]).watched === 0, "A5 第一次回報只建立基準點，不累加");
}

console.log("");
console.log("════════ B. 🛑 拖曳不算觀看 ════════");
{
  // 播 2 秒 → 拖到 900 秒 → 再播 1 秒
  const s = feed([0, 0.5, 1, 1.5, 2, 900, 900.5, 901]);
  check(Math.abs(s.watched - 3) < 0.001,
    "🛑 B1 中間拖了 898 秒，只算 3 秒——把進度條拉到最後不等於看完");

  const s2 = feed([0, 1000]);
  check(s2.watched === 0, "🛑 B2 一步跳 1000 秒，一秒都不算");

  const s3 = feed([0, 0.5, 1, 1.5, 2]);
  check(Math.abs(s3.watched - 2) < 0.001, "B3 對照組：同樣的次數但連續播放，算 2 秒");
}

console.log("");
console.log("════════ C. 倒退與重看 ════════");
{
  const s = feed([0, 1, 2, 1, 2, 3]);
  // 0→1→2 算 2 秒；2→1 是倒退不算；1→2 又算 1 秒；2→3 算 1 秒
  check(Math.abs(s.watched - 4) < 0.001, "C1 倒退不累加，但之後重播的部分照算");
  check(feed([5, 4, 3, 2, 1]).watched === 0, "🛑 C2 一路倒退，一秒都不算");
  check(feed([10, 5]).lastTime === 5, "C3 倒退會把基準點移過去");
}

console.log("");
console.log("════════ D. 暫停與重設基準 ════════");
{
  let s = feed([0, 1, 2]);
  s = resetAnchor(s);
  check(Math.abs(s.watched - 2) < 0.001, "D1 重設基準不會清掉已累計的");
  check(s.lastTime === null, "D2 基準點被清掉");

  // 暫停 10 分鐘之後從同一個位置繼續
  s = accumulate(s, 2);
  check(Math.abs(s.watched - 2) < 0.001, "🛑 D3 暫停那段時間沒有被算成觀看");
  s = accumulate(s, 2.5);
  check(Math.abs(s.watched - 2.5) < 0.001, "D4 繼續播之後正常累加");
}

console.log("");
console.log("════════ E. 壞資料 ════════");
{
  const base = feed([0, 1]);
  check(accumulate(base, NaN).watched === base.watched, "E1 NaN 不影響累計");
  check(accumulate(base, -5).watched === base.watched, "E2 負數不影響累計");
  check(accumulate(base, Infinity).lastTime === base.lastTime, "E3 Infinity 連基準點都不動");

  const frozen = feed([0, 1]);
  const before = frozen.watched;
  accumulate(frozen, 2);
  check(frozen.watched === before, "🛑 E4 不會就地改動傳進來的狀態");
}

console.log("");
console.log("════════ F. 送出與顯示 ════════");
{
  check(reportable({ watched: 12.7, lastTime: null }) === 12, "F1 送出是整數（無條件捨去）");
  check(reportable({ watched: -3, lastTime: null }) === 0, "F2 不會送出負數");

  check(remainingSeconds(0, 900) === 900, "F3 還沒看：差 900 秒");
  check(remainingSeconds(850, 900) === 50, "F4 差 50 秒");
  check(remainingSeconds(900, 900) === 0, "F5 剛好達標");
  check(remainingSeconds(1000, 900) === 0, "F6 超過也是 0，不會是負數");
  check(remainingSeconds(0, 0) === 0, "🛑 F7 門檻 0（沒填長度的影片）回 0，不是 NaN");

  check(watchPercent(450, 900) === 50, "F8 百分比");
  check(watchPercent(0, 0) === 0, "🛑 F9 門檻 0 回 0，不是 NaN");
  check(watchPercent(950, 900) === 100, "F10 不會超過 100");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
