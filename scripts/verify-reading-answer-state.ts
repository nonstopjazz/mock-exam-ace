/**
 * 作答狀態的自我檢查（不需要瀏覽器、不需要資料庫）
 *
 *   npm run verify:reading-answer-state
 *
 * 🛑 這裡測的是【語意】，不是能不能跑。
 *    changeCount 寫成「點擊次數」也會跑得很順，而且沒有人會發現，
 *    直到有一天拿它做分析，得出「學生平均每題改 4 次」這種結論。
 */

import {
  allAnswered, elapsedMs, emptyAnswer, pickOption,
} from "../src/lib/reading/answerState";

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (cond) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failures += 1; }
};

{
  let s = emptyAnswer();
  check(s.selected === null && s.firstAnswer === null && s.changeCount === 0,
    "A1 一開始什麼都沒選");

  s = pickOption(s, "A");
  check(s.selected === "A" && s.firstAnswer === "A" && s.changeCount === 0,
    "🛑 A2 第一次選不算「改」——changeCount 還是 0");

  s = pickOption(s, "C");
  check(s.selected === "C" && s.changeCount === 1, "A3 改成別的 → 1 次");
  check(s.firstAnswer === "A",
    "🛑 A3 firstAnswer 仍然是第一次選的 A，不是目前的 C");

  const before = s;
  s = pickOption(s, "C");
  check(s === before,
    "🛑 A4 點同一個選項不算改，而且【回傳同一個物件】（不會觸發多餘的重繪）");

  s = pickOption(s, "B");
  s = pickOption(s, "D");
  check(s.changeCount === 3 && s.firstAnswer === "A" && s.selected === "D",
    "A5 改三次之後：changeCount 3、first 仍是 A、目前是 D");
}

{
  // 🛑 「改對」與「改錯」要分得出來——這是保留 firstAnswer 的全部理由
  const 改對 = pickOption(pickOption(emptyAnswer(), "A"), "B"); // 正解 B
  const 改錯 = pickOption(pickOption(emptyAnswer(), "B"), "A"); // 正解 B
  check(改對.firstAnswer === "A" && 改對.selected === "B",
    "B1 改對：第一次 A、最後 B");
  check(改錯.firstAnswer === "B" && 改錯.selected === "A",
    "🛑 B2 改錯：第一次就選對了 B，卻改成 A —— 只看最後答案會完全看不到這件事");
}

{
  check(elapsedMs(1000, 4500) === 3500, "C1 花了多久");
  check(elapsedMs(1000, 1000) === 0, "C2 零毫秒");
  check(elapsedMs(5000, 1000) === 0,
    "🛑 C3 時間倒退時回 0，不回負數（裝置時間會跳，負的作答時間會讓統計爆掉）");
  check(elapsedMs(0, 1234.6) === 1235, "C4 四捨五入成整數毫秒");
}

{
  check(!allAnswered(6, 5), "D1 五題不算做完");
  check(allAnswered(6, 6), "D2 六題做完");
  check(!allAnswered(0, 0),
    "🛑 D3 一題都沒有的文章不算「做完」——否則空文章會直接跳結算畫面");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
