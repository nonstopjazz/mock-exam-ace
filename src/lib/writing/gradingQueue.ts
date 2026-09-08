/**
 * 批改佇列的資料形狀與狀態文字。
 *
 * 與頁面分開放，是因為 react-refresh 只在一個檔案僅 export 元件時才保得住狀態。
 */

export interface WritingQueueRow {
  essay_id: string;
  student_id: string;
  title: string;
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
}

/** 老師關心的是「學生看得到了沒」，不是內部狀態機的名字。 */
export function queueStatus(row: WritingQueueRow): { label: string; tone: string } {
  if (!row.analysis_status) return { label: "尚未批改", tone: "bg-muted text-muted-foreground border-border" };
  if (row.analysis_status === "COMPLETED")
    return { label: "已完成 · 學生看得到", tone: "bg-success/10 text-success border-success/20" };
  if (row.analysis_status === "FAILED")
    return { label: "批改失敗", tone: "bg-accent/10 text-accent border-accent/20" };
  return { label: "批改中", tone: "bg-secondary/10 text-foreground border-secondary/20" };
}
