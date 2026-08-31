import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ScoreItem, Standing, Trend } from "@/data/learn/parentDashboardMock";

/** 區塊外框：標題列（染色圖示 + 標題 + 說明）＋ 內容 */
export const SectionCard = ({
  icon: Icon,
  title,
  description,
  action,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <Card className={`p-6 ${className}`}>
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-secondary/10 shrink-0">
          <Icon className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground truncate">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    {children}
  </Card>
);

/** 進步 / 穩定 / 需加強 —— 家長語言，不使用內部代碼 */
export const StandingBadge = ({ standing }: { standing: Standing | null }) => {
  if (!standing) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        尚無足夠資料
      </Badge>
    );
  }
  const map = {
    improving: { text: "進步中", className: "bg-success/15 text-success border-success/25" },
    stable: { text: "穩定", className: "bg-secondary/15 text-secondary border-secondary/25" },
    focus: { text: "需加強", className: "bg-accent/15 text-accent border-accent/25" },
  } as const;
  const s = map[standing];
  return <Badge variant="outline" className={`text-xs ${s.className}`}>{s.text}</Badge>;
};

export const TrendIcon = ({ trend }: { trend?: Trend }) => {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-success shrink-0" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-accent shrink-0" />;
  return <Minus className="h-4 w-4 text-muted-foreground shrink-0" />;
};

/** 尚無足夠資料 —— 絕不顯示 0 分 */
export const InsufficientData = ({ hint }: { hint?: string }) => (
  <div className="text-center py-10 text-muted-foreground">
    <p>尚無足夠資料</p>
    {hint && <p className="text-sm mt-2">{hint}</p>}
  </div>
);

/** 一列能力：名稱 + 進度條 + 分數 + 趨勢 */
export const ScoreBar = ({ item }: { item: ScoreItem }) => {
  if (item.value === null) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-foreground min-w-0 truncate">{item.label}</span>
          <span className="text-xs text-muted-foreground shrink-0">尚無足夠資料</span>
        </div>
        <Progress value={0} className="h-2 bg-muted opacity-60" />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-foreground min-w-0 truncate">{item.label}</span>
        <span className="flex items-center gap-2 shrink-0">
          {item.note && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{item.note}</span>
          )}
          <TrendIcon trend={item.trend} />
          <span className="font-semibold text-foreground tabular-nums w-8 text-right">
            {item.value}
          </span>
        </span>
      </div>
      <Progress value={item.value} className="h-2 bg-muted" />
    </div>
  );
};
