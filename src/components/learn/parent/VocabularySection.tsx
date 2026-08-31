import { Progress } from "@/components/ui/progress";
import { BookMarked } from "lucide-react";
import { SectionCard } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

export const VocabularySection = ({ data }: { data: ParentDashboardData["vocabulary"] }) => (
  <SectionCard icon={BookMarked} title="單字學習">
    <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{data.summary}</p>

    <div className="space-y-4">
      {data.levels.map((lv) => {
        const pct = Math.round((lv.learned / lv.total) * 100);
        return (
          <div key={lv.label} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground shrink-0">{lv.label}</span>
              <span className="text-muted-foreground tabular-nums text-xs">
                {lv.learned.toLocaleString()} / {lv.total.toLocaleString()}
              </span>
            </div>
            <Progress value={pct} className="h-2 bg-muted" />
          </div>
        );
      })}
    </div>

    <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-border">
      {[
        { label: "累積學過", value: data.stats.learned.toLocaleString() },
        { label: "已經穩定", value: data.stats.stable.toLocaleString() },
        { label: "複習中", value: data.stats.reviewing.toLocaleString() },
        { label: "本月新增", value: data.stats.newThisMonth.toLocaleString() },
      ].map((s) => (
        <div key={s.label} className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{s.value}</p>
        </div>
      ))}
    </div>
  </SectionCard>
);
