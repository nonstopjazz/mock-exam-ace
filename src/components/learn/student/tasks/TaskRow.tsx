import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, Laptop, Play, RotateCw, Undo2 } from "lucide-react";
import {
  TASK_KIND_LABEL, taskStateOf, needsAction, type StudentTask,
} from "@/data/learn/taskCenterMock";
import { StateLine, TYPE } from "../shared";

const KIND_ICON = { paper: FileText, digital: Laptop, external: ExternalLink } as const;

export interface TaskActions {
  onSelfReport: (id: string) => void;
  onOpenDigital: (task: StudentTask) => void;
  onFollowUp: (id: string) => void;
  onSubmitFollowUp: (id: string) => void;
  onOpenDetail: (task: StudentTask) => void;
}

/**
 * 一列一個任務：list + card hybrid。
 * 需要行動的用 raised 表面撐起來，不需要行動的安靜下去，
 * 但完成的項目仍然留在清單裡 —— 學生要看得到老師這週交代了什麼。
 */
export const TaskRow = ({ task, actions }: { task: StudentTask; actions: TaskActions }) => {
  const Icon = KIND_ICON[task.kind];
  const { key, label } = taskStateOf(task);
  const active = needsAction(task);
  const done = key === "verified";

  /** 主要動作：每一列只給一個正向出口 */
  const primary = (() => {
    if (task.kind === "digital") {
      if (key === "verified")
        return (
          <Button variant="outline" size="sm" className="h-8" onClick={() => actions.onOpenDetail(task)}>
            查看結果
          </Button>
        );
      if (task.needsDetail && key === "none")
        return (
          <Button variant="outline" size="sm" className="h-8" onClick={() => actions.onOpenDetail(task)}>
            查看詳情
          </Button>
        );
      return (
        <Button
          size="sm"
          className="h-8 transition-shadow hover:shadow-button active:translate-y-px"
          onClick={() => actions.onOpenDigital(task)}
        >
          <Play className="h-3.5 w-3.5" />
          {key === "in_progress" ? "繼續" : "開始"}
        </Button>
      );
    }
    // 🛑 部分完成只有一個正向出口，沒有「先不補」
    if (key === "partial")
      return (
        <Button
          size="sm"
          className="h-8 transition-shadow hover:shadow-button active:translate-y-px"
          onClick={() => actions.onFollowUp(task.id)}
        >
          <RotateCw className="h-3.5 w-3.5" />
          我要補完
        </Button>
      );
    if (key === "followup")
      return (
        <Button size="sm" className="h-8" onClick={() => actions.onSubmitFollowUp(task.id)}>
          我補完了
        </Button>
      );
    if (key === "self" || key === "resubmitted")
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 text-muted-foreground"
          onClick={() => actions.onSelfReport(task.id)}
        >
          <Undo2 className="h-3.5 w-3.5" />
          取消
        </Button>
      );
    if (key === "verified" || key === "unchecked") return null;
    return (
      <Button variant="outline" size="sm" className="h-8" onClick={() => actions.onSelfReport(task.id)}>
        我完成了
      </Button>
    );
  })();

  return (
    <div
      className={[
        "flex flex-wrap items-start gap-3 rounded-lg border p-4 transition-all duration-200",
        active
          ? "bg-card border-border shadow-card hover:-translate-y-0.5 hover:shadow-lg"
          : done
            ? "bg-muted/25 border-border/50"
            : "bg-card/70 border-border/60",
      ].join(" ")}
    >
      <span className="w-5 flex justify-center pt-0.5 shrink-0">
        <Icon className={`h-4 w-4 ${active ? "text-secondary" : "text-muted-foreground"}`} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${done ? "text-foreground/70" : "text-foreground"}`}>
            {task.title}
          </p>
          <span className={TYPE.micro}>{TASK_KIND_LABEL[task.kind]}</span>
          {task.sourceName && <span className={TYPE.micro}>· {task.sourceName}</span>}
        </div>

        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <StateLine stateKey={key} label={label} />
          {task.score && key === "verified" && (
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {task.score.value} / {task.score.total}
            </span>
          )}
          {active && <span className={TYPE.micro}>· {task.dueLabel}前</span>}
          {task.estimateLabel && key === "none" && (
            <span className={TYPE.micro}>· {task.estimateLabel}</span>
          )}
        </div>

        {/* 老師的備註與待補範圍：只在有意義時出現 */}
        {key === "partial" && task.teacherCheck?.note && (
          <p className={`${TYPE.micro} mt-1.5`}>老師備註：{task.teacherCheck.note}</p>
        )}
        {key === "followup" && task.teacherCheck?.remaining && (
          <p className="text-xs text-foreground/80 mt-1.5">
            還需完成：<span className="font-medium">{task.teacherCheck.remaining}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        {task.kind === "external" && task.externalUrl && key !== "verified" && (
          <Button variant="ghost" size="sm" className="h-8 px-2.5" asChild>
            <a href={task.externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              開啟
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={() => actions.onOpenDetail(task)}
        >
          詳情
        </Button>
        {primary}
      </div>
    </div>
  );
};
