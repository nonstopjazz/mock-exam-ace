/**
 * 寫作系統型別（Phase 1）
 *
 * Phase 1 只有文字作文。image / OCR / OCR_CORRECTED 這些值已經寫在型別裡，
 * 但資料庫的 CHECK 目前不允許它們 —— 型別先到位，是為了讓 Phase 2 放寬約束時
 * 前端不需要再改一次型別定義。
 */

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
  char_count: number;
  created_by: string | null;
  created_at: string;
}

/** 列表用：只需要字數與是否已有正規文字，不需要整篇內容 */
export interface EssayListItem extends EssaySubmission {
  charCount: number | null;
}

export interface SubmitTextEssayInput {
  title: string;
  content: string;
  essayTopic?: string;
  essayDate?: string;
  studentNotes?: string;
}
