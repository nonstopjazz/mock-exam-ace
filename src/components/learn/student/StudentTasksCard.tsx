import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronRight, ClipboardList, Repeat } from "lucide-react";
import { toast } from "sonner";
import { useStudentTasks } from "@/hooks/learn/useStudentTasks";
import {
  formatDate, needsAction, recurringProgress, sortHomework,
} from "@/lib/learn/tasks";
import { HomeworkRow } from "./tasks/HomeworkRow";
import { RecurringRow } from "./tasks/RecurringRow";
import { SURFACE, TYPE } from "./shared";

const MAX_ROWS = 3;

/**
 * Dashboard 上的任務卡 —— 真實資料，老師指派什麼就顯示什麼。
 *
 * 🛑 沒有任務時【不】整張卡消失，而是誠實地說「目前沒有新的任務」。
 *    整張卡憑空不見會讓學生以為系統壞了；空狀態要有理由。
 * 只顯示前 ${MAX_ROWS} 項需要處理的，其餘留給完整的任務頁。
 */
export const StudentTasksCard = () => {
  const st = useStudentTasks();

  const handleReport = async (taskId: string, done: boolean) => {
    const r = await st.reportHomework(taskId, done);
    if (!r.ok) toast.error("標記失敗，請稍後再試");
    else if (done) toast.success("已標記完成，等待老師確認");
  };

  const handleLog = async (taskId: string, delta: 1 | -1) => {
    const r = await st.logRecurring(taskId, delta);
    if (!r.ok) toast.error("記錄失敗，請稍後再試");
  };

  if (st.loading) {
    return (
      <Card className={`p-5 ${SURFACE.raised}`}>
        <Skeleton className="h-5 w-28 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  }

  if (st.error) {
    return (
      <Card className={`p-5 ${SURFACE.raised}`}>
        <Alert variant="destructive">
          <AlertDescription>目前無法載入任務，請稍後重新整理。</AlertDescription>
        </Alert>
      </Card>
    );
  }

  const pending = sortHomework(st.homework.filter(needsAction));
  const shown = pending.slice(0, MAX_ROWS);
  const rest = pending.length - shown.length;
  const openRecurring = st.recurring.filter((r) => !recurringProgress(r).met);

  // 下次上課日期：有多個班就取最近的一個；沒有排定就不顯示這一行，不編日期。
  const nextDate = st.homework
    .map((h) => h.resolved_due_date)
    .filter((d): d is string => !!d)
    .sort()[0];

  return (
    <Card className={`p-5 ${SURFACE.raised}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className={TYPE.cardTitle}>我的任務</h2>
        </div>
        {nextDate ? (
          <span className={`${TYPE.micro} shrink-0`}>最近的截止：{formatDate(nextDate)}</span>
        ) : null}
      </div>

      {st.isEmpty ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">目前沒有新的任務</p>
          <p className={`${TYPE.micro} mt-2`}>老師指派作業或常態練習之後會出現在這裡</p>
        </div>
      ) : (
        <>
          {shown.length > 0 ? (
            <div>
              {shown.map((hw) => (
                <HomeworkRow key={hw.task_id} hw={hw} today={st.today} onReport={handleReport} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-3">
              作業都處理完了{st.homework.length > 0 ? "，等待老師確認" : ""}
            </p>
          )}

          {openRecurring.length > 0 ? (
            <div className="mt-4 pt-3 border-t border-border/60">
              <div className="flex items-center gap-2 mb-1">
                <Repeat className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className={TYPE.micro}>常態練習</span>
              </div>
              {openRecurring.slice(0, MAX_ROWS).map((item) => (
                <RecurringRow key={item.task_id} item={item} onLog={handleLog} />
              ))}
            </div>
          ) : null}

          <Button asChild variant="ghost" size="sm" className="mt-3 w-full justify-between">
            <Link to="/learn/student/tasks">
              {rest > 0 ? `查看全部任務（還有 ${rest} 項）` : "查看全部任務"}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </>
      )}
    </Card>
  );
};
