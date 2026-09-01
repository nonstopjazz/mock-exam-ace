/**
 * Student Task Center — mock data (prototype v1)
 *
 * 🛑 全部為 UI prototype 的假資料。沒有 backend、沒有 schema、沒有 rule engine。
 *
 * 任務型別沿用 Teacher Workspace 已確定的三種概念：
 *   Next-session Homework（紙本）/ Digital Assignment / External Assignment
 * 狀態語彙沿用 Student Dashboard v1.2 的 studentTokens。
 * 🛑 Recurring Practice 不進 Task Center，它仍活在 Today Practice / Learning Rhythm。
 */
import type { HomeworkStatus } from "./teacherSessionMock";
import type { TaskStateKey } from "@/components/learn/student/studentTokens";

export type TaskKind = "paper" | "digital" | "external";

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  paper: "紙本",
  digital: "線上任務",
  external: "外部作業",
};

/** 部分完成之後，學生自己選擇要不要補 */
export type FollowUp = "none" | "chosen" | "submitted";

export interface TeacherCheck {
  status: HomeworkStatus;
  /** 只有 partial 有意義 */
  percent?: number;
  /** 老師備註，例如「P.23–25 尚未完成」 */
  note?: string;
  /** 還需要補完的範圍 */
  remaining?: string;
}

export interface StudentTask {
  id: string;
  title: string;
  kind: TaskKind;
  /** 老師的說明；有說明的線上任務會先進 detail 再開始 */
  instruction?: string;
  /** external 專用 */
  sourceName?: string;
  externalUrl?: string;
  dueLabel: string;
  /** 排序用，數字越小越急 */
  urgency: number;
  /** 例如「12 題 · 約 15 分鐘」 */
  estimateLabel?: string;
  /** 線上任務是否需要先看說明（§20 的 A / B 規則） */
  needsDetail?: boolean;

  /* 狀態 —— 三種來源刻意分開存 */
  studentReported: boolean;
  autoCompleted: boolean;
  progress?: { done: number; total: number };
  score?: { value: number; total: number };
  teacherCheck: TeacherCheck | null;
  followUp: FollowUp;
}

export interface HistoryTask {
  id: string;
  title: string;
  kind: TaskKind;
  /** 這一筆最後的結果怎麼來的 */
  resultSource: "AUTO" | "TEACHER" | "SELF";
  resultLabel: string;
  /** partial 未補完的，保留為當週的歷史事實 */
  partialPercent?: number;
}

export interface HistoryWeek {
  label: string;
  tasks: HistoryTask[];
}

/* ---------- 狀態推導 ---------- */

/**
 * 🛑 Law 2：學生自述 ≠ 老師確認。
 * 🛑 Law 3：線上任務由平台自己記錄，學生不需要自述。
 */
export const taskStateOf = (t: StudentTask): { key: TaskStateKey; label: string } => {
  if (t.teacherCheck) {
    const { status, percent } = t.teacherCheck;
    if (status === "done") return { key: "verified", label: "老師已確認完成" };
    if (status === "partial") {
      if (t.followUp === "submitted")
        return { key: "resubmitted", label: "我已補完 · 待老師再次確認" };
      if (t.followUp === "chosen") return { key: "followup", label: "準備補完" };
      return { key: "partial", label: `老師檢查：完成 ${percent}%` };
    }
    return { key: "unchecked", label: "老師檢查：尚未完成" };
  }
  if (t.kind === "digital") {
    if (t.autoCompleted) return { key: "verified", label: "已完成" };
    if (t.progress && t.progress.done > 0)
      return { key: "in_progress", label: `進行中 ${t.progress.done} / ${t.progress.total}` };
    return { key: "none", label: "尚未完成" };
  }
  if (t.studentReported) return { key: "self", label: "我已完成 · 待老師確認" };
  return { key: "none", label: "尚未完成" };
};

/** 還需要學生做點什麼嗎？決定它排在第一層還是第二層 */
export const needsAction = (t: StudentTask) => {
  const { key } = taskStateOf(t);
  return key === "in_progress" || key === "none" || key === "followup";
};

/**
 * §9 的排序：先分「還需行動 / 不需立即行動」兩層，層內再依狀態，最後才看急迫度。
 */
const RANK: Record<TaskStateKey, number> = {
  in_progress: 1,
  none: 2,
  followup: 3,
  partial: 4,
  self: 5,
  resubmitted: 5,
  unchecked: 5,
  verified: 6,
};

export const sortTasks = (tasks: StudentTask[]) =>
  [...tasks].sort((a, b) => {
    const ra = RANK[taskStateOf(a).key];
    const rb = RANK[taskStateOf(b).key];
    return ra !== rb ? ra - rb : a.urgency - b.urgency;
  });

/* ---------- Scenario ---------- */

export type TaskStudentId = "amy" | "brian";

export interface TaskScenario {
  id: TaskStudentId;
  switchLabel: string;
  name: string;
  initials: string;
  className: string;
  nextClass: { dateLabel: string; timeLabel: string; relativeLabel: string };
  /** 這一堂課週期內老師交代的所有事情 */
  tasks: StudentTask[];
  history: HistoryWeek[];
  /** Task Center 只放一行參考，不把每日練習展開成任務 */
  recurringToday: number;
}

const NEXT_CLASS = { dateLabel: "9 月 3 日（三）", timeLabel: "18:30", relativeLabel: "明天" };

/* ---------- Amy ---------- */

const amy: TaskScenario = {
  id: "amy",
  switchLabel: "Amy",
  name: "Amy Chen",
  initials: "A",
  className: "高二英文 A班",
  nextClass: NEXT_CLASS,
  recurringToday: 2,
  tasks: [
    {
      id: "a-t1", kind: "paper", title: "翻譯題本 P.20–25",
      instruction: "第 1–3 大題，寫在題本上帶來。",
      dueLabel: "次堂課", urgency: 2,
      studentReported: true, autoCompleted: false, teacherCheck: null, followUp: "none",
    },
    {
      id: "a-t2", kind: "paper", title: "克漏字 Unit 6",
      instruction: "整份寫完。",
      dueLabel: "次堂課", urgency: 2,
      studentReported: true, autoCompleted: false,
      teacherCheck: { status: "done" }, followUp: "none",
    },
    {
      id: "a-t3", kind: "external", title: "竹北高中第二次段考考題",
      instruction: "只要寫「閱讀測驗」那一大題，其他不用。",
      sourceName: "Google Classroom",
      externalUrl: "https://classroom.google.com/",
      dueLabel: "次堂課", urgency: 1,
      studentReported: false, autoCompleted: false, teacherCheck: null, followUp: "none",
    },
    {
      id: "a-t4", kind: "digital", title: "Reading Quiz #13",
      estimateLabel: "12 題 · 約 15 分鐘",
      dueLabel: "次堂課", urgency: 1,
      studentReported: false, autoCompleted: false,
      progress: { done: 0, total: 12 }, teacherCheck: null, followUp: "none",
    },
    {
      id: "a-t5", kind: "digital", title: "Listening Quiz #4",
      estimateLabel: "8 題 · 約 10 分鐘",
      dueLabel: "次堂課", urgency: 3,
      studentReported: false, autoCompleted: true,
      progress: { done: 8, total: 8 }, score: { value: 82, total: 100 },
      teacherCheck: null, followUp: "none",
    },
  ],
  history: [
    {
      label: "上週 · 8/25–8/31",
      tasks: [
        { id: "a-h1", title: "Listening Quiz #3", kind: "digital", resultSource: "AUTO", resultLabel: "78 / 100" },
        { id: "a-h2", title: "翻譯題本 P.14–19", kind: "paper", resultSource: "TEACHER", resultLabel: "老師已確認完成" },
        // 🛑 沒有補完的部分完成，保留為當週的歷史事實，不會被帶到這一週繼續追
        { id: "a-h3", title: "單字表 Unit 4", kind: "paper", resultSource: "TEACHER", resultLabel: "老師檢查：完成 80%", partialPercent: 80 },
      ],
    },
  ],
};

/* ---------- Brian ---------- */

const brian: TaskScenario = {
  id: "brian",
  switchLabel: "Brian",
  name: "Brian Wu",
  initials: "B",
  className: "高二英文 A班",
  nextClass: NEXT_CLASS,
  recurringToday: 2,
  tasks: [
    {
      id: "b-t1", kind: "paper", title: "翻譯題本 P.20–25",
      instruction: "第 1–3 大題，寫在題本上帶來。",
      dueLabel: "次堂課", urgency: 2,
      studentReported: true, autoCompleted: false,
      teacherCheck: {
        status: "partial", percent: 60,
        note: "P.23–25 尚未完成，其他寫得不錯。",
        remaining: "P.23–25",
      },
      followUp: "none",
    },
    {
      id: "b-t2", kind: "paper", title: "克漏字 Unit 6",
      instruction: "整份寫完。",
      dueLabel: "次堂課", urgency: 2,
      studentReported: false, autoCompleted: false, teacherCheck: null, followUp: "none",
    },
    {
      id: "b-t3", kind: "external", title: "竹北高中第二次段考考題",
      instruction: "只要寫「閱讀測驗」那一大題，其他不用。",
      sourceName: "Google Classroom",
      externalUrl: "https://classroom.google.com/",
      dueLabel: "次堂課", urgency: 1,
      studentReported: true, autoCompleted: false, teacherCheck: null, followUp: "none",
    },
    {
      id: "b-t4", kind: "digital", title: "Reading Quiz #13",
      estimateLabel: "12 題 · 約 15 分鐘",
      instruction: "先讀完文章再作答，作答時不要查字典。",
      needsDetail: true,
      dueLabel: "次堂課", urgency: 1,
      studentReported: false, autoCompleted: false,
      progress: { done: 6, total: 12 }, teacherCheck: null, followUp: "none",
    },
    {
      id: "b-t5", kind: "digital", title: "Listening Quiz #4",
      estimateLabel: "8 題 · 約 10 分鐘",
      dueLabel: "次堂課", urgency: 3,
      studentReported: false, autoCompleted: true,
      progress: { done: 8, total: 8 }, score: { value: 82, total: 100 },
      teacherCheck: null, followUp: "none",
    },
  ],
  history: [
    {
      label: "上週 · 8/25–8/31",
      tasks: [
        { id: "b-h1", title: "Reading Quiz #12", kind: "digital", resultSource: "AUTO", resultLabel: "72 / 100" },
        { id: "b-h2", title: "克漏字 Unit 5", kind: "paper", resultSource: "TEACHER", resultLabel: "老師檢查：完成 50%", partialPercent: 50 },
        { id: "b-h3", title: "單字表 Unit 4", kind: "paper", resultSource: "TEACHER", resultLabel: "老師已確認完成" },
      ],
    },
  ],
};

export const TASK_SCENARIOS: Record<TaskStudentId, TaskScenario> = { amy, brian };
