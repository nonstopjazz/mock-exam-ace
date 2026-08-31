import { Card } from "@/components/ui/card";
import { ArrowUpRight, CheckCircle2, Target, Flag } from "lucide-react";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/** 家長最先看到的一區：四句結論，不是圖表 */
export const MonthlySummary = ({ data }: { data: ParentDashboardData["monthlySummary"] }) => {
  const items = [
    { ...data.improved, icon: ArrowUpRight, tint: "from-success/10 to-secondary/10 border-success/20", iconClass: "text-success" },
    { ...data.stable, icon: CheckCircle2, tint: "from-secondary/10 to-explorer/10 border-secondary/20", iconClass: "text-secondary" },
    { ...data.focus, icon: Target, tint: "from-accent/10 to-treasure/10 border-accent/20", iconClass: "text-accent" },
    { ...data.nextStep, icon: Flag, tint: "from-primary/10 to-accent/10 border-primary/20", iconClass: "text-primary" },
  ];

  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-xl font-semibold text-foreground">{data.monthLabel}學習總結</h2>
        <span className="text-sm text-muted-foreground">四件事看懂這個月</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.title}
              className={`p-6 bg-gradient-to-br ${item.tint} transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`h-5 w-5 shrink-0 ${item.iconClass}`} />
                <h3 className="font-semibold text-foreground">{item.title}</h3>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{item.body}</p>
              <p className="text-xs text-muted-foreground mt-3">{item.detail}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
