import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CalendarDays, Check, Loader2 } from "lucide-react";
import { dueLabel, homeworkState, isOverdue, type StudentHomework } from "@/lib/learn/tasks";
import { ClassChip, TaskStateChip } from "./taskChips";

/**
 * 焦點任務 —— 這一區唯一的主角。
 *
 * 🛑 整個「我的任務」區塊【只有這張卡上有一顆實心按鈕】。
 *    後台面板的每一列都有按鈕；產品只讓你做下一件事。多幾項作業也不放寬這條規則。
 *
 * 🛑 老師檢查過（teacher_status 非 NULL）之後就沒有自述按鈕了。
 *    學生不能在老師蓋章之後再改自己的說法，那會讓兩邊的紀錄互相矛盾。
 *    這條規則在任務頁與這裡必須一致。
 *
 * 卡片的重量來自留白（p-6 md:p-7）與頂端一層很淡的染色，不是粗邊框或彩色底塊。
 */

/** 還沒回報 = 琥珀（該做的事）；已回報 = 深青（等待中，語氣安靜下來）。 */
const wash = (reported: boolean) =>
  reported
    ? "before:from-secondary/[0.07] border-secondary/25"
    : "before:from-primary/[0.07] border-primary/25";

export const FocusTaskCard = ({
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
  const state = homeworkState(hw);
  const teacherChecked = hw.teacher_status !== null;
  const overdue = isOverdue(hw, today);

  return (
    <Card
      className={`relative overflow-hidden p-6 md:p-7 shadow-card
        before:absolute before:inset-x-0 before:top-0 before:h-28 before:bg-gradient-to-b before:to-transparent before:pointer-events-none
        ${wash(hw.student_reported)}`}
    >
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          待辦焦點
        </p>

        <h3 className="mt-2 text-2xl lg:text-[1.75rem] font-semibold leading-snug text-foreground">
          {hw.title}
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ClassChip name={hw.class_name} />
          {/* 「尚未完成」是預設值，卡片本身已經說了；徽章只在狀態有消息時才出現 */}
          {state.key === "none" ? null : <TaskStateChip hw={hw} />}
        </div>

        <div
          className={`mt-4 flex items-center gap-2 text-sm ${
            overdue ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className={overdue ? "font-medium" : "font-medium text-foreground"}>
              {dueLabel(hw, today)}
            </span>
            {hw.resolved_due_date && !overdue ? " 截止" : null}
          </span>
        </div>

        {hw.instruction && hw.instruction.trim() !== hw.title.trim() ? (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {hw.instruction}
          </p>
        ) : null}

        {/* 手機上動作全寬並落在最後一行；桌機上與說明文字同一列 */}
        <div className="mt-5 pt-4 border-t border-border/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            {teacherChecked
              ? "老師已經檢查過了，補完之後請直接告訴老師"
              : hw.student_reported
                ? "已回報，等待老師確認"
                : "回報後老師會再確認，確認前都還能取消"}
          </p>

          {teacherChecked ? null : hw.student_reported ? (
            <Button
              variant="outline"
              className="h-10 w-full sm:w-auto"
              disabled={busy}
              onClick={() => onReport(hw.task_id, false)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              取消回報
            </Button>
          ) : (
            <Button
              className="h-[42px] w-full sm:w-auto px-5 text-[15px] transition-shadow hover:shadow-button active:translate-y-px"
              disabled={busy}
              onClick={() => onReport(hw.task_id, true)}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {busy ? "回報中…" : "回報完成"}
            </Button>
          )}
        </div>

        {/* 老師檢查過但判定沒完成／只完成一部分時，狀態徽章已經說了，這裡不再重複 */}
        <span className="sr-only">{state.label}</span>
      </div>
    </Card>
  );
};
