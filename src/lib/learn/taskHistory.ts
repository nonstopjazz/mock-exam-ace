import type { TaskStateKey } from "@/components/learn/student/studentTokens";
import type { DueType, Recurrence, TaskType, TeacherStatus } from "./tasks";

/**
 * 已結束（封存）的任務 —— 學生端的唯讀回顧。
 *
 * 對應 learn_student_task_history() 的回傳形狀。
 *
 * 🛑 這裡的型別刻意【不】重用 StudentHomework。兩者看起來很像，但意義不同：
 *    待辦的 resolved_due_date 是「還要在哪天以前做完」，
 *    歷史的 due_date 是「當初排定的日期」，而且 NEXT_CLASS 那種後端根本不回傳
 *    （班級的下次上課日會往前走，對一份三個月前就結束的作業算出來是錯的）。
 *    共用同一個型別就會共用同一套顯示邏輯，然後把錯的日期畫出來。
 */
export interface StudentTaskHistoryItem {
  task_id: string;
  type: TaskType;
  title: string;
  instruction: string | null;
  class_id: string;
  class_name: string;
  /** 封存時間。舊資料沒有這個值（當初沒有回填，見 add_learn_tasks_archived_at.sql）。 */
  archived_at: string | null;
  due_type: DueType | null;
  /** 只有 CUSTOM_DATE 會有值；NEXT_CLASS 後端刻意回 null。 */
  due_date: string | null;
  recurrence: Recurrence | null;
  target_per_period: number | null;
  student_reported: boolean;
  student_reported_at: string | null;
  teacher_status: TeacherStatus | null;
  teacher_percent: number | null;
  teacher_note: string | null;
  teacher_checked_at: string | null;
  /** 週期任務整段期間的累計次數。作業型別是 0。 */
  total_logged: number;
}

export interface StudentTaskHistoryPayload {
  items: StudentTaskHistoryItem[];
  /** 總數，不受 limit 影響 */
  total: number;
  truncated: boolean;
}

/**
 * 結束時的最終狀態。
 *
 * 🛑 措辭與待辦【不一樣】，這是刻意的。
 *    待辦的「我已完成 · 待老師確認」隱含「老師之後會看」——
 *    但這份作業已經結束了，老師不會再看了。對已結束的項目說「待確認」
 *    等於讓學生一直等一個不會來的結果。
 *    所以這裡說的是「老師未檢查」：陳述事實，不給不存在的期待。
 *
 * icon 與顏色沿用 TASK_STATE，視覺語彙與站上其他地方一致。
 */
export const historyState = (
  item: StudentTaskHistoryItem,
): { key: TaskStateKey; label: string } => {
  if (item.teacher_status === "DONE") return { key: "verified", label: "老師已確認完成" };
  if (item.teacher_status === "PARTIAL")
    return { key: "partial", label: `老師檢查：完成 ${item.teacher_percent ?? 0}%` };
  if (item.teacher_status === "NOT_DONE")
    return { key: "unchecked", label: "老師檢查：尚未完成" };
  if (item.student_reported) return { key: "self", label: "我回報完成 · 老師未檢查" };
  return { key: "none", label: "未回報完成" };
};

/**
 * 依「結束時間」分組的標題，例如 "2026 年 9 月"。
 *
 * 🛑 沒有封存時間的那些要自成一組，不能混進任何一個月份。
 *    舊資料當初刻意沒有回填 archived_at（拿 updated_at 去填會得到一個
 *    看起來精確、實際上是編的日期），所以這裡只能誠實說不知道。
 */
export const historyGroupLabel = (ts: string | null): string => {
  if (!ts) return "時間不詳";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "時間不詳";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
};

/** 依結束月份分組，順序沿用後端給的排序（新的在前），不重新排。 */
export const groupHistory = (
  items: StudentTaskHistoryItem[],
): { label: string; items: StudentTaskHistoryItem[] }[] => {
  const groups: { label: string; items: StudentTaskHistoryItem[] }[] = [];
  for (const item of items) {
    const label = historyGroupLabel(item.archived_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
};
