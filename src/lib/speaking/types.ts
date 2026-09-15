/**
 * 口說練習的型別
 *
 * 形狀對應資料庫回傳的 JSON。前端不自己組資料、也不自己算狀態——
 * 狀態機在 speaking_recordings.status，這裡只是把它讀出來顯示。
 */

/** 學生選題畫面看到的一題（speaking_available_prompts 的元素）。 */
export interface SpeakingPrompt {
  id: string;
  part: 1 | 2 | 3;
  topic: string | null;
  question: string | null;
  title: string | null;
  cue: string | null;
  bullets: string[];
}

/** 管理端的題庫列（speaking_admin_prompts 的元素）。多了維護用的欄位。 */
export interface AdminSpeakingPrompt extends SpeakingPrompt {
  is_active: boolean;
  sort_order: number;
  practice_count: number;
  created_at: string;
  updated_at: string;
}

export type SpeakingStatus = "PENDING" | "UPLOADED" | "FAILED" | "GRADED";

/** 一次練習。學生只讀得到自己的（RLS）。 */
export interface SpeakingRecording {
  id: string;
  prompt_id: string | null;
  prompt_part: number;
  /** 練習當下的題目快照。老師事後改題不影響這裡。 */
  prompt_text: string;
  storage_path: string | null;
  mime_type: string | null;
  file_bytes: number | null;
  duration_seconds: number | null;
  uploaded_at: string | null;
  /** 有值 = 錄音檔已過保存期被清掉，練習紀錄本身還在。 */
  file_deleted_at: string | null;
  status: SpeakingStatus;
  error_detail: string | null;
  created_at: string;
}

/** 某個功能的開放狀況（learn_admin_feature_access）。 */
export interface FeatureAccess {
  feature: string;
  classes: {
    class_id: string;
    name: string;
    member_count: number;
    granted: boolean;
  }[];
  students: {
    student_id: string;
    name: string;
    granted_at: string;
    note: string | null;
  }[];
  /** 去重後實際看得到的人數：同時被班級與個別授權的只算一次。 */
  reach: number;
}

/** 題目卡片的標題列。Part 2 用 title，Part 1/3 用 topic（沒有就退回問題本身）。 */
export function promptHeadline(prompt: SpeakingPrompt): string {
  if (prompt.part === 2) return prompt.title?.trim() || "Part 2";
  return prompt.topic?.trim() || prompt.question?.trim() || `Part ${prompt.part}`;
}

/** 題目卡片的內文。 */
export function promptBody(prompt: SpeakingPrompt): string {
  if (prompt.part === 2) return prompt.cue?.trim() || "";
  return prompt.question?.trim() || "";
}
