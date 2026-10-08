/**
 * 寫作系統型別（Phase 1）
 *
 * Phase 1 只有文字作文。image / OCR / OCR_CORRECTED 這些值已經寫在型別裡，
 * 但資料庫的 CHECK 目前不允許它們 —— 型別先到位，是為了讓 Phase 2 放寬約束時
 * 前端不需要再改一次型別定義。
 */

import type { OverallLevel } from "@/lib/writing/analysisContract";

export type EssaySubmissionType = "text" | "image";

/** DRAFT = 撰寫中；SUBMITTED = 已送出且不可變。批改與發布狀態屬於 Phase 4。 */
export type EssayStatus = "DRAFT" | "SUBMITTED";

/** TYPED = 學生打字；OCR = 辨識產生（Phase 2）；OCR_CORRECTED = 人工修正（Phase 4）。 */
export type EssayTextProvenance = "TYPED" | "OCR" | "OCR_CORRECTED";

export interface EssaySubmission {
  id: string;
  student_id: string;
  submission_type: EssaySubmissionType;
  title: string;
  essay_topic: string | null;
  essay_date: string;
  student_notes: string | null;
  status: EssayStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EssayText {
  id: string;
  essay_id: string;
  content: string;
  provenance: EssayTextProvenance;
  /** 字元數。要顯示「字數」請用 word_count —— 兩者差六倍。 */
  char_count: number;
  /** 以空白切分的單字數，也就是學生與老師講的「字數」 */
  word_count: number;
  created_by: string | null;
  created_at: string;
}

export interface SubmitTextEssayInput {
  title: string;
  content: string;
  essayTopic?: string;
  essayDate?: string;
  studentNotes?: string;
}

/** 批改（AI 分析）的生命週期。NULL = 還沒有人按過「開始分析」。 */
export type EssayAnalysisStatus =
  | "QUEUED"
  | "ANALYZING"
  | "ANALYZED"
  | "COMPLETED"
  | "FAILED";

/**
 * 卡片列表的一筆 —— writing_student_essay_cards() 的回傳形狀。
 *
 * 欄位一律用 snake_case，因為這是 RPC 原封不動的輸出；前端不再改名，
 * 免得「同一個東西在兩個地方叫不同名字」。
 */
/**
 * 20 分制總分。由伺服器從 Axis 1（W1–W5）推導，前端只負責顯示。
 *
 * 🛑 measured / total 一定要一起用。UNMEASURED 的類別被排除在分母外，
 *    所以 17 / 20 有可能只評了五項中的四項——不講分母就是在說謊。
 */
export interface EssayScore {
  /** 0–20。實際下限是 7：四個狀態裡沒有任何一個代表「完全不行」 */
  score: number;
  /** 有量到、真的參與計分的類別數 */
  measured: number;
  /** 分析涵蓋的類別總數（目前是 5） */
  total: number;
  categories: { code: string; points: number }[];
}

export interface EssayCard {
  essay_id: string;
  title: string;
  essay_topic: string | null;
  essay_date: string;
  submission_type: EssaySubmissionType;
  status: EssayStatus;
  submitted_at: string | null;
  created_at: string;
  char_count: number | null;
  word_count: number | null;
  analysis_status: EssayAnalysisStatus | null;
  report_ready: boolean;
  /** 只有 report_ready 才有值 */
  overall_level: OverallLevel | null;
  overall_headline: string | null;
  /** 只有 report_ready 才有值；全部類別都沒量到時也是 null */
  score: EssayScore | null;
  has_teacher_feedback: boolean;
}
