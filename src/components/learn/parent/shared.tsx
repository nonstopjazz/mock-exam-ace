import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ScoreItem, Standing, Trend } from "@/data/learn/parentDashboardMock";

/**
 * 視覺節奏：大（Hero / 本月總結）→ 中（SectionCard）→ 小（PanelCard）。
 * 顏色分工：primary = 人與行動、secondary = 表現最穩定、accent = 優先加強、
 * 其餘一律中性灰。不靠增加顏色製造層級。
 */

/* ---------- Meter：可分色的細長條，取代到處都是橘色的 Progress ---------- */

export type MeterTone = "neutral" | "strong" | "focus";

const meterFill: Record<MeterTone, string> = {
  neutral: "bg-muted-foreground/45",
  strong: "bg-secondary",
  focus: "bg-accent",
};

export const Meter = ({
  value,
  tone = "neutral",
  className = "",
}: {
  value: number;
  tone?: MeterTone;
  className?: string;
}) => (
  <div className={`h-1.5 w-full rounded-full bg-muted overflow-hidden ${className}`}>
    <div
      className={`h-full rounded-full transition-all duration-500 ${meterFill[tone]}`}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

/** 尚未測得的能力：虛線軌道，永遠不畫 0 分的實心條 */
export const MeterEmpty = ({ className = "" }: { className?: string }) => (
  <div className={`h-1.5 w-full rounded-full border border-dashed border-border ${className}`} />
);

/* ---------- 版面層級 ---------- */

/** 小標題列：把下半部的細部分析收成一組，而不是一堆等重的卡片 */
export const SectionHeading = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex items-baseline gap-3 mb-4">
    <h2 className="text-xl font-semibold text-foreground shrink-0">{title}</h2>
    {hint && <p className="text-sm text-muted-foreground min-w-0 truncate">{hint}</p>}
  </div>
);

/** 中層區塊：染色圖示 + 標題 + 說明 */
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
  <Card className={`p-6 md:p-8 ${className}`}>
    <div className="flex items-start justify-between gap-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 rounded-lg bg-secondary/10 shrink-0">
          <Icon className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground truncate">{title}</h2>
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

/** 小層區塊：安靜的細部分析卡，刻意比 SectionCard 輕 */
export const PanelCard = ({
  icon: Icon,
  title,
  action,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <Card className={`p-6 ${className}`}>
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <h3 className="text-base font-semibold text-foreground truncate">{title}</h3>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    {children}
  </Card>
);

/** 區塊開頭的一句解讀，家長先讀到結論再看數字 */
export const LeadLine = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-foreground/80 leading-relaxed mb-5">{children}</p>
);

/* ---------- 狀態 ---------- */

/** 進步 / 穩定 / 需加強 —— 家長語言，不使用內部代碼 */
export const StandingBadge = ({ standing }: { standing: Standing | null }) => {
  if (!standing) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
        尚無足夠資料
      </Badge>
    );
  }
  const map = {
    improving: { text: "進步中", className: "bg-success/10 text-success border-success/20" },
    stable: { text: "穩定", className: "bg-muted text-muted-foreground border-border" },
    focus: { text: "優先加強", className: "bg-accent/10 text-accent border-accent/20" },
  } as const;
  const s = map[standing];
  return <Badge variant="outline" className={`text-xs font-normal ${s.className}`}>{s.text}</Badge>;
};

export const TrendIcon = ({ trend }: { trend?: Trend }) => {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-success shrink-0" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-accent shrink-0" />;
  return <Minus className="h-4 w-4 text-muted-foreground/60 shrink-0" />;
};

/** 一列能力：名稱 + 分數 + Meter。tone 由呼叫端決定，預設中性 */
export const ScoreBar = ({
  item,
  tone = "neutral",
}: {
  item: ScoreItem;
  tone?: MeterTone;
}) => {
  if (item.value === null) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground min-w-0 truncate">{item.label}</span>
          <span className="text-xs text-muted-foreground shrink-0">尚無足夠資料</span>
        </div>
        <MeterEmpty />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-foreground min-w-0 truncate">{item.label}</span>
        <span className="flex items-center gap-2 shrink-0">
          {item.note && (
            <span
              className={`text-xs hidden sm:inline ${
                tone === "focus" ? "text-accent" : "text-muted-foreground"
              }`}
            >
              {item.note}
            </span>
          )}
          <TrendIcon trend={item.trend} />
          <span className="font-semibold text-foreground tabular-nums w-8 text-right">
            {item.value}
          </span>
        </span>
      </div>
      <Meter value={item.value} tone={tone} />
    </div>
  );
};
