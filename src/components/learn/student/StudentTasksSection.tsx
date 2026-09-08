import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useStudentTasks } from "@/hooks/learn/useStudentTasks";
import { needsAction, pickFocus, sortHomework, type StudentHomework } from "@/lib/learn/tasks";
import { FocusTaskCard } from "./tasks/FocusTaskCard";
import { CompactTaskRow } from "./tasks/CompactTaskRow";
import { HabitCard } from "./tasks/HabitCard";
import { UpcomingCard } from "./tasks/UpcomingCard";
import { SectionHead, TYPE } from "./shared";

/**
 * 我的任務 —— Dashboard 上的主區塊。
 *
 * 版面：左邊一件最該做的事（焦點卡），右邊今天的節奏（每日動能）與接下來（即將到來）。
 *
 * 🛑 焦點卡永遠只有一張。有兩張的話，「最該做的是哪一件」就沒有答案了，
 *    版面也會退回成一條一條的清單。其餘作業降級為緊湊列，資訊完整但重量低一階。
 * 🛑 沒有任務時【不】整區消失，而是誠實地說目前沒有。整區憑空不見會讓學生以為系統壞了。
 * 🛑 全部真實資料，來自 learn_student_tasks()。沒有任何示範內容。
 */

/** 焦點以外，左欄還放得下幾條緊湊列 */
const COMPACT_ROWS = 2;
/** 右欄「即將到來」預覽幾項 */
const UPCOMING = 2;

export const StudentTasksSection = () => {
  const st = useStudentTasks();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleReport = async (taskId: string, done: boolean) => {
    setBusyId(taskId);
    const r = await st.reportHomework(taskId, done);
    setBusyId(null);
    if (!r.ok) toast.error("標記失敗，請稍後再試");
    else if (done) toast.success("已回報完成，等待老師確認");
  };

  const handleLog = async (taskId: string, delta: 1 | -1) => {
    setBusyId(taskId);
    const r = await st.logRecurring(taskId, delta);
    setBusyId(null);
    if (!r.ok) toast.error("記錄失敗，請稍後再試");
  };

  if (st.loading) {
    return (
      <section>
        <SectionHead title="我的任務" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <Skeleton className="h-56 rounded-lg lg:col-span-2" />
          <div className="grid gap-4">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        </div>
      </section>
    );
  }

  if (st.error) {
    return (
      <section>
        <SectionHead title="我的任務" />
        <Alert variant="destructive">
          <AlertDescription>目前無法載入任務，請稍後重新整理。</AlertDescription>
        </Alert>
      </section>
    );
  }

  const pending = sortHomework(st.homework.filter(needsAction));

  /*
   * 焦點看的是急迫度（pickFocus），其餘維持清單的順序（sortHomework）——
   * 兩套規則是刻意分開的，理由寫在 lib/learn/tasks.ts 的 pickFocus 註解裡。
   */
  const focus = pickFocus(pending, st.today);
  const others = pending.filter((hw) => hw.task_id !== focus?.task_id);
  const compact = others.slice(0, COMPACT_ROWS);

  /*
   * 「即將到來」放的是左欄擺不下的那幾件，依截止日排序 —— 它回答的是「再來呢」。
   * 刻意與左欄互斥：同一件事在這一區只會出現一次。
   */
  const overflow = others.slice(COMPACT_ROWS);
  const upcoming = [...overflow]
    .sort((a: StudentHomework, b: StudentHomework) =>
      (a.resolved_due_date ?? "9999-12-31").localeCompare(b.resolved_due_date ?? "9999-12-31"),
    )
    .slice(0, UPCOMING);
  const restCount = overflow.length - upcoming.length;

  const hasAnything = st.homework.length > 0 || st.recurring.length > 0;

  return (
    <section>
      <SectionHead
        title="我的任務"
        aside={
          hasAnything ? (
            <Link
              to="/learn/student/tasks"
              className={`${TYPE.actionMeta} flex items-center gap-0.5 hover:text-foreground transition-colors`}
            >
              檢視全部任務
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* 左：焦點 + 其餘作業 */}
        <div className="lg:col-span-2 grid gap-3">
          {focus ? (
            <FocusTaskCard
              hw={focus}
              today={st.today}
              busy={busyId === focus.task_id}
              onReport={handleReport}
            />
          ) : (
            <Card className="p-6 md:p-7">
              <div className="py-6 text-center">
                <p className="text-base font-medium text-foreground">
                  {st.homework.length > 0 ? "作業都回報完了" : "目前沒有待辦作業"}
                </p>
                <p className={`${TYPE.actionMeta} mt-2`}>
                  {st.homework.length > 0
                    ? "等老師確認之後會留在你的任務紀錄裡"
                    : st.recurring.length > 0
                      ? "保持你的節奏就好"
                      : "老師指派作業或常態練習之後會出現在這裡"}
                </p>
              </div>
            </Card>
          )}

          {compact.length > 0 ? (
            <Card className="px-5 py-1">
              {compact.map((hw) => (
                <CompactTaskRow
                  key={hw.task_id}
                  hw={hw}
                  today={st.today}
                  busy={busyId === hw.task_id}
                  onReport={handleReport}
                />
              ))}
            </Card>
          ) : null}

          {restCount > 0 ? (
            <Link
              to="/learn/student/tasks"
              className={`${TYPE.micro} text-center py-1 hover:text-foreground transition-colors`}
            >
              還有 {restCount} 項作業 ›
            </Link>
          ) : null}
        </div>

        {/* 右：今天的節奏與接下來 */}
        <div className="grid gap-4">
          <HabitCard items={st.recurring} busy={!!busyId} onLog={handleLog} />
          <UpcomingCard items={upcoming} today={st.today} />
        </div>
      </div>
    </section>
  );
};
