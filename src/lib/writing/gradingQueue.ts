/**
 * 作文收件匣的資料形狀與狀態文字。
 *
 * 與頁面分開放，是因為 react-refresh 只在一個檔案僅 export 元件時才保得住狀態。
 *
 * ⚠️ 這裡的每一個狀態都是從【資料庫真的存著的欄位】推導出來的。
 *    不發明「看起來像有」但其實查不到的狀態——畫面上說「分析中」，
 *    資料庫裡就必須有一張未過期的租約。
 */

export interface WritingQueueRow {
  essay_id: string;
  student_id: string;
  /** learn_display_name()：display_name → email 前段 → 未命名學生 */
  student_name: string | null;
  title: string;
  essay_topic: string | null;
  essay_date: string | null;
  submitted_at: string | null;
  char_count: number | null;
  word_count: number | null;
  analysis_id: string | null;
  analysis_status: string | null;
  analysis_version: number | null;
  synthesis_status: string | null;
  report_ready: boolean | null;
  failed_pass: string | null;
  error_detail: string | null;
  /** 這一篇屬於哪一次批次 */
  queue_batch_id: string | null;
  /** 被 worker 重新認領過幾次（租約過期） */
  queue_attempts: number | null;
  /** 現在有沒有 worker 握著它的租約 */
  worker_running: boolean | null;
  /** 老師有沒有明確按過「完成檢閱」 */
  teacher_reviewed: boolean | null;
  teacher_reviewed_at: string | null;
  /** 有沒有寫過講評。與 teacher_reviewed 是兩件事——講評是選填的 */
  has_feedback: boolean | null;
  class_names: string[] | null;
}

/** 老師會用來篩選的六種分析狀態。每一種都對應得到資料庫裡的欄位組合。 */
export type AnalysisState =
  | "NONE"      // 已送出，還沒開始分析
  | "QUEUED"    // 排進佇列了，還沒輪到
  | "RUNNING"   // 正在分析（有 worker 握著租約，或已進入 ANALYZING/ANALYZED）
  | "DONE"      // AI 分析完成，學生看得到報告
  | "FAILED";   // 分析失敗，可重試

export const ANALYSIS_STATE_LABEL: Record<AnalysisState, string> = {
  NONE: "尚未分析",
  QUEUED: "已排入佇列",
  RUNNING: "分析中",
  DONE: "AI 已完成",
  FAILED: "分析失敗",
};

const TONES: Record<AnalysisState, string> = {
  NONE: "bg-muted text-muted-foreground border-border",
  QUEUED: "bg-primary/10 text-foreground border-primary/20",
  RUNNING: "bg-secondary/10 text-foreground border-secondary/20",
  DONE: "bg-success/10 text-success border-success/20",
  FAILED: "bg-destructive/10 text-destructive border-destructive/20",
};

export function analysisState(row: WritingQueueRow): AnalysisState {
  if (!row.analysis_status) return "NONE";
  if (row.analysis_status === "COMPLETED") return "DONE";
  if (row.analysis_status === "FAILED") return "FAILED";
  // QUEUED 但已經有 worker 握著租約 = 真的在跑了，只是 status 還沒翻。
  if (row.analysis_status === "QUEUED" && !row.worker_running) return "QUEUED";
  return "RUNNING";
}

export function analysisBadge(row: WritingQueueRow): { label: string; tone: string } {
  const state = analysisState(row);
  return { label: ANALYSIS_STATE_LABEL[state], tone: TONES[state] };
}

/** 可以被批次排入分析的：沒分析過的、失敗的。已完成與正在跑的不重複排入。 */
export function isEnqueueable(row: WritingQueueRow): boolean {
  const state = analysisState(row);
  return state === "NONE" || state === "FAILED";
}

/** 佇列概況。writing_queue_summary() 的回傳形狀。 */
export interface QueueSummary {
  pending_total: number;
  awaiting_analysis: number;
  queued: number;
  analyzing: number;
  failed: number;
  awaiting_review: number;
  oldest_pending_at: string | null;
  unclassed: number;
  by_class: { class_id: string; name: string; count: number }[];
  worker_busy: boolean;
  work_waiting: boolean;
}

/** 批次排入的結果。writing_enqueue_analysis_batch() 的回傳形狀。 */
export interface EnqueueResult {
  batch_id: string;
  requested: number;
  enqueued: number;
  items: { essay_id: string; analysis_id: string | null; result: string }[];
  kicked?: boolean;
  kickReason?: string;
}

/** 把批次結果講成一句老師看得懂的話——包含被跳過的那幾篇為什麼被跳過。 */
export function describeEnqueue(result: EnqueueResult): string {
  const skipped = result.items.filter((i) => i.result !== "ENQUEUED");
  if (skipped.length === 0) return `已排入 ${result.enqueued} 篇，開始依序分析`;

  const reasons: Record<string, string> = {
    ALREADY_ACTIVE: "已經在佇列裡",
    SKIPPED_COMPLETED: "已經分析完成",
    NOT_SUBMITTED: "不是已送出的作文",
    NO_TEXT: "沒有可分析的文字",
  };
  const counts = new Map<string, number>();
  for (const item of skipped) {
    const key = reasons[item.result] ?? item.result;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const detail = [...counts].map(([why, n]) => `${n} 篇${why}`).join("、");
  return result.enqueued > 0
    ? `已排入 ${result.enqueued} 篇，跳過 ${detail}`
    : `沒有新排入的作文（${detail}）`;
}
