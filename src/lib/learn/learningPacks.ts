/**
 * 主題學習包的型別與組裝規則。
 *
 * 資料全部來自 SECURITY DEFINER RPC（兩張表的 RLS 不給 authenticated 任何權限），
 * 所以這裡只放型別與「哪些組合可選」的規則，不放任何查詢。
 */

export type PackStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ActivityType = "reading" | "vocab";
export type TaskKind = "reading" | "exposure" | "srs" | "quiz";

/** 與 lexical_attempts.exercise_type 同一組字串（不含 cluster_recall）。 */
export type VocabMode =
  | "srs" | "quick_quiz" | "flashcard" | "spelling"
  | "fill_blank" | "match" | "synonym_antonym";

export const VOCAB_MODE_LABEL: Record<VocabMode, string> = {
  srs: "SRS 智慧複習",
  quick_quiz: "快速測驗",
  flashcard: "翻轉卡片",
  spelling: "拼字練習",
  fill_blank: "填空練習",
  match: "配對遊戲",
  synonym_antonym: "同反義字練習",
};

/**
 * 🛑 單字集來源【不能】選同反義字。
 *
 *    pack_items 這張表沒有 synonyms / antonyms 欄位（結構性缺失，
 *    見 src/lib/lexical/mapper.ts 的註解），所以候選清單恆為空、出不了題。
 *
 *    資料表有 CHECK、RPC 也會擋，這裡是第三道 —— 讓它在畫面上就選不到，
 *    而且說得出原因。只擋不說的話，老師會以為是壞掉。
 */
export const VOCAB_MODE_UNAVAILABLE: Partial<Record<VocabMode, string>> = {
  synonym_antonym: "單字集沒有同義／反義字資料，這個模式出不了題",
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  reading: "閱讀題組",
  exposure: "接觸型（看過字卡）",
  srs: "複習型（SRS）",
  quiz: "檢核型（測驗）",
};

/**
 * 每種任務型態的完成條件說明。畫面上要直接寫出來。
 *
 * 🛑 這些文字必須與 create_learning_packs_1_tables.sql 檔頭的定義一致。
 *    兩邊講的若不同，老師會照畫面設定、而系統照 SQL 判定。
 */
export const TASK_KIND_RULE: Record<TaskKind, string> = {
  reading: "完成這篇文章的題目",
  exposure: "對指定數量的【不同單字】各翻過至少一次卡片",
  srs: "指定的字各完成一次 SRS 複習（不是「清掉今天到期的」—— 到期數會邊做邊變少）",
  quiz: "達到指定題數，而且以【首次作答】計；看完答案再答對不補回首次的錯",
};

/** 哪些模式配得上哪種任務。混用會讓完成條件沒有意義，資料表也有 CHECK。 */
export const MODES_FOR_TASK: Record<Exclude<TaskKind, "reading">, VocabMode[]> = {
  exposure: ["flashcard"],
  srs: ["srs"],
  quiz: ["quick_quiz", "spelling", "fill_blank", "match"],
};

export interface MatrixProblem {
  code: "NO_UNITS" | "READING_NO_QUESTIONS" | "VOCAB_EMPTY" | "TARGET_EXCEEDS_SOURCE";
  message: string;
  unit_id?: string;
  unit_title?: string;
  available?: number;
  target?: number;
}

export interface PackUnit {
  id: string;
  sort_order: number;
  title: string;
  activity_type: ActivityType;
  reading_passage_id: string | null;
  vocab_pack_id: string | null;
  vocab_mode: VocabMode | null;
  task_kind: TaskKind;
  target_count: number | null;
  /** 來源的標題。由後端解析，前端不另外查 */
  source_title: string | null;
  /** 來源實際有多少可用內容（題數／字數）。後端算，避免與發布檢查不一致 */
  source_available: number;
}

export interface LearningPack {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cover_path: string | null;
  grade: string | null;
  textbook_version: string | null;
  textbook_volume: string | null;
  textbook_lessons: string | null;
  scope_note: string | null;
  goals: string[];
  estimated_minutes: number | null;
  status: PackStatus;
  open_at: string | null;
  close_at: string | null;
  created_at: string;
  updated_at: string;
  units: PackUnit[];
  problems: MatrixProblem[];
}

export interface PackListRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  grade: string | null;
  textbook_version: string | null;
  status: PackStatus;
  open_at: string | null;
  close_at: string | null;
  created_at: string;
  unit_count: number;
  problems: MatrixProblem[];
}

export interface SourcePassage {
  passage_id: string;
  title: string;
  cefr_level: string | null;
  question_count: number;
}
export interface SourceVocabPack {
  id: string;
  title: string;
  item_count: number;
}
export interface PackSources {
  passages: SourcePassage[];
  vocab_packs: SourceVocabPack[];
}

export const STATUS_LABEL: Record<PackStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已發布",
  ARCHIVED: "已下架",
};

/**
 * 🛑 沒有對應教材版本時，學生端必須明說這是「共通能力練習」。
 *
 *    「高一上第一次段考」各校範圍不同。不講的話，學生會以為這個包
 *    涵蓋了他學校的範圍 —— 那是會害人的誤會，不是小事。
 */
export function isGenericPractice(pack: Pick<LearningPack, "textbook_version">): boolean {
  return !pack.textbook_version?.trim();
}
