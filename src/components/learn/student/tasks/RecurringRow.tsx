import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Minus, Plus } from "lucide-react";
import { TYPE } from "../shared";
import { recurringProgress, recurringTargetLabel, type StudentRecurring } from "@/lib/learn/tasks";

/**
 * 一項常態練習。
 *
 * 🛑 沒有「每日任務列」這種東西 —— 沒做的日子就是沒有紀錄，不會累積成一長串
 *    未完成的待辦追著學生跑。這裡顯示的是【當期】進度：每天的看今天，每週的看本週。
 */
export const RecurringRow = ({
  item,
  onLog,
  busy,
}: {
  item: StudentRecurring;
  onLog: (taskId: string, delta: 1 | -1) => void;
  busy?: boolean;
}) => {
  const p = recurringProgress(item);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/60 last:border-0">
      <div
        className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center ${
          p.met ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        }`}
        aria-hidden
      >
        {p.met ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold tabular-nums">{p.done}</span>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
          <Badge variant="outline" className="text-[11px] font-normal shrink-0">
            {recurringTargetLabel(item)}
          </Badge>
        </div>
        <p className={`${TYPE.micro} mt-0.5`}>
          {p.periodLabel} {p.done} / {p.target}
          {p.met ? " · 已達成" : null}
        </p>
        {/* 細長的進度條，不用 ProgressBar 的完整版面——這裡只是佐證 */}
        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              p.met ? "bg-success" : "bg-secondary"
            }`}
            style={{ width: `${p.percent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label={`${item.title} 減一次`}
          disabled={busy || p.done === 0}
          onClick={() => onLog(item.task_id, -1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          aria-label={`${item.title} 記錄一次`}
          disabled={busy}
          onClick={() => onLog(item.task_id, 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
