import { Compass } from "lucide-react";
import { SectionCard, StandingBadge, TrendIcon, Meter, MeterEmpty } from "./shared";
import type { DomainOverview } from "@/data/learn/parentDashboardMock";

/**
 * 英文能力總覽 —— 改成一列一項的 profile，
 * 六張同等大小的 KPI 卡會讓所有能力看起來一樣重要，這裡刻意不那樣做。
 */
export const AbilityOverview = ({ domains }: { domains: DomainOverview[] }) => {
  const measured = domains.filter((d) => d.value !== null) as (DomainOverview & { value: number })[];
  const bestKey = measured.reduce((a, b) => (b.value > a.value ? b : a)).key;
  const worstKey = measured.reduce((a, b) => (b.value < a.value ? b : a)).key;

  return (
    <SectionCard
      icon={Compass}
      title="英文能力總覽"
      description="六大能力的近期表現，老師評語另外呈現於最下方"
      className="mb-8"
    >
      <div className="divide-y divide-border">
        {domains.map((d) => {
          const tone = d.key === bestKey ? "strong" : d.key === worstKey ? "focus" : "neutral";
          const unmeasured = d.value === null;
          return (
            <div key={d.key} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3 md:gap-4">
                <span
                  className={`w-10 shrink-0 font-semibold ${
                    unmeasured ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {d.label}
                </span>
                <div className="flex-1 min-w-0">
                  {unmeasured ? <MeterEmpty /> : <Meter value={d.value!} tone={tone} />}
                </div>
                {unmeasured ? (
                  <span className="w-16 shrink-0 text-right text-lg text-muted-foreground">—</span>
                ) : (
                  <span className="w-16 shrink-0 flex items-center justify-end gap-1.5">
                    <TrendIcon trend={d.trend} />
                    <span className="text-lg font-bold text-foreground tabular-nums">
                      {d.value}
                    </span>
                  </span>
                )}
                <span className="hidden sm:block shrink-0 w-20 text-right">
                  <StandingBadge standing={d.standing} />
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 md:ml-14">
                <p className="text-xs text-muted-foreground min-w-0">{d.note}</p>
                <span className="sm:hidden shrink-0 ml-auto">
                  <StandingBadge standing={d.standing} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};
