/**
 * 焦點任務挑選規則的自我檢查
 *
 *   npm run verify:task-focus
 *
 * 這個檔案存在的重點是第一個案例：Dashboard 的焦點【不能】沿用清單的排序。
 * 清單把「還沒做的」排前面是對的；但用同一套規則挑唯一一件焦點時，
 * 一份三週後才截止的新作業會蓋過一份昨天就逾期的作業 —— 最急的那件反而不是焦點。
 *
 * 兩套規則必須各自維持，不要為了「一致」把它們合併。
 */

import {
  needsAction,
  pickFocus,
  sortHomework,
  type StudentHomework,
  type TeacherStatus,
} from "../src/lib/learn/tasks";

const TODAY = "2026-09-08";
const hw = (
  id: string,
  due: string | null,
  teacher: TeacherStatus | null = null,
  reported = false,
  created = "2026-09-01",
): StudentHomework =>
  ({
    task_id: id, title: id, instruction: null, class_id: "c", class_name: "班",
    due_type: due ? "CUSTOM_DATE" : "NEXT_CLASS", resolved_due_date: due,
    student_reported: reported, student_reported_at: null,
    teacher_status: teacher, teacher_percent: null, teacher_note: null,
    teacher_checked_at: null, created_at: created,
  }) as StudentHomework;

let fail = 0;
const check = (name: string, got: string | null, want: string | null) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${got}（預期 ${want}）`);
};

// 1. 這就是原本會出錯的情境：新作業三週後到期 vs 老師標記未完成、昨天逾期
check(
  "逾期的贏過三週後才到期的新作業",
  pickFocus([hw("新作業-9/29", "2026-09-29"), hw("逾期-9/7", "2026-09-07", "NOT_DONE")], TODAY)?.task_id ?? null,
  "逾期-9/7",
);
// 對照：清單排序仍然把「尚未完成」排前面，這是刻意的
check(
  "清單排序不受影響（尚未完成仍在前）",
  sortHomework([hw("新作業-9/29", "2026-09-29"), hw("逾期-9/7", "2026-09-07", "NOT_DONE")])[0].task_id,
  "新作業-9/29",
);
// 2. 兩件都逾期 → 逾期最久的優先
check(
  "逾期最久的優先",
  pickFocus([hw("逾期-9/6", "2026-09-06"), hw("逾期-9/2", "2026-09-02")], TODAY)?.task_id ?? null,
  "逾期-9/2",
);
// 3. 都沒逾期 → 截止日最近的
check(
  "都沒逾期時取最近的截止日",
  pickFocus([hw("9/20", "2026-09-20"), hw("9/10", "2026-09-10")], TODAY)?.task_id ?? null,
  "9/10",
);
// 4. 沒有排定日期的排最後
check(
  "沒有截止日的排最後",
  pickFocus([hw("未排定", null), hw("9/30", "2026-09-30")], TODAY)?.task_id ?? null,
  "9/30",
);
// 5. 全部沒有日期 → 用狀態，再用建立時間
check(
  "全部沒有日期時用狀態決勝（none 優先於 partial）",
  pickFocus([hw("部分完成", null, "PARTIAL"), hw("尚未完成", null)], TODAY)?.task_id ?? null,
  "尚未完成",
);
check(
  "狀態也相同時用建立時間",
  pickFocus([hw("較新", null, null, false, "2026-09-05"), hw("較舊", null, null, false, "2026-09-01")], TODAY)?.task_id ?? null,
  "較舊",
);
// 6. 已回報待確認 / 老師已確認 都不會被選為焦點
check(
  "已回報待確認不會是焦點",
  pickFocus([hw("已回報", "2026-09-01", null, true), hw("還沒做", "2026-09-25")], TODAY)?.task_id ?? null,
  "還沒做",
);
check(
  "老師已確認完成不會是焦點",
  pickFocus([hw("已確認", "2026-09-01", "DONE"), hw("還沒做", "2026-09-25")], TODAY)?.task_id ?? null,
  "還沒做",
);
check("沒有可行動的作業時回傳 null", pickFocus([hw("已確認", "2026-09-01", "DONE")], TODAY)?.task_id ?? null, null);
check("空陣列回傳 null", pickFocus([], TODAY)?.task_id ?? null, null);
// 7. needsAction 的定義沒被動到
check("needsAction 仍認得部分完成", String(needsAction(hw("x", null, "PARTIAL"))), "true");

console.log(fail === 0 ? "\n全部通過" : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
