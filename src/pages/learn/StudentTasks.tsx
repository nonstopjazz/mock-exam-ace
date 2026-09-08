import { useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Repeat } from "lucide-react";
import { toast } from "sonner";
import { useStudentTasks } from "@/hooks/learn/useStudentTasks";
import {
  homeworkState, needsAction, sortHomework, type StudentHomework,
} from "@/lib/learn/tasks";
import { TaskCard } from "@/components/learn/student/tasks/TaskCard";
import { RecurringCard } from "@/components/learn/student/tasks/RecurringCard";
import { TYPE } from "@/components/learn/student/shared";

type View = "todo" | "awaiting" | "done";

const VIEW_LABEL: Record<View, string> = {
  todo: "還要做",
  awaiting: "待老師確認",
  done: "已完成",
};

const EMPTY_TEXT: Record<View, { title: string; hint: string }> = {
  todo: { title: "沒有待處理的作業", hint: "老師指派新作業之後會出現在這裡" },
  awaiting: { title: "沒有等待確認的項目", hint: "回報完成的作業會先放在這裡，等老師檢查" },
  done: { title: "還沒有老師確認完成的作業", hint: "老師檢查過的作業會留在這裡當紀錄" },
};

/**
 * 學生的任務中心 —— 全部真實資料，來自 learn_student_tasks()。
 *
 * 版面與 Dashboard 的任務區塊是同一套語彙：同一組徽章、同樣的留白節奏、
 * 同一個進度環。差別只在這裡是【完整清單】—— 一項一張卡、由上往下排，
 * 老師的說明與時間戳記收在展開裡，不在收合時佔位置。
 *
 * 🛑 這一頁沒有實心按鈕。實心的只有 Dashboard 焦點卡那一顆；
 *    一整頁的清單如果每張卡都實心，就會變成一片琥珀色。
 * 🛑 這一頁只看得到自己的任務。RPC 不接受 student_id 參數，
 *    所以不存在「查別人」這個可能性。
 * 🛑 分頁的空狀態會直說原因，不是留一片空白。
 */
const StudentTasks = () => {
  const st = useStudentTasks();
  const [view, setView] = useState<View>("todo");
  const [busyId, setBusyId] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const todo: StudentHomework[] = [];
    const awaiting: StudentHomework[] = [];
    const done: StudentHomework[] = [];
    for (const hw of st.homework) {
      const key = homeworkState(hw).key;
      if (key === "verified") done.push(hw);
      else if (needsAction(hw)) todo.push(hw);
      else awaiting.push(hw);
    }
    return {
      todo: sortHomework(todo),
      awaiting: sortHomework(awaiting),
      done: sortHomework(done),
    };
  }, [st.homework]);

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

  const list = buckets[view];

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        {/* 清單頁收在一欄裡：卡片橫跨 1400px 只會在中間留下一大片空白 */}
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8 flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
              <ClipboardList className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">我的任務</h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                老師指派的作業與常態練習
              </p>
            </div>
          </div>

          {st.loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : st.error ? (
            <Alert variant="destructive">
              <AlertDescription>目前無法載入任務，請稍後重新整理。</AlertDescription>
            </Alert>
          ) : (
            <>
              {/* 作業 */}
              <section className="mb-10">
                <Tabs value={view} onValueChange={(v) => setView(v as View)}>
                  <TabsList className="mb-4">
                    {(Object.keys(VIEW_LABEL) as View[]).map((k) => (
                      <TabsTrigger key={k} value={k}>
                        {VIEW_LABEL[k]}
                        {buckets[k].length > 0 ? (
                          <span className="ml-1.5 text-xs tabular-nums opacity-70">
                            {buckets[k].length}
                          </span>
                        ) : null}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                {list.length === 0 ? (
                  <Card className="p-6">
                    <div className="text-center py-12 text-muted-foreground">
                      <p>{EMPTY_TEXT[view].title}</p>
                      <p className="text-sm mt-2">{EMPTY_TEXT[view].hint}</p>
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {list.map((hw) => (
                      <TaskCard
                        key={hw.task_id}
                        hw={hw}
                        today={st.today}
                        busy={busyId === hw.task_id}
                        onReport={handleReport}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* 常態練習 —— 沒有的時候整區不出現，它本來就不是每個班都有 */}
              {st.recurring.length > 0 ? (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Repeat className="h-5 w-5 text-muted-foreground shrink-0" />
                    <h2 className={TYPE.sectionHeading}>常態練習</h2>
                  </div>
                  <div className="space-y-3">
                    {st.recurring.map((item) => (
                      <RecurringCard
                        key={item.task_id}
                        item={item}
                        busy={busyId === item.task_id}
                        onLog={handleLog}
                      />
                    ))}
                  </div>
                  <p className={`${TYPE.micro} mt-3`}>
                    沒有練習的日子不會累積成待辦，這裡看的是當期的完成次數。
                  </p>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default StudentTasks;
