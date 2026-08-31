import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, LucideIcon, MinusCircle } from "lucide-react";
import { HOMEWORK_LABEL } from "@/data/learn/teacherSessionMock";
import type { ClassTask } from "@/data/learn/studentDashboardMock";

/* ---------- 版面 ---------- */

/**
 * 兩種份量：
 *   primary —— 待辦與練習（Action first）
 *   quiet   —— 進度、節奏、成績、回饋（analytics second）
 */
export const StudentSection = ({
  icon: Icon,
  title,
  hint,
  action,
  children,
  id,
  tone = "quiet",
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  tone?: "primary" | "quiet";
}) => (
  <Card
    id={id}
    className={`scroll-mt-24 ${tone === "primary" ? "p-6" : "p-5"}`}
  >
    <div className={`flex items-start justify-between gap-3 ${tone === "primary" ? "mb-5" : "mb-4"}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {tone === "primary" ? (
          <div className="p-2 rounded-lg bg-secondary/10 shrink-0">
            <Icon className="h-5 w-5 text-secondary" />
          </div>
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <h2 className={`${tone === "primary" ? "text-lg" : "text-base"} font-semibold text-foreground truncate`}>
            {title}
          </h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
    {children}
  </Card>
);

/* ---------- 完成語意 ---------- */

/**
 * 🛑 這是整個學生端最重要的一個區分。
 *    「我自己標記完成」和「老師已確認」在視覺上必須明顯不同，
 *    家長之後看到的完成度才不會被誤讀。
 */
export const TaskStatus = ({ task }: { task: ClassTask }) => {
  if (task.teacherCheck) {
    const { status, percent } = task.teacherCheck;
    if (status === "done") {
      return (
        <Badge variant="outline" className="gap-1 font-normal bg-success/10 text-success border-success/30">
          <CheckCircle2 className="h-3.5 w-3.5" />
          老師已確認完成
        </Badge>
      );
    }
    if (status === "partial") {
      return (
        <Badge variant="outline" className="gap-1 font-normal bg-warning/10 text-warning border-warning/30">
          <MinusCircle className="h-3.5 w-3.5" />
          老師檢查：{HOMEWORK_LABEL.partial} · {percent}%
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
        <Circle className="h-3.5 w-3.5" />
        老師檢查：尚未完成
      </Badge>
    );
  }

  if (task.kind === "digital" && task.autoCompleted) {
    return (
      <Badge variant="outline" className="gap-1 font-normal bg-success/10 text-success border-success/30">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已完成 · 平台記錄
      </Badge>
    );
  }

  if (task.studentReported) {
    // 刻意用虛線 + 時鐘：看起來就是「還沒有結論」
    return (
      <Badge
        variant="outline"
        className="gap-1 font-normal border-dashed bg-secondary/5 text-secondary border-secondary/40"
      >
        <Clock className="h-3.5 w-3.5" />
        已標記完成 · 待老師檢查
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <Circle className="h-3.5 w-3.5" />
      尚未完成
    </Badge>
  );
};

/** 四階等級指示條。刻意離散，不顯示百分比 */
export const LevelSteps = ({ step }: { step: number | null }) => (
  <div className="flex gap-1 shrink-0">
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
