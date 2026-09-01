import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CalendarClock, ChevronLeft, Repeat } from "lucide-react";
import { TASK_SCENARIOS, type StudentTask, type TaskStudentId } from "@/data/learn/taskCenterMock";
import { useTaskCenter, type TaskView } from "@/hooks/learn/useTaskCenter";
import { TYPE, SURFACE } from "@/components/learn/student/shared";
import { TaskRow, type TaskActions } from "@/components/learn/student/tasks/TaskRow";
import { TaskDetailDrawer } from "@/components/learn/student/tasks/TaskDetailDrawer";

const VIEWS: { value: TaskView; label: string }[] = [
  { value: "next_class", label: "下一堂課" },
  { value: "todo", label: "待處理" },
  { value: "awaiting", label: "待老師確認" },
  { value: "history", label: "已完成" },
];

/**
 * ⚠️ Prototype retained for internal reference; not part of current student IA.
 *
 * 這個獨立任務頁在 v1 完成，但產品範圍已收斂：學生的任務體驗回到
 * Student Dashboard 的 Next Class 區塊（v1.3）。這裡的路由僅供內部/開發參考，
 * 不出現在任何學生導覽或首頁入口，也不再繼續開發。
 * 其中的 TaskRow / TaskDetailDrawer / taskCenterMock 已被 Dashboard 重用。
 *
 * Student Task Center — prototype v1
 * 🛑 全部為 mock data。Dashboard 負責摘要，這裡負責管理完整的 assignment lifecycle。
 * 🛑 Recurring Practice 不進主清單，只留一行參考連回 Today Practice。
 */
const StudentTasks = () => {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState<TaskStudentId>("amy");
  const [view, setView] = useState<TaskView>("next_class");
  const [detail, setDetail] = useState<StudentTask | null>(null);
  const [digital, setDigital] = useState<StudentTask | null>(null);
  const tc = useTaskCenter(studentId);

  const actions: TaskActions = {
    onSelfReport: tc.toggleSelfReport,
    onOpenDigital: (t) => setDigital(t),
    onFollowUp: (id) => { tc.chooseFollowUp(id); toast.success("已加入補完，完成後記得標記"); },
    onSubmitFollowUp: (id) => { tc.submitFollowUp(id); toast.success("已送出，等待老師再次確認"); },
    onOpenDetail: (t) => setDetail(t),
  };

  const list =
    view === "next_class" ? tc.nextClassTasks
      : view === "todo" ? tc.todoTasks
        : view === "awaiting" ? tc.awaitingTasks
          : [];

  const s = tc.summary;
  const needAction = s.notStarted + s.inProgress;

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          {/* 頁首 */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 mb-1 h-8 text-muted-foreground"
                onClick={() => navigate("/learn/student")}
              >
                <ChevronLeft className="h-4 w-4" />
                回到學習首頁
              </Button>
              <h1 className="text-xl md:text-[1.6rem] font-bold text-foreground leading-tight">
                我的任務
              </h1>
              <p className={TYPE.micro}>
                {tc.scenario.name} · {tc.scenario.className}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Tabs value={studentId} onValueChange={(v) => setStudentId(v as TaskStudentId)}>
                <TabsList>
                  <TabsTrigger value="amy">{TASK_SCENARIOS.amy.switchLabel}</TabsTrigger>
                  <TabsTrigger value="brian">{TASK_SCENARIOS.brian.switchLabel}</TabsTrigger>
                </TabsList>
              </Tabs>
              <Badge variant="outline" className="text-xs text-muted-foreground">示範資料</Badge>
            </div>
          </div>

          {/* 下一堂課摘要：時間與「還要做什麼」在前，readiness 是次要資訊 */}
          <Card className={`p-5 md:p-6 ${SURFACE.raised} border`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  下一堂課
                </p>
                <p className="text-2xl md:text-3xl font-bold text-foreground mt-1 leading-tight">
                  {tc.scenario.nextClass.relativeLabel} {tc.scenario.nextClass.timeLabel}
                </p>
                <p className={`${TYPE.actionMeta} mt-0.5 flex items-center gap-1.5`}>
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  {tc.scenario.nextClass.dateLabel} · {tc.scenario.className}
                </p>
              </div>

              <div className="min-w-0">
                <ul className="space-y-1">
                  {[
                    { n: s.inProgress, label: "項進行中" },
                    { n: s.notStarted, label: "項尚未完成" },
                    { n: s.partial, label: "項部分完成" },
                    { n: s.awaiting, label: "項待老師確認" },
                  ]
                    .filter((r) => r.n > 0)
                    .map((r) => (
                      <li key={r.label} className="text-[15px]">
                        <span className="font-bold text-foreground tabular-nums">{r.n}</span>
                        <span className="ml-1.5 text-foreground/80">{r.label}</span>
                      </li>
                    ))}
                  {needAction === 0 && s.partial === 0 && (
                    <li className="text-[15px] text-foreground/80">上課前的項目都處理完了</li>
                  )}
                </ul>
                {/* readiness 刻意降為一行 microcopy */}
                <p className={`${TYPE.micro} mt-2 tabular-nums`}>
                  準備度 {s.ready} / {s.total}
                </p>
              </div>
            </div>
          </Card>

          {/* 視圖切換 */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as TaskView)}>
              <TabsList>
                {VIEWS.map((v) => (
                  <TabsTrigger key={v.value} value={v.value}>
                    {v.label}
                    {v.value === "awaiting" && s.awaiting > 0 && (
                      <span className="ml-1.5 tabular-nums text-muted-foreground">{s.awaiting}</span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {/* 示範用：驗證「沒補完的部分完成不會被追到下一週」 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => {
                if (tc.weekRolled) { tc.reset(); toast("已回到本週"); }
                else { tc.rollWeek(); toast("已進入下一週，未補完的部分完成留在歷史紀錄"); }
              }}
            >
              {tc.weekRolled ? "回到本週" : "示範：進入下一週"}
            </Button>
          </div>

          {/* 清單 */}
          <div className="mt-4 space-y-3">
            {view === "history" ? (
              tc.completedWeeks.length === 0 ? (
                <p className={`${TYPE.actionMeta} py-6`}>還沒有已完成的紀錄。</p>
              ) : (
                tc.completedWeeks.map((w) => (
                  <div key={w.label}>
                    <h2 className={`${TYPE.cardTitle} mt-4 mb-2 first:mt-0`}>{w.label}</h2>
                    <div className="rounded-lg border border-border/60 bg-card/70 divide-y divide-border/50">
                      {w.tasks.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-sm text-foreground/80 truncate min-w-0">{t.title}</span>
                          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold leading-4 tracking-wider text-muted-foreground">
                            {t.resultSource}
                          </span>
                          <span
                            className={`ml-auto text-sm shrink-0 tabular-nums ${
                              t.partialPercent ? "text-warning font-medium" : "text-foreground font-semibold"
                            }`}
                          >
                            {t.resultLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : list.length === 0 ? (
              <p className={`${TYPE.actionMeta} py-6`}>
                {view === "todo"
                  ? "目前沒有需要你動手的任務。"
                  : view === "awaiting"
                    ? "目前沒有等待老師確認的項目。"
                    : "這一堂課還沒有指派任務。"}
              </p>
            ) : (
              list.map((t) => <TaskRow key={t.id} task={t} actions={actions} />)
            )}
          </div>

          {/* 每日固定練習只留一行參考，不混進 assignment lifecycle */}
          {view === "next_class" && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/25 px-4 py-3">
              <Repeat className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-foreground/80">
                今天固定練習 {tc.scenario.recurringToday} 項
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 ml-auto"
                onClick={() => navigate("/learn/student")}
              >
                查看今日練習
              </Button>
            </div>
          )}

          <p className={`${TYPE.micro} text-center mt-8`}>
            本頁為設計原型，所有資料皆為示範用途，未連接後端。
          </p>
        </div>
      </div>

      <TaskDetailDrawer task={detail} onClose={() => setDetail(null)} actions={actions} />

      {/* 線上任務：作答本身在既有活動頁面，原型用這個對話框模擬狀態轉換 */}
      <Dialog open={!!digital} onOpenChange={(o) => !o && setDigital(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{digital?.title}</DialogTitle>
            <DialogDescription>
              正式版會開啟平台既有的作答頁面。原型階段可以在這裡模擬進度與完成，
              完成後由平台自動記錄，不需要你自己標記。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {digital && !digital.progress?.done && (
              <Button
                variant="outline"
                onClick={() => {
                  tc.startDigital(digital.id);
                  toast("已模擬作答到一半");
                  setDigital(null);
                }}
              >
                模擬做到一半
              </Button>
            )}
            <Button
              onClick={() => {
                if (digital) {
                  tc.completeDigital(digital.id, 86);
                  toast.success(`${digital.title} 已完成 · 86 分`);
                }
                setDigital(null);
              }}
            >
              模擬完成
            </Button>
            <Button variant="ghost" onClick={() => setDigital(null)}>關閉</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default StudentTasks;
