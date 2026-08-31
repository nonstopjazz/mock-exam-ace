import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarClock, ExternalLink, FileText, Laptop, Undo2 } from "lucide-react";
import { Meter } from "@/components/learn/parent/shared";
import {
  TASK_KIND_LABEL, isTaskReady, type ClassTask,
} from "@/data/learn/studentDashboardMock";
import { TaskStatus } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const KIND_ICON = { paper: FileText, external: ExternalLink, digital: Laptop } as const;

const TaskRow = ({
  task,
  onSelfReport,
  onStartDigital,
}: {
  task: ClassTask;
  onSelfReport: () => void;
  onStartDigital: () => void;
}) => {
  const Icon = KIND_ICON[task.kind];
  const ready = isTaskReady(task);

  return (
    <div className="flex flex-wrap items-start gap-3 py-3">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${ready ? "text-muted-foreground" : "text-secondary"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-foreground">{task.title}</p>
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground px-1.5 py-0">
            {TASK_KIND_LABEL[task.kind]}
          </Badge>
          {task.sourceName && (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground px-1.5 py-0">
              {task.sourceName}
            </Badge>
          )}
        </div>
        {task.detail && (
          <p className="text-sm text-muted-foreground mt-0.5">{task.detail}</p>
        )}
        <div className="mt-1.5">
          <TaskStatus task={task} />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {task.kind === "external" && task.externalUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={task.externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              開啟
            </a>
          </Button>
        )}
        {task.kind === "digital" && !task.autoCompleted && (
          <Button size="sm" onClick={onStartDigital}>開始</Button>
        )}
        {/* 🛑 學生只能標記自己的紙本 / 外部作業，不能改老師的檢查結果 */}
        {task.kind !== "digital" && !task.teacherCheck && (
          <Button
            variant={task.studentReported ? "ghost" : "outline"}
            size="sm"
            className={task.studentReported ? "text-muted-foreground" : ""}
            onClick={onSelfReport}
          >
            {task.studentReported ? <Undo2 className="h-4 w-4" /> : null}
            {task.studentReported ? "取消標記" : "我完成了"}
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Next Class Readiness —— 學生登入後最先看到的東西。
 * 回答一個問題：下次上課前，我還要完成什麼？
 */
export const NextClassReadiness = ({ sd }: { sd: StudentDashboard }) => {
  const { scenario, tasks, readiness, toggleSelfReport, completeDigital } = sd;
  const [starting, setStarting] = useState<ClassTask | null>(null);

  const pending = tasks.filter((t) => !isTaskReady(t));
  const doneList = tasks.filter(isTaskReady);
  const pct = readiness.total ? (readiness.ready / readiness.total) * 100 : 0;

  return (
    <>
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-5">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground mb-1">下一堂課</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              {scenario.nextClass.dateLabel}
              <span className="ml-2 text-lg font-semibold text-muted-foreground">
                {scenario.nextClass.timeLabel}
              </span>
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 shrink-0" />
              {scenario.className}
            </p>
          </div>
          <div className="shrink-0 lg:text-right lg:w-64">
            <p className="text-sm text-muted-foreground mb-1.5">
              上課前的準備
              <span className="ml-2 text-lg font-bold text-foreground tabular-nums">
                {readiness.ready} / {readiness.total}
              </span>
            </p>
            <Meter value={pct} tone={pct >= 100 ? "strong" : "neutral"} />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">
            還要完成
            <span className="ml-1.5 text-muted-foreground font-normal tabular-nums">
              {pending.length} 項
            </span>
          </p>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">
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
        </div>

        {doneList.length > 0 && (
          <div className="mt-5 pt-4 border-t border-primary/20">
            <p className="text-sm font-semibold text-foreground mb-1">
              已完成
              <span className="ml-1.5 text-muted-foreground font-normal tabular-nums">
                {doneList.length} 項
              </span>
            </p>
            <div className="divide-y divide-border/60">
              {doneList.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onSelfReport={() => toggleSelfReport(t.id)}
                  onStartDigital={() => setStarting(t)}
                />
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 平台內任務：原型階段用一個對話框代表實際的作答畫面 */}
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
