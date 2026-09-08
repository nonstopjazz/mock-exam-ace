import type { TaskStateKey } from "@/components/learn/student/studentTokens";

/**
 * 班級任務系統的共用型別與衍生規則。
 *
 * 這裡的型別對應 learn_student_tasks() / learn_admin_class_detail() 的回傳形狀。
 * 🛑 所有「今天 / 本週 / 截止日」的判斷都以後端傳來的 today 與 resolved_due_date
 *    為準，前端不自己算 —— 資料庫是 UTC，學生在台灣，兩邊各自推算一定會漂移。
 */

export type TaskType = "HOMEWORK" | "RECURRING";
export type DueType = "NEXT_CLASS" | "CUSTOM_DATE" | "NONE";
export type Recurrence = "DAILY" | "WEEKLY";
export type TeacherStatus = "DONE" | "PARTIAL" | "NOT_DONE";

export interface StudentHomework {
  task_id: string;
  title: string;
  instruction: string | null;
  class_id: string;
  class_name: string;
  due_type: DueType;
  /** NEXT_CLASS 由班級的 next_class_date 解析而來；還沒排定就是 null */
  resolved_due_date: string | null;
  student_reported: boolean;
  student_reported_at: string | null;
  teacher_status: TeacherStatus | null;
  teacher_percent: number | null;
  teacher_note: string | null;
  teacher_checked_at: string | null;
  created_at: string;
}

export interface StudentRecurring {
  task_id: string;
  title: string;
  instruction: string | null;
  class_id: string;
  class_name: string;
  recurrence: Recurrence;
  target_per_period: number;
  period_start: string;
  today_count: number;
  period_count: number;
}

export interface StudentTasksPayload {
  today: string;
  homework: StudentHomework[];
  recurring: StudentRecurring[];
}

/* ---------- 狀態衍生 ---------- */

/**
 * 🛑 學生自述 ≠ 老師確認。這兩件事在資料庫是不同欄位，在畫面上也必須是不同狀態，
 *    學生要看得出來「我以為完成的」和「真的被確認的」不是同一件事。
 */
export const homeworkState = (
  hw: StudentHomework,
): { key: TaskStateKey; label: string } => {
  if (hw.teacher_status === "DONE") return { key: "verified", label: "老師已確認完成" };
  if (hw.teacher_status === "PARTIAL")
    return { key: "partial", label: `老師檢查：完成 ${hw.teacher_percent ?? 0}%` };
  if (hw.teacher_status === "NOT_DONE")
    return { key: "unchecked", label: "老師檢查：尚未完成" };
  if (hw.student_reported) return { key: "self", label: "我已完成 · 待老師確認" };
  return { key: "none", label: "尚未完成" };
};

/** 還需要學生做點什麼嗎？決定它排在第一層還是第二層。 */
export const needsAction = (hw: StudentHomework) => {
  const { key } = homeworkState(hw);
  return key === "none" || key === "partial" || key === "unchecked";
};

/** 已經有結論、學生不用再管的 */
export const isSettled = (hw: StudentHomework) => homeworkState(hw).key === "verified";

const RANK: Record<TaskStateKey, number> = {
  none: 1,
  unchecked: 2,
  partial: 3,
  in_progress: 4,
  followup: 4,
  self: 5,
  resubmitted: 5,
  verified: 6,
};

/** 先分「還需行動 / 不需立即行動」，層內再依狀態，最後才看截止日。 */
export const sortHomework = (list: StudentHomework[]) =>
  [...list].sort((a, b) => {
    const ra = RANK[homeworkState(a).key];
    const rb = RANK[homeworkState(b).key];
    if (ra !== rb) return ra - rb;
    const da = a.resolved_due_date ?? "9999-12-31";
    const db = b.resolved_due_date ?? "9999-12-31";
    return da.localeCompare(db);
  });

/* ---------- 日期 ---------- */

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

/** Date.UTC 的月份是 0 起算——不減 1 的話跨月的天數差會算錯（1/31 vs 2/1 會變成 -2）。 */
const utcOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const dayDiff = (isoDate: string, today: string) =>
  Math.round((utcOf(isoDate) - utcOf(today)) / 86_400_000);

/**
 * 截止日的說法。
 * 🛑 還沒排定下次上課日期時顯示「下次上課前」，而不是編一個假日期出來。
 */
export const dueLabel = (hw: StudentHomework, today: string): string => {
  if (!hw.resolved_due_date) {
    if (hw.due_type === "NEXT_CLASS") return "下次上課前";
    return "沒有截止日";
  }
  const diff = dayDiff(hw.resolved_due_date, today);
  if (diff < 0) return `已逾期 ${-diff} 天`;
  if (diff === 0) return "今天到期";
  if (diff === 1) return "明天到期";
  const [, m, d] = hw.resolved_due_date.split("-").map(Number);
  const wd = new Date(`${hw.resolved_due_date}T00:00:00Z`).getUTCDay();
  return `${m} 月 ${d} 日（週${WEEKDAY[wd]}）`;
};

/** 逾期只在還需要處理時才算逾期——老師已經確認完成的不該再標紅。 */
export const isOverdue = (hw: StudentHomework, today: string) =>
  !!hw.resolved_due_date && dayDiff(hw.resolved_due_date, today) < 0 && needsAction(hw);

export const formatDate = (iso: string | null): string => {
  if (!iso) return "未排定";
  const [, m, d] = iso.split("-").map(Number);
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return `${m} 月 ${d} 日（週${WEEKDAY[wd]}）`;
};

/**
 * 焦點任務 —— Dashboard 上唯一被放大的那一件。
 *
 * 🛑 挑選規則刻意與 sortHomework() 不同，不要「統一」它們。
 *
 *    sortHomework() 是【清單】的順序：一列一列往下讀，把還沒做的排前面很合理。
 *    但拿同一套規則挑【唯一一件】焦點會出事 —— 狀態壓過日期時，
 *    一份三週後才截止的新作業（none，rank 1）會排在一份【昨天就逾期】、
 *    老師還標了未完成的作業（unchecked，rank 2）前面，最急的那件反而不是焦點。
 *
 *    所以焦點以【急迫度】為主：逾期最久的優先，其次依截止日由近到遠，
 *    沒有排定日期的排最後（NEXT_CLASS 還沒排課、或根本沒有截止日），
 *    完全同分時才用狀態與建立時間決定。
 *
 * 老師不需要、也沒有辦法「指定」焦點：焦點是對【某一個學生】而言的，
 * 同一份作業對已經做完的甲和還沒動的乙重要性完全不同。老師是用截止日在控制它。
 */
export const pickFocus = (
  list: StudentHomework[],
  today: string,
): StudentHomework | null => {
  const actionable = list.filter(needsAction);
  if (actionable.length === 0) return null;

  // 逾期為負、今天為 0、未來為正 —— 一個數字就同時表達了「逾期優先」與「越近越前」
  const urgency = (hw: StudentHomework) =>
    hw.resolved_due_date ? dayDiff(hw.resolved_due_date, today) : Number.POSITIVE_INFINITY;

  return [...actionable].sort((a, b) => {
    const ua = urgency(a);
    const ub = urgency(b);
    if (ua !== ub) return ua - ub;
    const ra = RANK[homeworkState(a).key];
    const rb = RANK[homeworkState(b).key];
    if (ra !== rb) return ra - rb;
    return a.created_at.localeCompare(b.created_at);
  })[0];
};

/* ---------- 常態練習 ---------- */

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  DAILY: "每天",
  WEEKLY: "每週",
};

/** 「每天 1 次」/「每週 3 次」——目標本身就是說明，不需要另外一行文案。 */
export const recurringTargetLabel = (r: StudentRecurring) =>
  `${RECURRENCE_LABEL[r.recurrence]} ${r.target_per_period} 次`;

/** 當期進度。DAILY 的「當期」就是今天，WEEKLY 是本週（週一起算）。 */
export const recurringProgress = (r: StudentRecurring) => {
  const done = r.recurrence === "DAILY" ? r.today_count : r.period_count;
  const target = Math.max(1, r.target_per_period);
  return {
    done,
    target,
    met: done >= target,
    percent: Math.min(100, Math.round((done / target) * 100)),
    periodLabel: r.recurrence === "DAILY" ? "今天" : "本週",
  };
};

/* ---------- 老師端 ---------- */

export const TEACHER_STATUS_LABEL: Record<TeacherStatus, string> = {
  DONE: "完成",
  PARTIAL: "部分完成",
  NOT_DONE: "未完成",
};

export interface AdminAssignee {
  student_id: string;
  display_name: string;
  student_reported: boolean;
  student_reported_at: string | null;
  teacher_status: TeacherStatus | null;
  teacher_percent: number | null;
  teacher_note: string | null;
  teacher_checked_at: string | null;
  period_count: number;
}

export interface AdminTask {
  task_id: string;
  type: TaskType;
  title: string;
  instruction: string | null;
  due_type: DueType | null;
  due_date: string | null;
  resolved_due_date: string | null;
  recurrence: Recurrence | null;
  target_per_period: number | null;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string;
  assignees: AdminAssignee[];
}

export interface AdminMember {
  student_id: string;
  display_name: string;
  email: string | null;
  grade: string | null;
  joined_at: string;
}

export interface AdminClass {
  id: string;
  name: string;
  next_class_date: string | null;
  status: "ACTIVE" | "ARCHIVED";
  note: string | null;
  created_at: string;
}

export interface AdminClassSummary extends AdminClass {
  member_count: number;
  homework_count: number;
  recurring_count: number;
  unchecked_count: number;
}

export interface AdminClassDetail {
  class: AdminClass;
  members: AdminMember[];
  tasks: AdminTask[];
  today: string;
}

export interface StudentSearchResult {
  student_id: string;
  display_name: string;
  email: string | null;
  grade: string | null;
  school: string | null;
  already_member: boolean;
}
