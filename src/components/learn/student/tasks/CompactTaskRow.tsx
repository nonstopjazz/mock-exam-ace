import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { dueLabel, type StudentHomework } from "@/lib/learn/tasks";
import { OverdueChip, TaskStateChip } from "./taskChips";

/**
 * 焦點以外的作業。
 *
 * 🛑 這【不是】小卡片：它們共用一張卡的底、以分隔線切開。
 *    做成三張小卡就會冒出「這幾張誰比較重要」的新問題，而答案應該只有焦點卡一個。
 * 🛑 動作一律是描邊按鈕。實心的只有焦點那一顆。
 */
export const CompactTaskRow = ({
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
  const teacherChecked = hw.teacher_status !== null;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/60 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[15px] font-medium text-foreground truncate">{hw.title}</p>
          <OverdueChip hw={hw} today={today} />
          {hw.student_reported || teacherChecked ? <TaskStateChip hw={hw} /> : null}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {hw.class_name} · {dueLabel(hw, today)}
        </p>
      </div>

      {teacherChecked ? null : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          disabled={busy}
          onClick={() => onReport(hw.task_id, !hw.student_reported)}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {hw.student_reported ? "取消回報" : "回報完成"}
        </Button>
      )}
    </div>
  );
};
