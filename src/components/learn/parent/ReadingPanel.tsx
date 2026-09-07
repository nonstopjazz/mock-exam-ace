import { BookOpen } from "lucide-react";
import { PanelCard, LeadLine, ScoreBar } from "./shared";
import { toneMap } from "./tone";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/** 閱讀：六個細項用完整長條呈現，並把最穩／最需加強先挑出來講 */
export const ReadingPanel = ({ data }: { data: ParentDashboardData["reading"] }) => {
  const tones = toneMap(data.categories);
  const measured = data.categories.filter(
    (c): c is { label: string; value: number } => c.value !== null
  );
  const best = measured.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = measured.reduce((a, b) => (b.value < a.value ? b : a));

  return (
    <PanelCard icon={BookOpen} title="閱讀分析">
      <LeadLine>{data.summary}</LeadLine>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-lg bg-secondary/5 border border-secondary/20 p-3">
          <p className="text-xs text-muted-foreground mb-0.5">表現最穩</p>
          <p className="font-semibold text-foreground truncate">
            {best.label}
            <span className="ml-1.5 text-secondary tabular-nums">{best.value}</span>
          </p>
        </div>
        <div className="rounded-lg bg-accent/5 border border-accent/20 p-3">
          <p className="text-xs text-muted-foreground mb-0.5">優先加強</p>
          <p className="font-semibold text-foreground truncate">
            {worst.label}
            <span className="ml-1.5 text-accent tabular-nums">{worst.value}</span>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {data.categories.map((c) => (
          <ScoreBar key={c.label} item={c} tone={tones[c.label]} />
        ))}
      </div>
    </PanelCard>
  );
};
