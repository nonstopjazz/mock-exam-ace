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

/**
 * 批改狀態，學生端的說法。
 *
 * 只有兩個值。資料庫裡的 FAILED 在這裡是 null——批改失敗是老師要重試的事，
 * 對學生顯示成「還沒批改」，不是一句他看不懂也做不了什麼的技術訊息。
 */
export type GradingState = "GRADING" | "GRADED";

/** 四項分數。順序與 LEARNING_DOMAIN_MODEL.md §9.12 的 S1–S4 一致。 */
export interface SpeakingBands {
  fluency_score: number | null;
  lexical_score: number | null;
  grammar_score: number | null;
  pronunciation_score: number | null;
  overall_band: number | null;
}

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

/**
 * 學生看到的一次練習（speaking_my_practices 的元素）。
 *
 * 🛑 這個形狀就是學生拿得到的全部。error_detail（批改的）、telemetry、
 *    租約欄位都不在這裡，也不在那支 RPC 的回傳裡。
 */
export interface SpeakingPractice extends SpeakingBands {
  id: string;
  prompt_id: string | null;
  prompt_part: number;
  prompt_text: string;
  storage_path: string | null;
  mime_type: string | null;
  file_bytes: number | null;
  duration_seconds: number | null;
  uploaded_at: string | null;
  file_deleted_at: string | null;
  /** 上傳狀態（PENDING/UPLOADED/FAILED/GRADED），與批改狀態不同。 */
  status: SpeakingStatus;
  /** 上傳失敗的原因。這是錄音本身的，不是批改的。 */
  error_detail: string | null;
  created_at: string;

  grading_state: GradingState | null;
  transcript: string | null;
  feedback: string | null;
  suggestions: string | null;
  graded_at: string | null;
}

/** 老師收件匣的一列（speaking_admin_grading_queue 的元素）。 */
export interface SpeakingGradingRow {
  recording_id: string;
  student_id: string;
  student_name: string;
  prompt_part: number;
  prompt_text: string;
  duration_seconds: number | null;
  uploaded_at: string | null;
  analysis_id: string | null;
  analysis_status: "QUEUED" | "ANALYZING" | "COMPLETED" | "FAILED" | null;
  overall_band: number | null;
  /** 🛑 只給老師看。不會出現在任何學生端的回傳裡。 */
  error_detail: string | null;
  queue_attempts: number | null;
  completed_at: string | null;
}

/** 佇列現況（speaking_grading_summary）。 */
export interface SpeakingGradingSummary {
  in_queue: number;
  failed: number;
  ungraded: number;
  worker_busy: boolean;
  /** 有工作在等但沒人在跑 = 鏈斷了，畫面要出現「繼續處理佇列」。 */
  work_waiting: boolean;
  daily_cap: number;
  daily_used: number;
}

/**
 * 雙語回饋拆成英文與中文兩段。
 *
 * 格式由 prompt 約定：`[English] … [中文] …`。拆不開就整段當成一則——
 * 模型偶爾不照格式，那時顯示原文永遠比顯示空白好。
 */
export function splitBilingual(text: string | null): { en: string; zh: string } {
  if (!text) return { en: "", zh: "" };
  const match = text.match(/\[English\]\s*([\s\S]*?)\s*\[中文\]\s*([\s\S]*)/);
  // 拆不開就整段當英文，但順手把落單的 [English] 標籤拿掉——
  // 模型有時給了標籤卻沒給中文，把標籤原樣印在畫面上只是雜訊。
  if (!match) return { en: text.replace(/^\s*\[English\]\s*/i, "").trim(), zh: "" };
  return { en: match[1].trim(), zh: match[2].trim() };
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

/** 一個點的三種狀態：都沒練 / 練了一些 / 全部練完。 */
export type DotState = "todo" | "partial" | "done";

export function topicDotState(done: number, total: number): DotState {
  if (done === 0) return "todo";
  if (done >= total) return "done";
  return "partial";
}
