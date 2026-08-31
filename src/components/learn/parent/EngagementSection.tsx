import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, CalendarCheck, ClipboardCheck, Flame } from "lucide-react";
import { SectionCard } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

const heatLevel = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

export const EngagementSection = ({ data }: { data: ParentDashboardData["engagement"] }) => {
  const maxWeek = Math.max(...data.weeklyTrend.map((w) => w.value));

  return (
    <section className="mb-8">
      {/* 四個數字 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {[
          { icon: CalendarCheck, label: "出席率", value: `${data.attendanceRate}%`, sub: data.attendanceLabel },
          { icon: ClipboardCheck, label: "作業完成", value: `${data.homeworkRate}%`, sub: data.homeworkLabel },
          { icon: Activity, label: "線上練習", value: `${data.practiceCount}`, sub: data.practiceLabel },
          { icon: Flame, label: "學習天數", value: `${data.activeDays}`, sub: `本月 ${data.activeDaysTotal} 天中` },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4 md:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5 text-secondary shrink-0" />
                <p className="text-sm text-muted-foreground truncate">{s.label}</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{s.sub}</p>
            </Card>
          );
        })}
      </div>

      <SectionCard
        icon={Activity}
        title="最近的學習狀況"
        description="每一格代表一天，顏色越深表示當天練習越多"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* 熱力圖 */}
          <div>
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
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">每週練習量</p>
            {data.weeklyTrend.map((w) => (
              <div key={w.week} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 shrink-0">{w.week}</span>
                <Progress value={(w.value / maxWeek) * 100} className="h-2 bg-muted" />
                <span className="text-xs text-foreground tabular-nums w-8 text-right shrink-0">
                  {w.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </section>
  );
};
