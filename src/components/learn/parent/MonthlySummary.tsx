import { Card } from "@/components/ui/card";
import { ArrowUpRight, CheckCircle2, Target, Flag } from "lucide-react";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/**
 * 本月解讀 —— 一塊有結構的敘述，而不是四張等重的卡片。
 * 三則觀察用分隔線串起來，「老師下一步」刻意做得比較重。
 */
export const MonthlySummary = ({ data }: { data: ParentDashboardData["monthlySummary"] }) => {
  const insights = [
    { ...data.improved, icon: ArrowUpRight, iconClass: "text-success" },
    { ...data.stable, icon: CheckCircle2, iconClass: "text-muted-foreground" },
    { ...data.focus, icon: Target, iconClass: "text-accent" },
  ];

  return (
    <Card className="p-6 md:p-8 mb-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">本月解讀</p>
        <h2 className="text-2xl font-bold text-foreground">
          {data.monthLabel}的學習，三件事看懂
        </h2>
      </div>

      <div className="divide-y divide-border">
        {insights.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex gap-4 py-4 first:pt-0">
              <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${item.iconClass}`} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">{item.title}</p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {item.detail}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed mt-1">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 下一步：這一頁唯一需要家長「知道接下來會發生什麼」的地方 */}
      <div className="mt-6 flex gap-4 rounded-lg bg-primary/5 border border-primary/20 p-4 md:p-5">
        <Flag className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <p className="font-semibold text-foreground">{data.nextStep.title}</p>
            <span className="text-xs text-muted-foreground">{data.nextStep.detail}</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{data.nextStep.body}</p>
        </div>
      </div>
    </Card>
  );
};
