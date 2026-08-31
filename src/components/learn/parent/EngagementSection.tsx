import { Activity, CalendarCheck, ClipboardCheck, Flame } from "lucide-react";
import { SectionCard, Meter } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/** 熱力圖改用 teal，把暖橘留給「人與行動」 */
const heatLevel = [
  "bg-muted",
  "bg-secondary/20",
  "bg-secondary/40",
  "bg-secondary/65",
  "bg-secondary",
];

export const EngagementSection = ({ data }: { data: ParentDashboardData["engagement"] }) => {
  const maxWeek = Math.max(...data.weeklyTrend.map((w) => w.value));
  const lastWeek = data.weeklyTrend[data.weeklyTrend.length - 1];

  const kpis = [
    { icon: CalendarCheck, label: "出席率", value: `${data.attendanceRate}%`, sub: data.attendanceLabel },
    { icon: ClipboardCheck, label: "作業完成", value: `${data.homeworkRate}%`, sub: data.homeworkLabel },
    { icon: Activity, label: "線上練習", value: `${data.practiceCount}`, sub: data.practiceLabel },
    { icon: Flame, label: "學習天數", value: `${data.activeDays}`, sub: `本月 ${data.activeDaysTotal} 天中` },
  ];

  return (
    <SectionCard
      icon={Activity}
      title="學習投入"
      description="出席、作業與練習的實際狀況"
      className="mb-8"
    >
      {/* 四個數字合成一組，不再是四張各自為政的卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-6">
        {kpis.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={`min-w-0 ${i > 0 ? "lg:border-l lg:border-border lg:pl-6" : ""}`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{s.label}</p>
              </div>
              <p className="text-3xl font-bold text-foreground tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{s.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-6 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
        {/* 熱力圖 */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">最近 30 天</p>
          <p className="text-xs text-muted-foreground mb-3">
            每一格代表一天，顏色越深表示當天練習越多
          </p>
          <div className="grid grid-cols-10 gap-1.5 max-w-xs">
            {data.heatmap.map((d) => (
              <div
                key={d.date}
                title={d.date}
                className={`aspect-square rounded-sm ${heatLevel[d.level]}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
            <span>少</span>
            {heatLevel.map((c, i) => (
              <span key={i} className={`h-3 w-3 rounded-sm ${c}`} />
            ))}
            <span>多</span>
          </div>
        </div>

        {/* 每週趨勢 */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">每週練習量</p>
          <p className="text-xs text-muted-foreground mb-3">
            四週以來持續增加，最近一週 {lastWeek.value} 題
          </p>
          <div className="space-y-3">
            {data.weeklyTrend.map((w) => (
              <div key={w.week} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 shrink-0">{w.week}</span>
                <Meter
                  value={(w.value / maxWeek) * 100}
                  tone={w.week === lastWeek.week ? "strong" : "neutral"}
                />
                <span className="text-xs text-foreground tabular-nums w-8 text-right shrink-0">
                  {w.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
