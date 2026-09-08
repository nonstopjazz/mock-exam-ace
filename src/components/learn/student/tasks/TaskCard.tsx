import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";
import {
  dueLabel,
  formatDate,
  homeworkState,
  isOverdue,
  needsAction,
  TEACHER_STATUS_LABEL,
  type StudentHomework,
} from "@/lib/learn/tasks";
import { ClassChip, TaskStateChip } from "./taskChips";

/**
 * 任務頁的一份作業 —— 一張可展開的卡。
 *
 * 與 Dashboard 的設計語彙一致（同一組徽章、同樣的留白節奏），只有兩點刻意不同：
 *   · 這裡沒有實心按鈕。實心的只有 Dashboard 的焦點那一顆；
 *     任務頁是一整頁的清單，每張卡都實心會變成一片琥珀色。
 *   · 每張卡收合時只顯示「一眼要看到的」；老師的指示、備註與時間戳記收在展開裡。
 *
 * 🛑 沒有額外內容的卡【不給】展開箭頭。展開之後空無一物比不能展開更糟。
 */

/** 摘要行只給日期；月日足夠，年份在這個情境沒有意義。 */
const shortDate = (iso: string | null) => (iso ? formatDate(iso) : null);

/**
 * 已經結案的作業只講日期，不講「已逾期 N 天」。
 * 老師確認完成之後還在旁邊寫逾期幾天，等於把一件做完的事說成沒做完。
 */
const dueSummary = (hw: StudentHomework, today: string) =>
  needsAction(hw)
    ? dueLabel(hw, today)
    : hw.resolved_due_date
      ? formatDate(hw.resolved_due_date)
      : dueLabel(hw, today);

export const TaskCard = ({
  hw,
  today,
  busy,
  onReport,
}: {
  hw: StudentHomework;
  today: string;
  busy?: boolean;
  onReport: (taskId: string, done: boolean) => void;
}) => {
  const [open, setOpen] = useState(false);
  const state = homeworkState(hw);
  const teacherChecked = hw.teacher_status !== null;
  const overdue = isOverdue(hw, today);

  const instruction =
    hw.instruction && hw.instruction.trim() !== hw.title.trim() ? hw.instruction : null;
  const hasDetail = Boolean(
    instruction || hw.teacher_note || hw.student_reported_at || hw.teacher_checked_at,
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 p-4 md:p-5">
          {/* 標題區整塊是展開的觸發點；沒有細節時退化成單純的文字，不會有假的可點感 */}
          <CollapsibleTrigger asChild disabled={!hasDetail}>
            <button
              type="button"
              className={`min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                hasDetail ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <p className="text-[15px] font-semibold text-foreground truncate">{hw.title}</p>
                {hasDetail ? (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      open ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                ) : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <ClassChip name={hw.class_name} />
                {state.key === "none" ? null : <TaskStateChip hw={hw} />}
              </div>

              <div
                className={`mt-2 flex items-center gap-1.5 text-xs ${
                  overdue ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {dueSummary(hw, today)}
              </div>
            </button>
          </CollapsibleTrigger>

          {teacherChecked ? null : (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={busy}
              onClick={() => onReport(hw.task_id, !hw.student_reported)}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {hw.student_reported ? "取消回報" : "回報完成"}
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="border-t border-border/60 bg-muted/20 px-4 md:px-5 py-4 space-y-3">
            {instruction ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  老師的說明
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed mt-1 whitespace-pre-wrap">
                  {instruction}
                </p>
              </div>
            ) : null}

            {hw.teacher_note ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  老師的備註
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed mt-1 whitespace-pre-wrap">
                  {hw.teacher_note}
                </p>
              </div>
            ) : null}

            {/* 兩個時間戳記分開講：自述與老師的判定是不同的事，紀錄上也不能混為一談 */}
            {hw.student_reported_at || hw.teacher_checked_at ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                {hw.student_reported_at ? (
                  <p>你在 {shortDate(hw.student_reported_at.slice(0, 10))} 回報完成</p>
                ) : null}
                {hw.teacher_checked_at && hw.teacher_status ? (
                  <p>
                    老師在 {shortDate(hw.teacher_checked_at.slice(0, 10))} 檢查：
                    {TEACHER_STATUS_LABEL[hw.teacher_status]}
                    {hw.teacher_status === "PARTIAL" && hw.teacher_percent !== null
                      ? ` ${hw.teacher_percent}%`
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
