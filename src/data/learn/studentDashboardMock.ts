/**
 * Student Dashboard — mock data (prototype v1)
 *
 * 🛑 全部為 UI prototype 的假資料，沒有 backend、沒有 schema、沒有 mastery algorithm。
 *
 * 作業模型刻意沿用 Teacher Workspace 已確定的三種概念，型別直接 import：
 *   Next-session Homework / Recurring Practice / Digital Assignment
 * 字彙的熟悉度桶則沿用既有 vocabularyStore 的定義（new / learning / reviewing / mastered），
 * 不在這裡重新發明。
 */
import type { HomeworkStatus, AssessmentSource, SkillKey } from "./teacherSessionMock";

export type StudentId = "amy" | "brian";

/* ---------- 完成語意 ---------- */

/**
 * 🛑 三種「完成」在產品語意上不同，UI 不可以混為一談：
 *   auto     —— 平台內完成，系統直接記錄
 *   self     —— 學生自行標記紙本 / 外部作業完成，尚待老師檢查
 *   teacher  —— 老師實際檢查後的結論（可能是 done / partial / not_done）
 */
export type CompletionSource = "auto" | "self" | "teacher";

export type TaskKind = "paper" | "external" | "digital";

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  paper: "紙本",
  external: "外部連結",
  digital: "線上任務",
};

export interface TeacherCheck {
  status: HomeworkStatus;
  /** 只有 partial 才有意義 */
  percent?: number;
}

export interface ClassTask {
  id: string;
  title: string;
  kind: TaskKind;
  /** 老師指定的細節，例如「請完成第 1–3 大題」 */
  detail?: string;
  /** kind === "external" 時的來源與連結 */
  sourceName?: string;
  externalUrl?: string;
  /** 學生自己標記完成（紙本 / 外部）。digital 不使用這個欄位 */
  studentReported: boolean;
  /** 平台自動記錄完成（只有 digital 會用） */
  autoCompleted: boolean;
  /** 老師下次上課檢查後的結論；null = 尚未檢查 */
  teacherCheck: TeacherCheck | null;
}

/** 這一項在「下次上課前」是否算準備好了 */
export const isTaskReady = (t: ClassTask) => {
  if (t.teacherCheck) return t.teacherCheck.status === "done";
  return t.kind === "digital" ? t.autoCompleted : t.studentReported;
};

/* ---------- Today's Practice（Recurring Practice 的今日視圖） ---------- */

export interface PracticeItem {
  id: string;
  title: string;
  /** 例如「約 15 分鐘」「1 個活動 · 約 12 分鐘」 */
  meta: string;
  /** online = 平台內可直接開始；paper = 紙本，只能自行標記 */
  mode: "online" | "paper";
  /** 今天是否有安排 */
  scheduledToday: boolean;
  done: boolean;
  doneSource: CompletionSource | null;
  /** online 項目的起始路徑；優先導向既有的字卡 / 練習頁 */
  startPath?: string;
}

/* ---------- My Progress ---------- */

/**
 * 🛑 這是較長期的彙整視圖，不是單堂 observation，也不是 mastery 分數。
 *    刻意只有四階 + 尚無足夠資料，不顯示 83.7% 這種假精密數字。
 */
export type ProgressLevel = "needs_work" | "building" | "steady" | "strong";

export const PROGRESS_LEVEL_LABEL: Record<ProgressLevel, string> = {
  needs_work: "需要加強",
  building: "累積中",
  steady: "穩定",
  strong: "表現突出",
};

export const PROGRESS_LEVEL_STEP: Record<ProgressLevel, number> = {
  needs_work: 1,
  building: 2,
  steady: 3,
  strong: 4,
};

export type ProgressTrend = "up" | "flat" | "down";

export interface ProgressRow {
  skill: SkillKey;
  /** null = 最近沒有足夠紀錄。🛑 尚未測得不等於能力弱 */
  level: ProgressLevel | null;
  trend: ProgressTrend;
  /** 學生語言的下一步，不是評語 */
  nextAction: string;
  /** 這個視圖是由哪些來源彙整而成（僅語意標示，沒有 evidence weighting） */
  sources: AssessmentSource[];
}

/* ---------- Learning Rhythm ---------- */

export interface RhythmTrack {
  label: string;
  /** true = 當天有完成 */
  days: boolean[];
  /** 這一週的目標次數 */
  target: number;
  /** 這一軌的完成是怎麼記錄的 */
  source: CompletionSource;
}

/* ---------- My Vocabulary（既有字卡系統的摘要） ---------- */

export interface VocabPackSummary {
  id: string;
  title: string;
  /** 對應既有 packs.skill_type 的中文標籤 */
  kindLabel: string;
  collected: number;
  /** 這一包裡已經熟悉的項目數 */
  familiar: number;
}

export interface VocabularySummary {
  /** 已收藏的字彙項目總數（可能是單字、片語、句型、高分表達） */
  collected: number;
  familiar: number;
  learning: number;
  reviewDue: number;
  unseen: number;
  streakDays: number;
  packs: VocabPackSummary[];
}

/* ---------- Recent results / feedback ---------- */

export interface ResultItem {
  id: string;
  title: string;
  source: AssessmentSource;
  scoreLabel: string;
  dateLabel: string;
}

export interface FeedbackItem {
  id: string;
  dateLabel: string;
  teacherName: string;
  body: string;
}

/* ---------- Scenario ---------- */

export interface StudentScenario {
  id: StudentId;
  switchLabel: string;
  name: string;
  initials: string;
  grade: string;
  className: string;
  nextClass: { dateLabel: string; timeLabel: string };
  tasks: ClassTask[];
  practice: PracticeItem[];
  progress: ProgressRow[];
  rhythm: RhythmTrack[];
  vocabulary: VocabularySummary;
  results: ResultItem[];
  feedback: FeedbackItem[];
}

/* ---------- Amy：週間也會登入做每日單字複習 ---------- */

const amy: StudentScenario = {
  id: "amy",
  switchLabel: "Amy",
  name: "Amy Chen",
  initials: "A",
  grade: "高二",
  className: "高二英文 A班",
  nextClass: { dateLabel: "9 月 3 日（三）", timeLabel: "18:30" },
  tasks: [
    {
      id: "t1", kind: "paper", title: "翻譯題本 P.20–25",
      detail: "第 1–3 大題，寫在題本上帶來",
      studentReported: true, autoCompleted: false, teacherCheck: null,
    },
    {
      id: "t2", kind: "paper", title: "單字表 Unit 5",
      studentReported: true, autoCompleted: false,
      teacherCheck: { status: "done" },
    },
    {
      id: "t3", kind: "digital", title: "Listening Quiz #4",
      detail: "聽完後作答，平台會自動記錄",
      studentReported: false, autoCompleted: true, teacherCheck: null,
    },
    {
      id: "t4", kind: "paper", title: "課堂講義訂正",
      detail: "把上週錯的題目訂正完",
      studentReported: true, autoCompleted: false, teacherCheck: null,
    },
    {
      id: "t5", kind: "paper", title: "克漏字 Unit 6",
      detail: "整份寫完",
      studentReported: false, autoCompleted: false, teacherCheck: null,
    },
    {
      id: "t6", kind: "external", title: "竹北高中第二次段考考題",
      detail: "老師指定：只要寫「閱讀測驗」那一大題",
      sourceName: "Google Classroom",
      externalUrl: "https://classroom.google.com/",
      studentReported: false, autoCompleted: false, teacherCheck: null,
    },
  ],
  practice: [
    {
      id: "p1", title: "每日單字複習", meta: "18 個待複習 · 約 15 分鐘",
      mode: "online", scheduledToday: true, done: false, doneSource: null,
      startPath: "/practice/vocabulary/srs",
    },
    {
      id: "p2", title: "英文閱讀練習", meta: "1 篇文章 · 約 12 分鐘",
      mode: "online", scheduledToday: true, done: false, doneSource: null,
      startPath: "/practice/vocabulary/collections",
    },
    {
      id: "p3", title: "聽力練習", meta: "今天沒有安排",
      mode: "online", scheduledToday: false, done: false, doneSource: null,
    },
    {
      id: "p4", title: "翻譯每日一句（紙本）", meta: "寫在筆記本上 · 約 5 分鐘",
      mode: "paper", scheduledToday: true, done: false, doneSource: null,
    },
  ],
  progress: [
    { skill: "reading", level: "steady", trend: "up",
      nextAction: "繼續練推論題，這是目前唯一還會猶豫的題型", sources: ["TEACHER", "AUTO"] },
    { skill: "vocabulary", level: "building", trend: "flat",
      nextAction: "這週完成 5 次單字複習就會往上走", sources: ["AUTO"] },
    { skill: "grammar", level: "building", trend: "up",
      nextAction: "時態一致還會漏，寫完翻譯題本後檢查一次動詞", sources: ["TEACHER", "AUTO"] },
    { skill: "listening", level: "steady", trend: "flat",
      nextAction: "細節聽得懂了，下一步練「沒有直接說出來」的推論題", sources: ["AUTO"] },
    { skill: "writing", level: "building", trend: "up",
      nextAction: "段落之間多用連接詞，老師說這是最後一哩", sources: ["AI", "TEACHER"] },
    // 🛑 沒有足夠紀錄 ≠ 能力弱
    { skill: "speaking", level: null, trend: "flat",
      nextAction: "累積幾次口說練習後，這裡就會出現你的進度", sources: [] },
  ],
  rhythm: [
    { label: "單字複習", days: [true, true, true, false, true, true, false], target: 7, source: "auto" },
    { label: "閱讀練習", days: [true, true, false], target: 3, source: "auto" },
    { label: "聽力練習", days: [true, false], target: 2, source: "auto" },
    { label: "紙本練習", days: [true, true], target: 2, source: "self" },
  ],
  vocabulary: {
    collected: 1284, familiar: 742, learning: 410, reviewDue: 18, unseen: 132,
    streakDays: 6,
    packs: [
      { id: "vp1", title: "課本字卡包 · Unit 5", kindLabel: "單字", collected: 180, familiar: 122 },
      { id: "vp2", title: "寫作高分表達", kindLabel: "寫作", collected: 96, familiar: 41 },
      { id: "vp3", title: "學測高頻字彙", kindLabel: "單字", collected: 520, familiar: 318 },
    ],
  },
  results: [
    { id: "r1", title: "Reading Quiz #12", source: "AUTO", scoreLabel: "90", dateLabel: "8/31" },
    { id: "r2", title: "Vocabulary Quiz（紙筆）", source: "TEACHER", scoreLabel: "18 / 20", dateLabel: "8/31" },
    { id: "r3", title: "Writing Task #4", source: "AI", scoreLabel: "16 / 20", dateLabel: "8/28" },
  ],
  feedback: [
    { id: "f1", dateLabel: "8/31", teacherName: "林老師",
      body: "閱讀理解穩定，長句分析有進步。接下來把重點放在推論題。" },
    { id: "f2", dateLabel: "8/24", teacherName: "林老師",
      body: "翻譯的句型選擇比上個月更準確，時態偶爾還會漏，寫完記得檢查。" },
    { id: "f3", dateLabel: "8/17", teacherName: "林老師",
      body: "課堂上很願意舉手回答，這個習慣請保持。" },
  ],
};

/* ---------- Brian：登入主要是為了看「下次上課前還要做什麼」 ---------- */

const brian: StudentScenario = {
  id: "brian",
  switchLabel: "Brian",
  name: "Brian Wu",
  initials: "B",
  grade: "高二",
  className: "高二英文 A班",
  nextClass: { dateLabel: "9 月 3 日（三）", timeLabel: "18:30" },
  tasks: [
    {
      id: "t1", kind: "paper", title: "翻譯題本 P.20–25",
      detail: "第 1–3 大題",
      studentReported: true, autoCompleted: false,
      // 老師已經檢查過，結論是部分完成
      teacherCheck: { status: "partial", percent: 60 },
    },
    {
      id: "t2", kind: "paper", title: "克漏字 Unit 6",
      detail: "整份寫完",
      studentReported: true, autoCompleted: false, teacherCheck: null,
    },
    {
      id: "t3", kind: "paper", title: "單字表 Unit 5",
      studentReported: false, autoCompleted: false,
      teacherCheck: { status: "not_done" },
    },
    {
      id: "t4", kind: "external", title: "竹北高中第二次段考考題",
      detail: "老師指定：只要寫「閱讀測驗」那一大題",
      sourceName: "Google Classroom",
      externalUrl: "https://classroom.google.com/",
      studentReported: false, autoCompleted: false, teacherCheck: null,
    },
    {
      id: "t5", kind: "digital", title: "Reading Quiz #13",
      studentReported: false, autoCompleted: false, teacherCheck: null,
    },
    {
      id: "t6", kind: "digital", title: "Listening Quiz #4",
      studentReported: false, autoCompleted: false, teacherCheck: null,
    },
  ],
  practice: [
    {
      id: "p1", title: "每日單字複習", meta: "今天已完成 · 20 個",
      mode: "online", scheduledToday: true, done: true, doneSource: "auto",
      startPath: "/practice/vocabulary/srs",
    },
    {
      id: "p2", title: "英文閱讀練習", meta: "今天沒有安排",
      mode: "online", scheduledToday: false, done: false, doneSource: null,
    },
    {
      id: "p3", title: "聽力練習", meta: "1 個活動 · 約 10 分鐘",
      mode: "online", scheduledToday: true, done: false, doneSource: null,
    },
    {
      id: "p4", title: "翻譯每日一句（紙本）", meta: "寫在筆記本上 · 約 5 分鐘",
      mode: "paper", scheduledToday: true, done: false, doneSource: null,
    },
  ],
  progress: [
    { skill: "reading", level: "building", trend: "up",
      nextAction: "細節題已經穩了，接下來練主旨與推論", sources: ["TEACHER", "AUTO"] },
    { skill: "vocabulary", level: "needs_work", trend: "flat",
      nextAction: "單字量會影響閱讀速度，這週先把待複習的清掉", sources: ["AUTO", "TEACHER"] },
    { skill: "grammar", level: "building", trend: "flat",
      nextAction: "句型結構沒問題，時態一致再練一輪", sources: ["TEACHER"] },
    { skill: "listening", level: "building", trend: "up",
      nextAction: "這個月有進步，維持每週兩次聽力練習", sources: ["AUTO"] },
    { skill: "writing", level: null, trend: "flat",
      nextAction: "還沒有這個月的寫作紀錄，交一篇之後就會出現", sources: [] },
    { skill: "speaking", level: null, trend: "flat",
      nextAction: "累積幾次口說練習後，這裡就會出現你的進度", sources: [] },
  ],
  rhythm: [
    { label: "單字複習", days: [true, true, false, false, true, false, false], target: 7, source: "auto" },
    { label: "閱讀練習", days: [true, false, false], target: 3, source: "auto" },
    { label: "聽力練習", days: [false, false], target: 2, source: "auto" },
    { label: "紙本練習", days: [true, false], target: 2, source: "self" },
  ],
  vocabulary: {
    collected: 806, familiar: 318, learning: 352, reviewDue: 34, unseen: 136,
    streakDays: 2,
    packs: [
      { id: "vp1", title: "課本字卡包 · Unit 5", kindLabel: "單字", collected: 180, familiar: 64 },
      { id: "vp3", title: "學測高頻字彙", kindLabel: "單字", collected: 520, familiar: 219 },
    ],
  },
  results: [
    { id: "r1", title: "Reading Quiz #12", source: "AUTO", scoreLabel: "72", dateLabel: "8/31" },
    { id: "r2", title: "Vocabulary Quiz（紙筆）", source: "TEACHER", scoreLabel: "14 / 20", dateLabel: "8/31" },
    { id: "r3", title: "Writing Task #4", source: "AI", scoreLabel: "13 / 20", dateLabel: "8/28" },
  ],
  feedback: [
    { id: "f1", dateLabel: "8/31", teacherName: "林老師",
      body: "上課專心度很好。單字量目前是影響閱讀速度的主因，先從每天的複習開始。" },
    { id: "f2", dateLabel: "8/24", teacherName: "林老師",
      body: "翻譯題本寫得比較急，字跡和句型都可以再放慢一點。" },
  ],
};

export const STUDENT_SCENARIOS: Record<StudentId, StudentScenario> = { amy, brian };

/** 既有字卡系統的入口，Dashboard 只做摘要與導流，不重建 library */
export const VOCAB_ROUTES = {
  review: "/practice/vocabulary/srs",
  library: "/practice/vocabulary/collections",
  hub: "/practice/vocabulary",
};
