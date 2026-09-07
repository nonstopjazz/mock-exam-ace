/**
 * Teacher Session Workspace — mock data (prototype v1)
 *
 * 🛑 全部為 UI prototype 的假資料。沒有 backend、沒有 DB schema、
 *    沒有 mastery algorithm、沒有 evidence model。
 *
 * 形狀刻意接近未來 API response：兩個 scenario 共用同一套資訊架構，
 * 差別只在 students.length，UI 依此自動改變 presentation。
 */

/* ---------- 基本型別 ---------- */

export type ScenarioId = "tutor" | "group";

export interface Student {
  id: string;
  name: string;
  initials: string;
}

/** 六大能力，順序固定 */
export type SkillKey =
  | "reading" | "vocabulary" | "grammar" | "listening" | "speaking" | "writing";

export const SKILL_ORDER: SkillKey[] = [
  "reading", "vocabulary", "grammar", "listening", "speaking", "writing",
];

export const SKILL_LABEL: Record<SkillKey, string> = {
  reading: "閱讀",
  vocabulary: "字彙",
  grammar: "文法",
  listening: "聽力",
  speaking: "口說",
  writing: "寫作",
};

/**
 * 🛑 not_observed 不是第五個能力等級，而是「今天沒有足夠觀察」。
 *    UNMEASURED ≠ WEAK。
 */
export type SkillRating =
  | "strong" | "solid" | "developing" | "needs_support" | "not_observed";

export const RATING_ORDER: SkillRating[] = [
  "strong", "solid", "developing", "needs_support", "not_observed",
];

export const RATING_LABEL: Record<SkillRating, string> = {
  strong: "優異",
  solid: "穩定",
  developing: "發展中",
  needs_support: "需加強",
  not_observed: "未觀察",
};

/** 只有 partial 會用到 percent */
export type HomeworkStatus = "done" | "partial" | "not_done";

export const HOMEWORK_LABEL: Record<HomeworkStatus, string> = {
  done: "完成",
  partial: "部分完成",
  not_done: "未完成",
};

export interface HomeworkEntry {
  status: HomeworkStatus;
  /** 僅 status === "partial" 時有意義 */
  percent?: number;
}

export interface Observation {
  /** 老師的整體主觀描述，與 assessment note 分開 */
  note: string;
  skills: Partial<Record<SkillKey, SkillRating>>;
}

/* ---------- Assessments ---------- */

export type AssessmentSource = "TEACHER" | "AUTO" | "AI" | "IMPORTED";

export type ScoreState =
  | "scored" | "absent" | "not_taken" | "excused" | "not_completed";

export const SCORE_STATE_LABEL: Record<ScoreState, string> = {
  scored: "已計分",
  absent: "缺席",
  not_taken: "未應試",
  excused: "免考",
  not_completed: "未完成",
};

export interface ScoreEntry {
  state: ScoreState;
  /** state === "scored" 時才有值 */
  value?: number;
  /** 老師針對這一筆成績的判讀，與 Today's Performance 的 overall note 分開 */
  note?: string;
}

export interface Assessment {
  id: string;
  title: string;
  source: AssessmentSource;
  totalScore: number;
  /** AUTO / AI 由系統產生，老師不需要重新輸入或 confirm */
  systemGenerated: boolean;
  scores: Record<string, ScoreEntry>;
}

/* ---------- Next-session homework ---------- */

export type DueMode = "next_class" | "custom" | "none";

export interface HomeworkException {
  studentId: string;
  text: string;
}

export interface NextHomework {
  /** 小團班：class default；一對一：就是這位學生的作業 */
  classDefault: string;
  dueMode: DueMode;
  customDue: string;
  teacherNote: string;
  attachmentName: string;
  exceptions: HomeworkException[];
}

/* ---------- Recurring practice ---------- */

export interface RoutineException {
  studentId: string;
  text: string;
}

export interface Routine {
  id: string;
  title: string;
  /** e.g. "每天" / "一 / 三 / 五" */
  cadence: string;
  minutes: number;
  active: boolean;
  exceptions: RoutineException[];
}

/* ---------- Digital assignment ---------- */

export interface DigitalException {
  studentId: string;
  /** override = 換一份；excluded = 這位學生不指派 */
  mode: "override" | "excluded";
  title?: string;
}

export interface DigitalAssignment {
  id: string;
  title: string;
  /** platform = 從平台既有活動挑選；simple = 老師自建的簡單任務 */
  origin: "platform" | "simple";
  kindLabel: string;
  dueMode: DueMode;
  customDue: string;
  exceptions: DigitalException[];
}

/** 平台既有活動；Teacher Workspace 不依賴這份清單才能運作 */
export interface PlatformActivity {
  id: string;
  title: string;
  kindLabel: string;
}

export const PLATFORM_ACTIVITIES: PlatformActivity[] = [
  { id: "pa1", title: "Reading Quiz #13", kindLabel: "閱讀測驗" },
  { id: "pa2", title: "Reading Quiz #13B（簡化版）", kindLabel: "閱讀測驗" },
  { id: "pa3", title: "Vocabulary Review · Unit 5", kindLabel: "單字複習" },
  { id: "pa4", title: "Writing submission · Opinion Essay", kindLabel: "寫作繳交" },
  { id: "pa5", title: "Speaking recording · Unit 5 Dialogue", kindLabel: "口說錄音" },
  { id: "pa6", title: "Listening activity · News Clip 08", kindLabel: "聽力活動" },
];

/* ---------- Scenario ---------- */

export interface SessionScenario {
  id: ScenarioId;
  /** 切換器上的標籤 */
  switchLabel: string;
  className: string;
  dateLabel: string;
  timeLabel: string;
  nextClassLabel: string;
  students: Student[];
  previousHomeworkTitle: string;
  /** 課中就已經記錄好了 → wrap-up 時直接顯示，不要求再次 confirm */
  previousHomework: Record<string, HomeworkEntry>;
  observations: Record<string, Observation>;
  assessments: Assessment[];
  nextHomework: NextHomework;
  recurring: Routine[];
  digital: DigitalAssignment[];
}

const emptyNextHomework = (): NextHomework => ({
  classDefault: "",
  dueMode: "next_class",
  customDue: "",
  teacherNote: "",
  attachmentName: "",
  exceptions: [],
});

const blankObservation = (): Observation => ({ note: "", skills: {} });

/* ---------- Scenario A：一對一家教 ---------- */

const AMY: Student = { id: "s1", name: "Amy Chen", initials: "A" };

const tutorScenario: SessionScenario = {
  id: "tutor",
  switchLabel: "一對一家教",
  className: "Amy Chen · 一對一",
  dateLabel: "8 月 31 日",
  timeLabel: "18:30–20:30",
  nextClassLabel: "9 月 3 日 · 18:30",
  students: [AMY],
  previousHomeworkTitle: "講義 P.20–25 + 單字表 Unit 4",
  previousHomework: {
    s1: { status: "done" },
  },
  observations: {
    s1: {
      note: "今天閱讀理解不錯，但字彙量仍不足。長句拆解已經比上週穩定。",
      skills: { reading: "solid", vocabulary: "developing" },
    },
  },
  assessments: [
    {
      id: "a1",
      title: "Reading Quiz #12",
      source: "AUTO",
      totalScore: 100,
      systemGenerated: true,
      scores: { s1: { state: "scored", value: 90 } },
    },
    {
      id: "a2",
      title: "Vocabulary Quiz（紙筆）",
      source: "TEACHER",
      totalScore: 20,
      systemGenerated: false,
      scores: { s1: { state: "scored", value: 18 } },
    },
  ],
  nextHomework: emptyNextHomework(),
  recurring: [
    {
      id: "r1", title: "Vocabulary Review", cadence: "每天",
      minutes: 15, active: true, exceptions: [],
    },
    {
      id: "r2", title: "English Reading", cadence: "一 / 三 / 五",
      minutes: 15, active: true, exceptions: [],
    },
  ],
  digital: [],
};

/* ---------- Scenario B：小團班 ---------- */

const GROUP_STUDENTS: Student[] = [
  { id: "s1", name: "Amy", initials: "A" },
  { id: "s2", name: "Brian", initials: "B" },
  { id: "s3", name: "Chris", initials: "C" },
  { id: "s4", name: "David", initials: "D" },
  { id: "s5", name: "Eva", initials: "E" },
  { id: "s6", name: "Frank", initials: "F" },
];

const groupScenario: SessionScenario = {
  id: "group",
  switchLabel: "小團班（6 人）",
  className: "高二英文 A班",
  dateLabel: "8 月 31 日",
  timeLabel: "18:30–20:30",
  nextClassLabel: "9 月 3 日 · 18:30",
  students: GROUP_STUDENTS,
  previousHomeworkTitle: "講義 P.20–25 + 單字表 Unit 4",
  previousHomework: {
    s1: { status: "done" },
    s2: { status: "done" },
    s3: { status: "partial", percent: 60 },
    s4: { status: "done" },
    s5: { status: "done" },
    s6: { status: "not_done" },
  },
  observations: {
    s1: { note: "長句理解進步", skills: { reading: "strong" } },
    s2: { note: "單字量影響閱讀速度", skills: { vocabulary: "needs_support" } },
    s3: blankObservation(),
    s4: { note: "", skills: { grammar: "solid" } },
    s5: blankObservation(),
    s6: { note: "", skills: { writing: "solid" } },
  },
  assessments: [
    {
      id: "a1",
      title: "Reading Quiz #12",
      source: "AUTO",
      totalScore: 100,
      systemGenerated: true,
      scores: {
        s1: { state: "scored", value: 90 },
        s2: { state: "scored", value: 72 },
        s3: { state: "scored", value: 80 },
        s4: { state: "not_completed" },
        s5: { state: "scored", value: 88 },
        s6: { state: "scored", value: 65 },
      },
    },
    {
      id: "a2",
      title: "Writing Task #4",
      source: "AI",
      totalScore: 100,
      systemGenerated: true,
      scores: {
        s1: { state: "scored", value: 78 },
        s2: { state: "scored", value: 66 },
        s3: { state: "not_completed" },
        s4: { state: "scored", value: 71 },
        s5: { state: "scored", value: 83 },
        s6: { state: "not_completed" },
      },
    },
    {
      id: "a3",
      title: "Vocabulary Quiz（紙筆）",
      source: "TEACHER",
      totalScore: 20,
      systemGenerated: false,
      scores: {
        s1: { state: "scored", value: 18 },
        s2: { state: "scored", value: 14 },
        s3: { state: "scored", value: 17 },
        s4: { state: "scored", value: 19 },
        s5: { state: "scored", value: 16 },
        s6: { state: "scored", value: 12 },
      },
    },
  ],
  nextHomework: emptyNextHomework(),
  recurring: [
    {
      id: "r1", title: "Vocabulary Review", cadence: "每天", minutes: 15, active: true,
      exceptions: [
        { studentId: "s3", text: "每天 · 20 分鐘" },
        { studentId: "s6", text: "暫停一週" },
      ],
    },
    {
      id: "r2", title: "English Reading", cadence: "一 / 三 / 五",
      minutes: 15, active: true, exceptions: [],
    },
  ],
  digital: [],
};

export const SCENARIOS: Record<ScenarioId, SessionScenario> = {
  tutor: tutorScenario,
  group: groupScenario,
};
