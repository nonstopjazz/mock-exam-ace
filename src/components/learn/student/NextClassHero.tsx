import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, FileText, Laptop, Undo2 } from "lucide-react";
import { isTaskReady, type ClassTask } from "@/data/learn/studentDashboardMock";
import { SURFACE, TYPE, TaskState } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const KIND_ICON = { paper: FileText, external: ExternalLink, digital: Laptop } as const;

/**
 * 準備度圓環：外圈是老師已確認的，內側較淺的是自行標記待確認的。
 * 一眼就能看出「我以為完成的」和「真的被確認的」不是同一件事。
 */
const ReadinessRing = ({
  verified, selfReported, total,
}: { verified: number; selfReported: number; total: number }) => {
  const R = 47, C = 2 * Math.PI * R;
  const seg = (n: number) => (total ? (n / total) * C : 0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const arc = (n: number) => `${shown ? seg(n) : 0} ${C}`;

  return (
    <div className="relative h-[104px] w-[104px] shrink-0" role="img"
      aria-label={`準備度 ${verified + selfReported} / ${total}，其中老師已確認 ${verified} 項`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" className="stroke-border" />
        {/* 自行標記（含已確認）—— 較淺，代表還沒有結論 */}
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
          className="stroke-secondary/30 transition-[stroke-dasharray] duration-700 ease-out"
          strokeDasharray={arc(verified + selfReported)} />
        {/* 老師已確認 —— 實心 */}
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
          className="stroke-secondary transition-[stroke-dasharray] duration-700 ease-out delay-100"
          strokeDasharray={arc(verified)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] text-muted-foreground leading-none">準備度</span>
        <span className="text-xl font-bold text-foreground tabular-nums leading-none mt-1">
          {verified + selfReported}
          <span className="text-sm text-muted-foreground font-semibold"> / {total}</span>
        </span>
      </div>
    </div>
  );
};

const TaskRow = ({
  task, onSelfReport, onStartDigital, dim,
}: { task: ClassTask; onSelfReport: () => void; onStartDigital: () => void; dim?: boolean }) => {
  const Icon = KIND_ICON[task.kind];
  return (
    <div className={`flex items-start gap-3 py-3 ${dim ? "opacity-60" : ""}`}>
      <span className="w-5 flex justify-center pt-0.5 shrink-0">
        <Icon className={`h-4 w-4 ${dim ? "text-muted-foreground" : "text-secondary/80"}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>
        {task.detail && <p className={`${TYPE.micro} mt-0.5`}>{task.detail}</p>}
        <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
          <TaskState task={task} />
          {task.sourceName && (
            <span className={TYPE.micro}>· {task.sourceName}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        {task.kind === "external" && task.externalUrl && (
          <Button variant="ghost" size="sm" className="h-8 px-2.5" asChild>
            <a href={task.externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />開啟
            </a>
          </Button>
        )}
        {task.kind === "digital" && !task.autoCompleted && (
          <Button size="sm" className="h-8 px-3.5 transition-shadow hover:shadow-button" onClick={onStartDigital}>開始</Button>
        )}
        {/* 🛑 老師檢查過的項目沒有這顆按鈕，學生無法把自己的勾變成已確認 */}
        {task.kind !== "digital" && !task.teacherCheck && (
          <Button
            variant={task.studentReported ? "ghost" : "outline"}
            size="sm"
            className={`h-8 px-3 ${task.studentReported ? "text-muted-foreground" : ""}`}
            onClick={onSelfReport}
          >
            {task.studentReported ? <Undo2 className="h-3.5 w-3.5" /> : null}
            {task.studentReported ? "取消" : "我完成了"}
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Next Class Hero —— 整頁唯一的主視覺，也是學生登入的第一個問題：
 * 下次上課前，我還要做什麼？
 */
export const NextClassHero = ({ sd }: { sd: StudentDashboard }) => {
  const { scenario, tasks, readiness, toggleSelfReport, completeDigital } = sd;
  const [starting, setStarting] = useState<ClassTask | null>(null);
  const [showDone, setShowDone] = useState(false);

  const pending = tasks.filter((t) => !isTaskReady(t));
  const done = tasks.filter(isTaskReady);
  const verified = tasks.filter(
    (t) => t.teacherCheck?.status === "done" || (t.kind === "digital" && t.autoCompleted),
  ).length;
  const awaiting = tasks.filter((t) => !t.teacherCheck && t.kind !== "digital" && t.studentReported).length;

  return (
    <>
      <Card className="overflow-hidden border-primary/25 shadow-card">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,23.5rem)_1fr]">
          {/* 左：日期與準備度 */}
          <div className="bg-gradient-to-br from-primary/12 to-accent/10 p-6 lg:p-7 border-b lg:border-b-0 lg:border-r border-primary/20">
            <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              下一堂課
            </p>
            <p className="text-3xl md:text-[2.5rem] font-bold text-foreground mt-1.5 leading-[1.1] tracking-tight whitespace-nowrap">
              {scenario.nextClass.dateLabel}
            </p>
            <p className="text-base font-semibold text-foreground/75 mt-2">
              {scenario.nextClass.timeLabel}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {scenario.className}
              </span>
            </p>
            <p className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-card border border-primary/30 px-3 py-1 text-sm font-semibold text-foreground shadow-sm">
              還有 {scenario.daysUntil} 天
            </p>

            <div className="flex items-center gap-5 mt-6 pt-5 border-t border-primary/15">
              <ReadinessRing verified={verified} selfReported={awaiting} total={readiness.total} />
              <ul className="space-y-1.5 min-w-0">
                {[
                  { n: verified, label: "項老師已確認", dot: "bg-secondary" },
                  { n: awaiting, label: "項待老師確認", dot: "bg-secondary/30" },
                  { n: pending.length, label: "項待完成", dot: "bg-muted border border-border" },
                ].map((r) => (
                  <li key={r.label} className="flex items-center gap-2 text-[13px]">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${r.dot}`} />
                    <span className="font-semibold text-foreground tabular-nums w-3 text-right">
                      {r.n}
                    </span>
                    <span className="text-muted-foreground">{r.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 右：待辦清單 */}
          <div className="p-6 lg:p-7 min-w-0 flex flex-col">
            <h2 className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
                {pending.length}
              </span>
              <span className="text-base font-semibold text-foreground">項還要完成</span>
              <span className={`${TYPE.micro} ml-auto`}>上課前</span>
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                上課前的項目都完成了，剩下的老師會在課堂上檢查。
              </p>
            ) : (
              <div className="divide-y divide-border/50">
                {pending.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onSelfReport={() => toggleSelfReport(t.id)}
                    onStartDigital={() => setStarting(t)}
                  />
                ))}
              </div>
            )}

            {done.length > 0 && (
              <div className="mt-auto pt-4 border-t border-border/70">
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={showDone}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground rounded-md px-1 py-1 -ml-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  已完成 {done.length} 項
                  <ChevronDown className={`h-4 w-4 transition-transform ${showDone ? "rotate-180" : ""}`} />
                </button>
                {showDone && (
                  <div className="divide-y divide-border/50 mt-1">
                    {done.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        dim
                        onSelfReport={() => toggleSelfReport(t.id)}
                        onStartDigital={() => setStarting(t)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={!!starting} onOpenChange={(o) => !o && setStarting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{starting?.title}</DialogTitle>
            <DialogDescription>
              這裡之後會開啟平台內的作答畫面。原型階段可以直接模擬完成，
              完成後由系統記錄，不需要你自己標記。
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                if (starting) {
                  completeDigital(starting.id);
                  toast.success(`${starting.title} 已完成`);
                }
                setStarting(null);
              }}
            >
              模擬完成
            </Button>
            <Button variant="outline" onClick={() => setStarting(null)}>關閉</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
