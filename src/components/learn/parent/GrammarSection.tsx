import { Button } from "@/components/ui/button";
import { SpellCheck2, ChevronRight } from "lucide-react";
import { PanelCard, LeadLine, Meter, TrendIcon } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/** 文法：強項 / 優先加強兩欄語意分組，用左側細線分色，不再靠一堆彩色 badge */
export const GrammarSection = ({ data }: { data: ParentDashboardData["grammar"] }) => (
  <PanelCard
    icon={SpellCheck2}
    title="文法表現"
    action={
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
        <span className="hidden sm:inline">查看詳細分析</span>
        <ChevronRight className="h-4 w-4" />
      </Button>
    }
  >
    <LeadLine>{data.summary}</LeadLine>

    <div className="flex items-baseline justify-between gap-2 mb-1.5">
      <span className="text-sm text-muted-foreground truncate">{data.recentLabel}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <TrendIcon trend={data.trend} />
        <span className="text-xl font-bold text-foreground tabular-nums">{data.recentScore}</span>
      </span>
    </div>
    <Meter value={data.recentScore} />

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
      <div className="border-l-2 border-secondary/40 pl-4">
        <p className="text-xs text-muted-foreground mb-2">目前強項</p>
        <ul className="space-y-1.5">
          {data.strengths.map((s) => (
            <li key={s} className="text-sm text-foreground leading-snug">{s}</li>
          ))}
        </ul>
      </div>
      <div className="border-l-2 border-accent/50 pl-4">
        <p className="text-xs text-muted-foreground mb-2">優先加強</p>
        <ul className="space-y-1.5">
          {data.needsWork.map((s) => (
            <li key={s} className="text-sm text-foreground leading-snug">{s}</li>
          ))}
        </ul>
      </div>
    </div>
  </PanelCard>
);
