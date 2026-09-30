/**
 * 作答閂鎖與去重的測試。
 *
 * npx tsx scripts/verify-answer-latch.ts
 */
import {
  attemptKey, createDeduper, createLatch,
} from "../src/lib/practice/answerLatch";

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

console.log("");
console.log("════════ A. 閂鎖 ════════");
{
  const l = createLatch();
  check(l.tryAcquire(), "A1 第一次拿得到");
  check(!l.tryAcquire(), "🛑 A2 第二次拿不到——連點的第二下就是被這裡擋掉的");
  check(!l.tryAcquire(), "A3 第三次也拿不到");

  l.release();
  check(l.tryAcquire(), "A4 放開之後（換下一題）又拿得到");

  const fresh = createLatch();
  check(!fresh.locked, "A5 一開始是開的");
  fresh.tryAcquire();
  check(fresh.locked, "A6 拿走之後是鎖的");
  fresh.release();
  check(!fresh.locked, "A7 放開之後是開的");
}

console.log("");
console.log("════════ B. 🛑 模擬同一個 tick 裡的兩次點擊 ════════");
{
  // 這是 bug 的真實形狀：兩次點擊在 re-render 之前都跑完了。
  // 用 state 當防線的版本兩次都會通過；用 ref 的只有第一次。
  const latch = createLatch();
  const recorded: string[] = [];

  const handleSelect = (answer: string) => {
    if (!latch.tryAcquire()) return;
    recorded.push(answer);
  };

  // 快速點了兩個【不同】的選項
  handleSelect("A");
  handleSelect("B");

  check(recorded.length === 1, "🛑 B1 只記一筆");
  check(recorded[0] === "A", "🛑 B2 記的是第一個，不是最後一個");

  // 對照組：忠實模擬 React 的行為。
  //   committed = 真正的 state 值
  //   rendered  = handler 閉包看到的值，只有 re-render 才會跟上
  let committed = false;
  let rendered = committed;
  const setShowResult = (v: boolean) => { committed = v; };  // 不影響 rendered
  const rerender = () => { rendered = committed; };

  const stateRecorded: string[] = [];
  const handleSelectWithState = (answer: string) => {
    if (rendered) return;          // ← 原本四個頁面寫的 if (showResult) return
    setShowResult(true);
    stateRecorded.push(answer);
  };

  handleSelectWithState("A");
  handleSelectWithState("B");      // 同一個 tick，還沒 re-render
  check(stateRecorded.length === 2,
    "🛑 B3 對照組：用 state 當防線，兩次【都會】通過——這就是原本的行為");

  // 證明這個模擬沒有作弊：re-render 之後那道防線是有效的
  rerender();
  handleSelectWithState("C");
  check(stateRecorded.length === 2,
    "🛑 B4 而且 re-render 之後它確實擋得住——所以問題真的只出在同一個 tick");
}

console.log("");
console.log("════════ C. 去重的鍵 ════════");
{
  const base = { wordId: "w1", exerciseType: "quick_quiz", sessionId: "s1", correct: true };
  check(attemptKey(base) === attemptKey({ ...base }), "C1 同樣的輸入 → 同樣的鍵");
  check(attemptKey(base) !== attemptKey({ ...base, wordId: "w2" }), "C2 不同的字 → 不同的鍵");
  check(attemptKey(base) !== attemptKey({ ...base, exerciseType: "spelling" }),
    "C3 不同的題型 → 不同的鍵");
  check(attemptKey(base) !== attemptKey({ ...base, sessionId: "s2" }),
    "C4 不同的 session → 不同的鍵");
  check(attemptKey(base) !== attemptKey({ ...base, correct: false }),
    "🛑 C5 對錯不同 → 不同的鍵。點了兩個不同選項就長這樣，不可以被當成同一件事放行");
  check(attemptKey({ wordId: "w", exerciseType: "e" }).includes("-"),
    "C6 沒有 sessionId 也產得出鍵");
  check(attemptKey({ ...base, correct: null }) !== attemptKey({ ...base, correct: false }),
    "🛑 C7 null（沒有客觀對錯）與 false 是兩件事");
}

console.log("");
console.log("════════ D. 去重的窗口 ════════");
{
  const d = createDeduper(500);
  check(!d.isDuplicate("k", 1000), "D1 第一次不是重複");
  check(d.isDuplicate("k", 1000), "🛑 D2 同一毫秒的第二次是重複");
  check(d.isDuplicate("k", 1400), "D3 400ms 之後還在窗口內");
  check(!d.isDuplicate("k", 1500), "🛑 D4 剛好 500ms 就放行了——窗口是「內」不是「含」");
  check(!d.isDuplicate("k", 9000), "D5 很久以後當然放行");

  const d2 = createDeduper(500);
  d2.isDuplicate("a", 0);
  check(!d2.isDuplicate("b", 0), "D6 不同的鍵互不影響");
}

console.log("");
console.log("════════ E. 🛑 不可以吃掉真的作答 ════════");
{
  const d = createDeduper(500);
  // 學生在同一次練習裡真的再遇到同一個字（不同題型）
  check(!d.isDuplicate(attemptKey({ wordId: "w1", exerciseType: "quick_quiz", sessionId: "s", correct: true }), 0),
    "E1 第一次");
  check(!d.isDuplicate(attemptKey({ wordId: "w1", exerciseType: "spelling", sessionId: "s", correct: true }), 10),
    "🛑 E2 同一個字、不同題型 → 不是重複");
  check(!d.isDuplicate(attemptKey({ wordId: "w1", exerciseType: "quick_quiz", sessionId: "s", correct: false }), 20),
    "🛑 E3 同一個字、同題型、但這次答錯 → 不是重複（是兩次真的作答）");
  // 隔一段時間重做同一題
  check(!d.isDuplicate(attemptKey({ wordId: "w1", exerciseType: "quick_quiz", sessionId: "s", correct: true }), 30000),
    "🛑 E4 三十秒後重做同一題 → 不是重複");
}

console.log("");
console.log("════════ F. 記憶體不會無限長 ════════");
{
  const d = createDeduper(500, 10);
  for (let i = 0; i < 50; i++) d.isDuplicate(`k${i}`, i * 1000);
  // 全部過期了，清理過之後還能正常判斷
  check(!d.isDuplicate("new", 100000), "F1 清理過之後仍然正常運作");

  const d2 = createDeduper(500, 5);
  // 同一瞬間塞爆：沒有東西過期，這時不可以把還有效的清掉
  for (let i = 0; i < 20; i++) d2.isDuplicate(`x${i}`, 1000);
  check(d2.isDuplicate("x0", 1100),
    "🛑 F2 超過上限但都還沒過期時，有效的鍵【不會】被清掉");
}

console.log("");
console.log("════════ G. 🛑 SRS：去重救不了它，只有閂鎖可以 ════════");
{
  // SRS 的 correct 永遠是 NULL，自評放在 self_rating——而 self_rating
  // 【不在去重鍵裡】。forgot 與 easy 因此產生一模一樣的鍵。
  const forgot = attemptKey({ wordId: "w1", exerciseType: "srs", sessionId: "s", correct: null });
  const easy   = attemptKey({ wordId: "w1", exerciseType: "srs", sessionId: "s", correct: null });
  check(forgot === easy,
    "🛑 G1 forgot 與 easy 的去重鍵完全相同——去重分不出這是兩個不同的自評");

  // 後果：誤點兩顆不同的按鈕時，去重會吃掉其中一筆，
  //       但留下的是先送到的那一筆，不是學生真正想選的那一筆。
  const d = createDeduper(500);
  check(!d.isDuplicate(forgot, 0), "G2 第一下（forgot）送出去了");
  check(d.isDuplicate(easy, 50),
    "🛑 G3 第二下（easy）被去重吃掉——看起來沒事，其實記下的是誤點的那一顆");

  // 所以真正的防線是閂鎖：第二下根本不會走到寫入口。
  const latch = createLatch();
  const sent: string[] = [];
  const respond = (rating: string) => {
    if (!latch.tryAcquire()) return;
    sent.push(rating);
  };
  respond("forgot");
  respond("easy");
  check(sent.length === 1, "🛑 G4 有閂鎖時只送一筆");
  check(sent[0] === "forgot", "G5 送的是第一下");

  // 沒有閂鎖的話（SRS 修正前就是這樣）兩筆都會送出去。
  const noLatch: string[] = [];
  const respondUnguarded = (rating: string) => { noLatch.push(rating); };
  respondUnguarded("forgot");
  respondUnguarded("easy");
  check(noLatch.length === 2,
    "🛑 G6 沒有閂鎖時兩筆都送出去——這就是修正前 SRS 的樣子");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
