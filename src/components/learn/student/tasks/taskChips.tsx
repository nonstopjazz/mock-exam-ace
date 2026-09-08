import { Badge } from "@/components/ui/badge";
import { homeworkState, isOverdue, type StudentHomework } from "@/lib/learn/tasks";
import type { TaskStateKey } from "../studentTokens";

/**
 * 狀態徽章 —— 低飽和的淡底 + 同色描邊，文字一律用文字色。
 *
 * 🛑 顏色不是唯一線索：每一種狀態都有自己的文字，色盲或黑白列印一樣讀得出來。
 */
const TONE: Record<TaskStateKey, string> = {
  none: "bg-transparent border-border text-muted-foreground",
  unchecked: "bg-destructive/10 border-destructive/25 text-foreground",
  self: "bg-secondary/12 border-secondary/30 text-foreground",
  verified: "bg-success/12 border-success/30 text-foreground",
  partial: "bg-primary/12 border-primary/28 text-foreground",
  in_progress: "bg-primary/12 border-primary/28 text-foreground",
  followup: "bg-primary/12 border-primary/28 text-foreground",
  resubmitted: "bg-secondary/12 border-secondary/30 text-foreground",
};

/** 學生看的說法比 TASK_STATE.label 再短一點——徽章不是句子。 */
const SHORT: Partial<Record<TaskStateKey, string>> = {
  self: "待老師確認",
  verified: "老師已確認",
  unchecked: "老師檢查：尚未完成",
};

export const TaskStateChip = ({ hw }: { hw: StudentHomework }) => {
  const state = homeworkState(hw);
  return (
    <Badge variant="outline" className={`text-xs font-normal shrink-0 ${TONE[state.key]}`}>
      {SHORT[state.key] ?? state.label}
    </Badge>
  );
};

/** 班級是分類不是狀態，所以永遠是中性的羊皮紙灰。 */
export const ClassChip = ({ name }: { name: string }) => (
  <Badge
    variant="outline"
    className="text-xs font-normal border-transparent bg-muted text-muted-foreground max-w-[16rem] truncate"
  >
    {name}
  </Badge>
);

/** 逾期只在還需要處理時才算逾期，判斷交給 isOverdue()。 */
export const OverdueChip = ({ hw, today }: { hw: StudentHomework; today: string }) => {
  if (!isOverdue(hw, today)) return null;
  return (
    <Badge
      variant="outline"
      className="text-xs font-normal shrink-0 bg-destructive/10 border-destructive/25 text-foreground"
    >
      已逾期
    </Badge>
  );
};
