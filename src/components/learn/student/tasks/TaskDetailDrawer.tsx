import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ExternalLink, Play, RotateCw } from "lucide-react";
import {
  TASK_KIND_LABEL, taskStateOf, type StudentTask,
} from "@/data/learn/taskCenterMock";
import { StateLine, TYPE } from "../shared";
import type { TaskActions } from "./TaskRow";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
      {label}
    </p>
    <div className="mt-1">{children}</div>
  </div>
);

/**
 * 任務詳情抽屜。
 * 🛑 這裡只做任務管理，真正的作答一律回到既有的活動頁面。
 */
export const TaskDetailDrawer = ({
  task,
  onClose,
  actions,
}: {
  task: StudentTask | null;
  onClose: () => void;
  actions: TaskActions;
}) => {
  if (!task) return null;
  const { key, label } = taskStateOf(task);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left mb-5">
          <SheetTitle className="text-xl">{task.title}</SheetTitle>
          <SheetDescription>
            {TASK_KIND_LABEL[task.kind]}
            {task.sourceName && ` · ${task.sourceName}`}
            {` · ${task.dueLabel}前繳交`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <Field label="目前狀態">
            <StateLine stateKey={key} label={label} />
            {task.score && key === "verified" && (
              <p className="text-2xl font-bold text-foreground tabular-nums mt-1.5">
                {task.score.value}
                <span className="text-base font-normal text-muted-foreground"> / {task.score.total}</span>
              </p>
            )}
          </Field>

          {task.instruction && (
            <Field label="老師說明">
              <p className={TYPE.body}>{task.instruction}</p>
            </Field>
          )}

          {task.estimateLabel && (
            <Field label="份量">
              <p className="text-sm text-foreground">{task.estimateLabel}</p>
            </Field>
          )}

          {task.teacherCheck?.note && (
            <Field label="老師備註">
              <p className={TYPE.body}>{task.teacherCheck.note}</p>
              {task.teacherCheck.remaining && (
                <p className="text-sm text-foreground mt-1.5">
                  還需完成：<span className="font-medium">{task.teacherCheck.remaining}</span>
                </p>
              )}
            </Field>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-7">
          {task.kind === "external" && task.externalUrl && (
            <Button variant="outline" asChild>
              <a href={task.externalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                開啟 {task.sourceName ?? "外部作業"}
              </a>
            </Button>
          )}

          {task.kind === "digital" && key !== "verified" && (
            <Button onClick={() => { onClose(); actions.onOpenDigital(task); }}>
              <Play className="h-4 w-4" />
              {key === "in_progress" ? "繼續作答" : "開始作答"}
            </Button>
          )}

          {task.kind !== "digital" && key === "partial" && (
            <Button onClick={() => { actions.onFollowUp(task.id); onClose(); }}>
              <RotateCw className="h-4 w-4" />
              我要補完
            </Button>
          )}
          {task.kind !== "digital" && key === "followup" && (
            <Button onClick={() => { actions.onSubmitFollowUp(task.id); onClose(); }}>
              我補完了
            </Button>
          )}
          {task.kind !== "digital" && (key === "none" || key === "self") && (
            <Button
              variant={key === "self" ? "outline" : "default"}
              onClick={() => { actions.onSelfReport(task.id); onClose(); }}
            >
              {key === "self" ? "取消標記" : "我完成了"}
            </Button>
          )}

          <Button variant="ghost" onClick={onClose}>關閉</Button>
        </div>

        {task.kind === "digital" && (
          <p className={`${TYPE.micro} text-center mt-3`}>
            作答在既有的活動頁面進行，完成後由平台自動記錄。
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
};
