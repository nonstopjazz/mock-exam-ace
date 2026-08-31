import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SpellCheck2, ChevronRight, ThumbsUp, Target } from "lucide-react";
import { SectionCard, TrendIcon } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

export const GrammarSection = ({ data }: { data: ParentDashboardData["grammar"] }) => (
  <SectionCard
    icon={SpellCheck2}
    title="文法表現"
    action={
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
        <span className="hidden sm:inline">查看詳細分析</span>
        <ChevronRight className="h-4 w-4" />
      </Button>
    }
  >
    <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{data.summary}</p>

    <div className="rounded-lg bg-muted/40 p-4 mb-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm text-muted-foreground">{data.recentLabel}</span>
        <div className="flex items-baseline gap-2">
          <TrendIcon trend={data.trend} />
          <span className="text-3xl font-bold text-foreground tabular-nums">
            {data.recentScore}
          </span>
        </div>
      </div>
      <Progress value={data.recentScore} className="h-2 bg-muted" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ThumbsUp className="h-4 w-4 text-success shrink-0" />
          <p className="text-sm font-semibold text-foreground">目前強項</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.strengths.map((s) => (
            <Badge key={s} variant="outline" className="bg-success/10 text-success border-success/25">
              {s}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-accent shrink-0" />
          <p className="text-sm font-semibold text-foreground">優先加強</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.needsWork.map((s) => (
            <Badge key={s} variant="outline" className="bg-accent/10 text-accent border-accent/25">
              {s}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  </SectionCard>
);
