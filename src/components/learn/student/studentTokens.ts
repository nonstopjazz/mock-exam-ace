import { Check, Circle, Clock, LucideIcon, Triangle } from "lucide-react";
import type { ClassTask } from "@/data/learn/studentDashboardMock";

/* ---------- 完成狀態：全站一套 ----------
 * 🛑 顏色不是唯一的辨識方式 —— 每一種狀態都有專屬 icon 與文字。
 */
export type TaskStateKey = "none" | "self" | "verified" | "partial" | "unchecked";

export const TASK_STATE: Record<
  TaskStateKey,
  { icon: LucideIcon; className: string; label: string }
> = {
  none: { icon: Circle, className: "text-muted-foreground", label: "尚未完成" },
  unchecked: { icon: Circle, className: "text-muted-foreground", label: "老師檢查：尚未完成" },
  self: { icon: Clock, className: "text-secondary", label: "我已完成 · 待老師確認" },
  verified: { icon: Check, className: "text-success", label: "老師已確認" },
  partial: { icon: Triangle, className: "text-warning", label: "老師檢查" },
};

export const taskStateOf = (task: ClassTask): { key: TaskStateKey; label: string } => {
  if (task.teacherCheck) {
    const { status, percent } = task.teacherCheck;
    if (status === "done") return { key: "verified", label: TASK_STATE.verified.label };
    if (status === "partial")
      return { key: "partial", label: `${TASK_STATE.partial.label}：完成 ${percent}%` };
    return { key: "unchecked", label: TASK_STATE.unchecked.label };
  }
  if (task.kind === "digital" && task.autoCompleted)
    return { key: "verified", label: "已完成 · 平台記錄" };
  if (task.studentReported) return { key: "self", label: TASK_STATE.self.label };
  return { key: "none", label: TASK_STATE.none.label };
};

