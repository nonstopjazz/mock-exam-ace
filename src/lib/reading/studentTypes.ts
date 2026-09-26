import type { Construct } from "./constructs";

/**
 * 學生端四支 RPC 的回傳形狀。
 *
 * 🛑 這裡【只】描述伺服器實際會回什麼，不多也不少。
 *    特別是 ReadingQuestion 沒有 correct_answer 也沒有 explanation——
 *    reading_get_passage 不回傳它們，型別如果寫了，
 *    畫面就會出現一個永遠是 undefined 的欄位，而下一個人會以為那是 bug 而去「修好」它。
 */

export type OptionLabel = "A" | "B" | "C" | "D";

export interface ReadingPassage {
  passage_id: string;
  title: string;
  passage_text: string;
  cefr_level: string | null;
  content_family: string | null;
  subdomain: string | null;
  word_count: number | null;
}

export interface ReadingQuestion {
  question_id: string;
  construct: Construct;
  question: string;
  options: Record<OptionLabel, string>;
}

export interface ReadingParagraph { paragraph_no: number; description: string }

export interface ReadingVocab {
  tier: "CANDIDATE" | "ACADEMIC" | "KNOWLEDGE";
  term: string;
  definition: string | null;
  paragraph_no: number | null;
}

/** reading_get_passage */
export interface ReadingPassagePayload {
  passage: ReadingPassage;
  questions: ReadingQuestion[];
  paragraphs: ReadingParagraph[];
  vocab: ReadingVocab[];
}

/** reading_start_session */
export interface ReadingSessionStart {
  session_id: string;
  passage_id: string;
  resumed: boolean;
  /** 續做時已經答過的題目。🛑 只有 id，沒有正誤——那要等作答那一次往返才給 */
  answered_question_ids: string[];
}

/** reading_submit_answer —— 🛑 作答【之後】才拿得到正解與解說 */
export interface ReadingSubmitResult {
  already_answered: boolean;
  selected_answer: OptionLabel;
  is_correct: boolean;
  correct_answer: OptionLabel;
  explanation: string;
}

export type ConstructOutcome = "CORRECT" | "WRONG" | "SKIPPED";

export interface ConstructResult {
  construct: Construct;
  question_id: string;
  /** 🛑 SKIPPED 不是 WRONG。沒寫跟寫錯對學生的意義完全不同 */
  status: ConstructOutcome;
  selected_answer: OptionLabel | null;
  correct_answer: OptionLabel | null;
  explanation: string | null;
  response_time_ms: number | null;
  answer_change_count: number | null;
}

/** reading_finish_session */
export interface ReadingSummary {
  session_id: string;
  passage_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  total_seconds: number | null;
  answered: number;
  correct: number;
  by_construct: ConstructResult[];
}

/** 文章列表。直接查 reading_passages，RLS 只放行 PUBLISHED。 */
export interface ReadingPassageListItem {
  passage_id: string;
  title: string;
  cefr_level: string | null;
  content_family: string | null;
  subdomain: string | null;
}
