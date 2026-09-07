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
import { HomeworkRow } from "@/components/learn/student/tasks/HomeworkRow";
import { RecurringRow } from "@/components/learn/student/tasks/RecurringRow";
import { SURFACE, TYPE } from "@/components/learn/student/shared";

type View = "todo" | "awaiting" | "done";

const VIEW_LABEL: Record<View, string> = {
  todo: "還要做",
  awaiting: "待老師確認",
  done: "已完成",
};

const EMPTY_TEXT: Record<View, { title: string; hint: string }> = {
  todo: { title: "沒有待處理的作業", hint: "老師指派新作業之後會出現在這裡" },
  awaiting: { title: "沒有等待確認的項目", hint: "標記完成的作業會先放在這裡，等老師檢查" },
  done: { title: "還沒有老師確認完成的作業", hint: "老師檢查過的作業會留在這裡當紀錄" },
};

/**
 * 學生的任務中心 —— 全部真實資料，來自 learn_student_tasks()。
 *
 * 🛑 這一頁只看得到自己的任務。RPC 不接受 student_id 參數，
 *    所以不存在「查別人」這個可能性。
 * 🛑 分頁的空狀態會直說原因，不是留一片空白。Dashboard 的任務卡則永遠不隱藏。
 */
const StudentTasks = () => {
  const st = useStudentTasks();
  const [view, setView] = useState<View>("todo");

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
    const r = await st.reportHomework(taskId, done);
    if (!r.ok) toast.error("標記失敗，請稍後再試");
    else if (done) toast.success("已標記完成，等待老師確認");
  };

  const handleLog = async (taskId: string, delta: 1 | -1) => {
    const r = await st.logRecurring(taskId, delta);
    if (!r.ok) toast.error("記錄失敗，請稍後再試");
  };

  const list = buckets[view];

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* 頁首 */}
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
            <Card className={`p-6 ${SURFACE.base}`}>
              <Skeleton className="h-5 w-32 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </Card>
          ) : st.error ? (
            <Alert variant="destructive">
              <AlertDescription>目前無法載入任務，請稍後重新整理。</AlertDescription>
            </Alert>
          ) : (
            <>
              {/* 作業 */}
              <section className="mb-8">
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

                <Card className={`p-6 ${SURFACE.base}`}>
                  {list.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>{EMPTY_TEXT[view].title}</p>
                      <p className="text-sm mt-2">{EMPTY_TEXT[view].hint}</p>
                    </div>
                  ) : (
                    list.map((hw) => (
                      <HomeworkRow
                        key={hw.task_id}
                        hw={hw}
                        today={st.today}
                        onReport={handleReport}
                      />
                    ))
                  )}
                </Card>
              </section>

              {/* 常態練習 —— 沒有的時候整區不出現，它本來就不是每個班都有 */}
              {st.recurring.length > 0 ? (
                <section className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <Repeat className="h-5 w-5 text-muted-foreground shrink-0" />
                    <h2 className={TYPE.sectionHeading}>常態練習</h2>
                  </div>
                  <Card className={`p-6 ${SURFACE.base}`}>
                    {st.recurring.map((item) => (
                      <RecurringRow key={item.task_id} item={item} onLog={handleLog} />
                    ))}
                    <p className={`${TYPE.micro} mt-3`}>
                      沒有練習的日子不會累積成待辦，這裡看的是當期的完成次數。
                    </p>
                  </Card>
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
