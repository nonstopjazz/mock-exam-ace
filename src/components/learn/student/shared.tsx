import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import type { ClassTask, CompletionSource } from "@/data/learn/studentDashboardMock";
import { TASK_STATE, taskStateOf } from "./studentTokens";

/* ---------- Surface hierarchy ----------
 * 品牌色不動；層次靠 elevation + border 濃度做，讓整頁不再是一片奶油色。
 *   raised —— 需要動作的（Hero、Today、字卡）
 *   base   —— 摘要（學習狀況、節奏）
 *   quiet  —— 底部次要資訊
 */
export const SURFACE = {
  raised: "bg-card border-border shadow-card",
  base: "bg-card border-border/70",
  quiet: "bg-card/70 border-border/60",
} as const;

/* ---------- Typography scale ----------
 * 集中定義，避免整頁都是 14px medium。
 */
export const TYPE = {
  sectionHeading: "text-lg font-semibold text-foreground tracking-tight",
  cardTitle: "text-base font-semibold text-foreground",
  actionMeta: "text-sm text-muted-foreground",
  body: "text-sm text-foreground/85 leading-relaxed",
  status: "text-xs font-medium",
  micro: "text-[11px] text-muted-foreground",
} as const;

/** 區塊標題列：標題左、次要資訊右，整頁共用同一種節奏 */
export const SectionHead = ({
  title,
  aside,
}: {
  title: string;
  aside?: ReactNode;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
    <h2 className={TYPE.sectionHeading}>{title}</h2>
    {aside && <div className="flex items-center gap-2 shrink-0">{aside}</div>}
  </div>
);

/** 次要面板：底部那一對用 */
export const QuietPanel = ({
  icon: Icon,
  title,
  aside,
  children,
  id,
}: {
  icon: LucideIcon;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
}) => (
  <Card id={id} className={`p-5 ${SURFACE.quiet}`}>
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className={TYPE.cardTitle}>{title}</h2>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
    {children}
  </Card>
);

/* ---------- 完成狀態：全站一套 ----------
 * 🛑 顏色不是唯一的辨識方式 —— 每一種狀態都有專屬 icon 與文字。
 */
export const TaskState = ({ task }: { task: ClassTask }) => {
  const { key, label } = taskStateOf(task);
  const S = TASK_STATE[key];
  const Icon = S.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${TYPE.status} ${S.className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
};

/** 練習完成狀態沿用同一組 icon / 色彩角色 */
export const PracticeDone = ({ source }: { source: CompletionSource | null }) => {
  const S = source === "self" ? TASK_STATE.self : TASK_STATE.verified;
  const Icon = S.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${TYPE.status} ${S.className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {source === "self" ? "已標記完成" : "已完成"}
    </span>
  );
};

/** 四階等級指示條。刻意離散，不顯示百分比 */
export const LevelSteps = ({ step }: { step: number | null }) => (
  <div className="flex gap-1 shrink-0" aria-hidden>
    {[1, 2, 3, 4].map((i) =>
      step === null ? (
        <span key={i} className="h-1.5 w-6 rounded-full border border-dashed border-border" />
      ) : (
        <span
          key={i}
          className={`h-1.5 w-6 rounded-full ${i <= step ? "bg-secondary" : "bg-muted"}`}
        />
      ),
    )}
  </div>
);
