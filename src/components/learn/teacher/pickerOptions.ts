import {
  HOMEWORK_LABEL, RATING_LABEL, RATING_ORDER,
  type HomeworkStatus, type SkillRating,
} from "@/data/learn/teacherSessionMock";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** 被選中時的樣式 */
  activeClass: string;
  /** 「沒有資料」這類選項用虛線邊框，和真正的等級區隔開 */
  dashed?: boolean;
}

export const RATING_ACTIVE: Record<SkillRating, string> = {
  strong: "bg-success/10 text-success border-success/30",
  solid: "bg-secondary/10 text-secondary border-secondary/30",
  developing: "bg-muted text-foreground border-border",
  needs_support: "bg-accent/10 text-accent border-accent/30",
  // 🛑 未觀察不是第五個等級，用虛線與中性色和其他四項區隔
  not_observed: "bg-transparent text-muted-foreground border-border border-dashed",
};

export const ratingOptions: SegmentOption<SkillRating>[] = RATING_ORDER.map((r) => ({
  value: r,
  label: RATING_LABEL[r],
  activeClass: RATING_ACTIVE[r],
  dashed: r === "not_observed",
}));

const HOMEWORK_ACTIVE: Record<HomeworkStatus, string> = {
  done: "bg-success/10 text-success border-success/30",
  partial: "bg-warning/10 text-warning border-warning/30",
  not_done: "bg-muted text-foreground border-border",
};

export const homeworkOptions: SegmentOption<HomeworkStatus>[] = (
  ["done", "partial", "not_done"] as HomeworkStatus[]
).map((s) => ({ value: s, label: HOMEWORK_LABEL[s], activeClass: HOMEWORK_ACTIVE[s] }));

/** compact 列表用：只上文字色，比 badge 輕 */
export const RATING_TEXT: Record<SkillRating, string> = {
  strong: "text-success",
  solid: "text-secondary",
  developing: "text-foreground",
  needs_support: "text-accent",
  not_observed: "text-muted-foreground",
};
