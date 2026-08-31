import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Compass } from "lucide-react";
import { SectionCard, StandingBadge, TrendIcon } from "./shared";
import type { DomainOverview } from "@/data/learn/parentDashboardMock";

export const AbilityOverview = ({ domains }: { domains: DomainOverview[] }) => (
  <SectionCard
    icon={Compass}
    title="英文能力總覽"
    description="六大能力的近期表現，老師評語另外呈現於最下方"
    className="mb-8"
  >
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {domains.map((d) => (
        <Card key={d.key} className="p-4 bg-muted/30">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="font-semibold text-foreground truncate">{d.label}</span>
            <StandingBadge standing={d.standing} />
          </div>
          {d.value === null ? (
            <p className="text-sm text-muted-foreground">
              累積更多練習後就會顯示
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-bold text-foreground tabular-nums">{d.value}</span>
                <TrendIcon trend={d.trend} />
              </div>
              <Progress value={d.value} className="h-2 bg-muted" />
            </>
          )}
        </Card>
      ))}
    </div>
  </SectionCard>
);
