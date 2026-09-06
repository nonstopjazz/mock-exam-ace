import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { TASK_STATE } from "../studentTokens";
import { TYPE } from "../shared";
import {
  dueLabel, homeworkState, isOverdue, type StudentHomework,
} from "@/lib/learn/tasks";

/**
 * 一項作業。
 *
 * 🛑 「我已完成」是【自述】，不是老師確認。老師檢查過之後，自述的按鈕就消失了——
 *    學生不能在老師蓋章之後再改自己的說法，那會讓兩邊的紀錄互相矛盾。
 * 🛑 已完成的項目仍然留在清單裡，只是安靜下來：學生要看得到老師這週交代了什麼。
 */
export const HomeworkRow = ({
  hw,
  today,
  onReport,
  busy,
}: {
  hw: StudentHomework;
  today: string;
  onReport: (taskId: string, done: boolean) => void;
  busy?: boolean;
}) => {
  const state = homeworkState(hw);
  const S = TASK_STATE[state.key];
  const Icon = S.icon;
  const overdue = isOverdue(hw, today);
  const checked = hw.teacher_status !== null;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${S.className}`} aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            className={`text-sm font-medium truncate ${
              state.key === "verified" ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {hw.title}
          </p>
          <Badge variant="outline" className="text-[11px] font-normal shrink-0">
            {hw.class_name}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span className={`${TYPE.status} ${S.className}`}>{state.label}</span>
          <span
            className={
              overdue
                ? "text-xs font-medium text-destructive flex items-center gap-1"
                : TYPE.micro
            }
          >
            {overdue ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
            {dueLabel(hw, today)}
          </span>
        </div>

        {hw.instruction ? (
          <p className={`${TYPE.micro} mt-1 line-clamp-2`}>{hw.instruction}</p>
        ) : null}

        {hw.teacher_note ? (
          <p className="text-xs text-foreground/80 mt-1.5 rounded-md bg-muted/50 px-2 py-1">
            老師：{hw.teacher_note}
          </p>
        ) : null}
      </div>

      {/* 老師檢查過之後就不再提供自述按鈕 */}
      {!checked ? (
        <Button
          size="sm"
          variant={hw.student_reported ? "outline" : "default"}
          className="shrink-0"
          disabled={busy}
          onClick={() => onReport(hw.task_id, !hw.student_reported)}
        >
          {hw.student_reported ? "取消標記" : "我完成了"}
        </Button>
      ) : null}
    </div>
  );
};
