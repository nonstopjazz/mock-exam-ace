import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CalendarCheck, ChevronDown, History, Repeat } from "lucide-react";
import { useStudentTaskHistory } from "@/hooks/learn/useStudentTaskHistory";
import { formatTimestampDate } from "@/lib/learn/tasks";
import {
  groupHistory,
  historyState,
  type StudentTaskHistoryItem,
} from "@/lib/learn/taskHistory";
import { TASK_STATE } from "../studentTokens";
import { QuietPanel, TYPE } from "../shared";
import { ClassChip, HistoryStateChip } from "./taskChips";

/**
 * 已結束的作業 —— 學生端的回顧。
 *
 * 老師封存一份作業之後，它就離開待辦；在這之前，它對學生【完全消失】了，
 * 即使自己的回報與老師的評語都還好好地留在資料庫裡。這個面板就是那個入口。
 *
 * 🛑 整塊唯讀。已結束的作業沒有任何可以按的東西——再給一顆「回報完成」，
 *    只會寫進一個老師永遠不會看的欄位。
 * 🛑 預設收合，而且收合時【不】去拿資料。這是回顧，不是每次進站都要的東西；
 *    標題列的份數讓它仍然看得見。
 * 🛑 放在頁面最下面、用 QuietPanel（次要面板）。歷史不該跟「現在要做什麼」
 *    搶同一個視覺重量。
 */

const HistoryRow = ({ item }: { item: StudentTaskHistoryItem }) => {
  const [open, setOpen] = useState(false);
  const state = historyState(item);
  const StateIcon = TASK_STATE[state.key].icon;

  const instruction =
    item.instruction && item.instruction.trim() !== item.title.trim() ? item.instruction : null;
  const hasDetail = Boolean(instruction || item.teacher_note || item.student_reported_at);

  const isRecurring = item.type === "RECURRING";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="py-3 border-b border-border/50 last:border-b-0">
        <CollapsibleTrigger asChild disabled={!hasDetail}>
          <button
            type="button"
            className={`w-full min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              hasDetail ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <div className="flex items-start gap-2">
              <StateIcon
                className={`h-4 w-4 shrink-0 mt-0.5 ${TASK_STATE[state.key].className}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  {hasDetail ? (
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                        open ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    />
                  ) : null}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <ClassChip name={item.class_name} />
                  {isRecurring ? (
                    <Badge
                      variant="outline"
                      className="text-xs font-normal shrink-0 border-transparent bg-secondary/12 text-foreground"
                    >
                      <Repeat className="h-3 w-3 mr-1" aria-hidden />
                      累計 {item.total_logged} 次
                    </Badge>
                  ) : (
                    <HistoryStateChip item={item} />
                  )}
                </div>

                <p className={`mt-1.5 flex items-center gap-1.5 ${TYPE.micro}`}>
                  <CalendarCheck className="h-3 w-3 shrink-0" aria-hidden />
                  {item.archived_at
                    ? `結束於 ${formatTimestampDate(item.archived_at)}`
                    : "結束時間不詳"}
                </p>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 ml-6 space-y-3 rounded-md bg-muted/30 p-3">
            {instruction ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  老師的說明
                </p>
                <p className={`mt-1 ${TYPE.body}`}>{instruction}</p>
              </div>
            ) : null}

            {item.teacher_note ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  老師的評語
                </p>
                <p className={`mt-1 ${TYPE.body}`}>{item.teacher_note}</p>
              </div>
            ) : null}

            {item.student_reported_at ? (
              <p className={TYPE.micro}>
                我在 {formatTimestampDate(item.student_reported_at)} 回報完成
              </p>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export const TaskHistoryPanel = () => {
  const [open, setOpen] = useState(false);
  // 🛑 收合時不去拿資料：這是回顧，不是每次進站都要背的東西。
  const h = useStudentTaskHistory({ enabled: open });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <QuietPanel
        icon={History}
        title="已結束的作業"
        aside={
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {h.loaded && h.total > 0 ? `${h.total} 份` : "查看"}
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
        }
      >
        {!open ? (
          <p className={TYPE.actionMeta}>
            老師結束的作業會留在這裡，包含你的回報與老師的評語。
          </p>
        ) : null}

        <CollapsibleContent>
          {h.loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-2 py-3">
                  <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : h.error ? (
            <Alert variant="destructive">
              <AlertDescription>
                讀不到已結束的作業，請稍後再試。
              </AlertDescription>
            </Alert>
          ) : h.isEmpty ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">還沒有已結束的作業</p>
              <p className="text-xs mt-2">老師結束一份作業之後，它會從待辦移到這裡</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupHistory(h.items).map((g) => (
                <div key={g.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">
                    {g.label}
                  </p>
                  <div>
                    {g.items.map((item) => (
                      <HistoryRow key={item.task_id} item={item} />
                    ))}
                  </div>
                </div>
              ))}

              {h.truncated ? (
                <p className={TYPE.micro}>
                  共 {h.total} 份，這裡顯示最近的 {h.items.length} 份
                </p>
              ) : null}
            </div>
          )}
        </CollapsibleContent>
      </QuietPanel>
    </Collapsible>
  );
};
