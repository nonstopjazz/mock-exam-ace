import { BookMarked } from "lucide-react";
import { PanelCard, LeadLine, Meter } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/**
 * 單字：六個級距分成三個學習階段，讓「已經走到哪裡」本身變成故事，
 * 而不是六條長度不一的長條。四個累計數字降級成一行安靜的補充。
 */
export const VocabularySection = ({ data }: { data: ParentDashboardData["vocabulary"] }) => (
  <PanelCard icon={BookMarked} title="單字學習">
    <LeadLine>{data.summary}</LeadLine>

    <div className="space-y-5">
      {data.stages.map((st, i) => {
        const pct = Math.round((st.learned / st.total) * 100);
        return (
          <div key={st.label}>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-semibold text-foreground shrink-0">{st.label}</span>
                <span className="text-xs text-muted-foreground truncate">{st.range}</span>
              </div>
              <span className="text-sm text-muted-foreground tabular-nums shrink-0">
                {st.learned.toLocaleString()}
                <span className="text-xs"> / {st.total.toLocaleString()}</span>
              </span>
            </div>
            <Meter value={pct} tone={i === 0 ? "strong" : "neutral"} />
          </div>
        );
      })}
    </div>

    <div className="mt-6 pt-5 border-t border-border flex flex-wrap gap-x-6 gap-y-2">
      {[
        { label: "累積學過", value: data.stats.learned },
        { label: "已經穩定", value: data.stats.stable },
        { label: "複習中", value: data.stats.reviewing },
        { label: "本月新增", value: data.stats.newThisMonth },
      ].map((s) => (
        <div key={s.label} className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted-foreground">{s.label}</span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {s.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  </PanelCard>
);
