import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Minus, Plus } from "lucide-react";
import {
  formatDate,
  recurringProgress,
  recurringTargetLabel,
  type StudentRecurring,
} from "@/lib/learn/tasks";
import { ClassChip } from "./taskChips";
import { ProgressRing } from "./ProgressRing";

/**
 * 任務頁的一項常態練習 —— 與作業同一種卡，但用深青（站上代表「學習」的顏色），
 * 讓「日復一日累積的」與「有截止日的」在同一頁上分得開。
 *
 * 🛑 顯示的是【當期】進度：每天的看今天，每週的看本週。
 *    沒做的日子不會累積成待辦追著學生跑。
 */
export const RecurringCard = ({
  item,
  busy,
  onLog,
}: {
  item: StudentRecurring;
  busy?: boolean;
  onLog: (taskId: string, delta: 1 | -1) => void;
}) => {
  const [open, setOpen] = useState(false);
  const p = recurringProgress(item);
  const hasDetail = Boolean(item.instruction);

  /*
   * 手機上按鈕另起一列：環 + 兩顆按鈕擠在同一行，標題只剩幾個字可以顯示。
   * 同一份 markup 放兩個位置，靠斷點決定哪一份出現。
   */
  const actions = (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground"
        aria-label={`${item.title} 減一次`}
        disabled={busy || p.done === 0}
        onClick={() => onLog(item.task_id, -1)}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-9 flex-1 sm:flex-none border-secondary/45 text-secondary hover:bg-secondary/10 hover:text-secondary"
        disabled={busy}
        onClick={() => onLog(item.task_id, 1)}
      >
        <Plus className="h-4 w-4" />
        {p.met ? "再記一次" : "完成一次"}
      </Button>
    </>
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card className="overflow-hidden border-secondary/25">
        <div className="flex items-start gap-3 p-4 md:p-5">
          <div className="pt-0.5">
            <ProgressRing
              percent={p.percent}
              met={p.met}
              label={`${p.done}/${p.target}`}
              size={42}
            />
          </div>

          <CollapsibleTrigger asChild disabled={!hasDetail}>
            <button
              type="button"
              className={`min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                hasDetail ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <p className="text-[15px] font-semibold text-foreground truncate">{item.title}</p>
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
                <ClassChip name={item.class_name} />
                <span className="text-xs text-muted-foreground">
                  {p.met
                    ? `${p.periodLabel}已達成 ${p.done} / ${p.target}`
                    : `${p.periodLabel} ${p.done} / ${p.target} · ${recurringTargetLabel(item)}`}
                </span>
              </div>
            </button>
          </CollapsibleTrigger>

          <div className="hidden sm:flex items-center gap-1 shrink-0">{actions}</div>
        </div>

        <div className="flex sm:hidden items-center gap-2 px-4 pb-4 -mt-1">{actions}</div>

        <CollapsibleContent>
          <div className="border-t border-border/60 bg-muted/20 px-4 md:px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              老師的說明
            </p>
            <p className="text-sm text-foreground/90 leading-relaxed mt-1 whitespace-pre-wrap">
              {item.instruction}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              本期從 {formatDate(item.period_start)} 開始計算
            </p>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
