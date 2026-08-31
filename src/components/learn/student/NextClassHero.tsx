import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Check, ChevronDown, Circle, Clock, ExternalLink, FileText, Laptop, Triangle, Undo2,
} from "lucide-react";
import { isTaskReady, type ClassTask } from "@/data/learn/studentDashboardMock";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const KIND_ICON = { paper: FileText, external: ExternalLink, digital: Laptop } as const;

/**
 * 準備度圓環：外圈是老師已確認的，內側較淺的是自行標記待確認的。
 * 一眼就能看出「我以為完成的」和「真的被確認的」不是同一件事。
 */
const ReadinessRing = ({
  verified, selfReported, total,
}: { verified: number; selfReported: number; total: number }) => {
  const R = 46, C = 2 * Math.PI * R;
  const seg = (n: number) => (total ? (n / total) * C : 0);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10"
          className="stroke-muted" />
        {/* 自行標記（含已確認）—— 較淺，虛線代表尚未有結論 */}
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
          className="stroke-secondary/35"
          strokeDasharray={`${seg(verified + selfReported)} ${C}`} />
        {/* 老師已確認 —— 實心 */}
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
          className="stroke-secondary"
          strokeDasharray={`${seg(verified)} ${C}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground tabular-nums leading-none">
          {verified + selfReported}
          <span className="text-lg text-muted-foreground font-semibold">/{total}</span>
        </span>
        <span className="text-xs text-muted-foreground mt-1">準備度</span>
      </div>
    </div>
  );
};

/** 狀態列：用 icon + 排版分辨，而不是一排彩色 pill */
const StatusLine = ({ task }: { task: ClassTask }) => {
  if (task.teacherCheck) {
    const { status, percent } = task.teacherCheck;
    if (status === "done")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
          <Check className="h-3.5 w-3.5" />老師已確認
        </span>
      );
    if (status === "partial")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
          <Triangle className="h-3.5 w-3.5" />老師檢查：完成 {percent}%
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Circle className="h-3.5 w-3.5" />老師檢查：尚未完成
      </span>
    );
  }
  if (task.kind === "digital" && task.autoCompleted)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <Check className="h-3.5 w-3.5" />已完成 · 平台記錄
      </span>
    );
  if (task.studentReported)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary">
        <Clock className="h-3.5 w-3.5" />我已完成 · 待老師確認
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Circle className="h-3.5 w-3.5" />尚未完成
    </span>
  );
};

const TaskRow = ({
  task, onSelfReport, onStartDigital, dim,
}: { task: ClassTask; onSelfReport: () => void; onStartDigital: () => void; dim?: boolean }) => {
  const Icon = KIND_ICON[task.kind];
  return (
    <div className={`flex items-start gap-3 py-2.5 ${dim ? "opacity-70" : ""}`}>
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${dim ? "text-muted-foreground" : "text-secondary"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>
        {task.detail && <p className="text-xs text-muted-foreground mt-0.5">{task.detail}</p>}
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <StatusLine task={task} />
          {task.sourceName && (
            <span className="text-xs text-muted-foreground">· {task.sourceName}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {task.kind === "external" && task.externalUrl && (
          <Button variant="ghost" size="sm" className="h-8" asChild>
            <a href={task.externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />開啟
            </a>
          </Button>
        )}
        {task.kind === "digital" && !task.autoCompleted && (
          <Button size="sm" className="h-8" onClick={onStartDigital}>開始</Button>
        )}
        {/* 🛑 老師檢查過的項目沒有這顆按鈕，學生無法把自己的勾變成已確認 */}
        {task.kind !== "digital" && !task.teacherCheck && (
          <Button
            variant={task.studentReported ? "ghost" : "outline"}
            size="sm"
            className={`h-8 ${task.studentReported ? "text-muted-foreground" : ""}`}
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
      <Card className="overflow-hidden border-primary/20">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* 左：日期與準備度 */}
          <div className="bg-gradient-to-br from-primary/12 to-accent/12 p-6 lg:p-7 border-b lg:border-b-0 lg:border-r border-primary/20">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">下一堂課</p>
            <p className="text-3xl md:text-4xl font-bold text-foreground mt-1 leading-tight">
              {scenario.nextClass.dateLabel}
            </p>
            <p className="text-lg font-semibold text-foreground/80 mt-0.5">
              {scenario.nextClass.timeLabel}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {scenario.className}
              </span>
            </p>
            <p className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-card/70 border border-primary/25 px-3 py-1 text-sm font-medium text-foreground">
              還有 {scenario.daysUntil} 天
            </p>

            <div className="flex items-center gap-5 mt-6">
              <ReadinessRing verified={verified} selfReported={awaiting} total={readiness.total} />
              <div className="space-y-2 min-w-0">
                <p className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-secondary shrink-0" />
                  <span className="font-semibold text-foreground tabular-nums">{verified}</span>
                  <span className="text-muted-foreground">項老師已確認</span>
                </p>
                <p className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-secondary/35 shrink-0" />
                  <span className="font-semibold text-foreground tabular-nums">{awaiting}</span>
                  <span className="text-muted-foreground">項待老師確認</span>
                </p>
                <p className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted border border-border shrink-0" />
                  <span className="font-semibold text-foreground tabular-nums">{pending.length}</span>
                  <span className="text-muted-foreground">項待完成</span>
                </p>
              </div>
            </div>
          </div>

          {/* 右：待辦清單 */}
          <div className="p-6 lg:p-7">
            <h2 className="text-base font-semibold text-foreground mb-1">
              還要完成
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                {pending.length} 項
              </span>
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                上課前的項目都完成了，剩下的老師會在課堂上檢查。
              </p>
            ) : (
              <div className="divide-y divide-border/60">
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
              <div className="mt-3 pt-3 border-t border-border">
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
                  <div className="divide-y divide-border/60 mt-1">
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
