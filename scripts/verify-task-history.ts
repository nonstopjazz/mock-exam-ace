/**
 * 已結束作業的純邏輯驗證。
 *
 *   npm run verify:task-history
 *
 * 不碰資料庫、不碰 React —— 只驗 historyState() 與 groupHistory() 這兩段規則。
 * 資料庫那一側（誰看得到什麼、封存前後的進出）在
 * supabase/tests/learn_student_task_history_test.sql，由 run-learn-tasks.sh 執行。
 */

import {
  groupHistory,
  historyGroupLabel,
  historyState,
  type StudentTaskHistoryItem,
} from "../src/lib/learn/taskHistory";

let failures = 0;
const check = (cond: boolean, label: string) => {
  if (cond) console.log(`PASS  ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}`);
  }
};

const item = (over: Partial<StudentTaskHistoryItem> = {}): StudentTaskHistoryItem => ({
  task_id: "t1",
  type: "HOMEWORK",
  title: "第一週作業",
  instruction: null,
  class_id: "c1",
  class_name: "週三班",
  archived_at: "2026-09-20T03:00:00Z",
  due_type: "CUSTOM_DATE",
  due_date: "2026-09-15",
  recurrence: null,
  target_per_period: null,
  student_reported: false,
  student_reported_at: null,
  teacher_status: null,
  teacher_percent: null,
  teacher_note: null,
  teacher_checked_at: null,
  total_logged: 0,
  ...over,
});

console.log("════════ A. 最終狀態 ════════");
{
  check(historyState(item({ teacher_status: "DONE" })).key === "verified", "A1 DONE → verified");
  check(
    historyState(item({ teacher_status: "PARTIAL", teacher_percent: 60 })).label.includes("60%"),
    "A2 PARTIAL 帶出百分比",
  );
  check(
    historyState(item({ teacher_status: "PARTIAL", teacher_percent: null })).label.includes("0%"),
    "A3 PARTIAL 但沒有百分比 → 0%，不是 undefined",
  );
  check(
    historyState(item({ teacher_status: "NOT_DONE" })).key === "unchecked",
    "A4 NOT_DONE → unchecked",
  );
  check(historyState(item({ student_reported: true })).key === "self", "A5 只有自述 → self");
  check(historyState(item()).key === "none", "A6 什麼都沒有 → none");
}

console.log("");
console.log("════════ B. 🛑 已結束就不能說「待老師確認」 ════════");
{
  // 這份作業已經封存了，老師不會再看。沿用待辦的措辭等於讓學生
  // 一直等一個不會來的結果。
  const label = historyState(item({ student_reported: true })).label;
  check(!label.includes("待"), `🛑 B1 自述完成的措辭不含「待」（實際："${label}"）`);
  check(label.includes("未檢查"), "🛑 B2 而是明說老師未檢查");

  // 老師真的看過的那幾種，措辭要保留「老師」，學生才知道那是誰的判定
  for (const st of ["DONE", "PARTIAL", "NOT_DONE"] as const) {
    check(
      historyState(item({ teacher_status: st, teacher_percent: 50 })).label.startsWith("老師"),
      `B3-${st} 老師看過的狀態，措辭以「老師」開頭`,
    );
  }
}

console.log("");
console.log("════════ C. 老師的判定蓋過自述 ════════");
{
  // 學生說做完了、老師說沒有 —— 要顯示老師的判定，不是學生的。
  const both = item({ student_reported: true, teacher_status: "NOT_DONE" });
  check(historyState(both).key === "unchecked", "🛑 C1 自述完成但老師說未完成 → 顯示老師的");
  check(!historyState(both).label.includes("我"), "C2 而且措辭不會變成「我回報完成」");
}

console.log("");
console.log("════════ D. 依月份分組 ════════");
{
  check(historyGroupLabel("2026-09-20T03:00:00Z").includes("9 月"), "D1 有時間 → 年月");
  check(historyGroupLabel(null) === "時間不詳", "🛑 D2 沒有封存時間的自成一組");
  check(historyGroupLabel("not-a-date") === "時間不詳", "D3 壞掉的時間不會變成 NaN 月");

  const groups = groupHistory([
    item({ task_id: "a", archived_at: "2026-09-20T03:00:00Z" }),
    item({ task_id: "b", archived_at: "2026-09-02T03:00:00Z" }),
    item({ task_id: "c", archived_at: "2026-08-28T03:00:00Z" }),
    item({ task_id: "d", archived_at: null }),
  ]);
  check(groups.length === 3, "D4 九月、八月、時間不詳 → 三組");
  check(groups[0].items.length === 2, "D5 同月份的併在一起");
  check(groups[2].label === "時間不詳", "D6 沒有時間的排在最後（後端已排好，前端不重排）");

  // 🛑 分組【不】重新排序：後端已經照 archived_at DESC 排好了。
  //    前端再排一次，兩邊的規則哪天不一致就會出現看不懂的順序。
  const unsorted = groupHistory([
    item({ task_id: "x", archived_at: "2026-08-01T00:00:00Z" }),
    item({ task_id: "y", archived_at: "2026-09-01T00:00:00Z" }),
  ]);
  check(
    unsorted[0].label.includes("8 月"),
    "🛑 D7 保留後端給的順序，不自作主張重排",
  );

  check(groupHistory([]).length === 0, "D8 空陣列不會爆");
}

console.log("");
console.log("════════ E. 時區 ════════");
{
  // 🛑 這一段【必須】在 Asia/Taipei 下跑，否則證明不了任何事。
  //    第一版是拿 getMonth() 去比 getMonth()——在 UTC 容器裡必然通過，
  //    等於沒測。要分辨「用當地時間」與「用 UTC 字串前十碼」，
  //    只有在兩者會給出不同答案的時區才做得到。
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMin = -new Date("2026-08-31T16:00:00Z").getTimezoneOffset();
  check(
    offsetMin === 480,
    `🛑 E0 這段要在 UTC+8 下跑（目前：${tz}，UTC${offsetMin >= 0 ? "+" : ""}${offsetMin / 60}）` +
      " —— 用 npm run verify:task-history，它會設好 TZ",
  );

  if (offsetMin === 480) {
    // UTC 的 8/31 16:00，在台灣已經是 9/1 凌晨。
    const ts = "2026-08-31T16:00:00Z";
    check(
      historyGroupLabel(ts) === "2026 年 9 月",
      `🛑 E1 用當地時間分月（實際："${historyGroupLabel(ts)}"）`,
    );
    // 把錯的做法寫出來當對照：字串前十碼會說 8 月。
    const naive = `${ts.slice(0, 4)} 年 ${Number(ts.slice(5, 7))} 月`;
    check(
      naive === "2026 年 8 月" && historyGroupLabel(ts) !== naive,
      "🛑 E2 對照：slice(0,10) 會錯一個月，而我們沒有那樣做",
    );
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} 項未通過`);
  process.exit(1);
}
console.log("全部通過");
