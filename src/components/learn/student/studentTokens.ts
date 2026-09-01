import { Check, CheckCheck, Circle, Clock, LucideIcon, PlayCircle, RotateCw, Triangle } from "lucide-react";

/* ---------- 完成狀態：全站一套 ----------
 * 🛑 顏色不是唯一的辨識方式 —— 每一種狀態都有專屬 icon 與文字。
 */
export type TaskStateKey =
  | "none"
  | "self"
  | "verified"
  | "partial"
  | "unchecked"
  /* Task Center 追加的三種；Dashboard 不使用，但共用同一套 icon / 色彩角色 */
  | "in_progress"
  | "followup"
  | "resubmitted";

export const TASK_STATE: Record<
  TaskStateKey,
  { icon: LucideIcon; className: string; label: string }
> = {
  none: { icon: Circle, className: "text-muted-foreground", label: "尚未完成" },
  unchecked: { icon: Circle, className: "text-muted-foreground", label: "老師檢查：尚未完成" },
  self: { icon: Clock, className: "text-secondary", label: "我已完成 · 待老師確認" },
  verified: { icon: Check, className: "text-success", label: "老師已確認" },
  partial: { icon: Triangle, className: "text-warning", label: "老師檢查" },
  in_progress: { icon: PlayCircle, className: "text-primary", label: "進行中" },
  followup: { icon: RotateCw, className: "text-warning", label: "準備補完" },
  resubmitted: { icon: CheckCheck, className: "text-secondary", label: "我已補完 · 待老師再次確認" },
};
