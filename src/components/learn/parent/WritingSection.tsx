import { Badge } from "@/components/ui/badge";
import { PenTool, MessageSquareQuote } from "lucide-react";
import { SectionCard } from "./shared";
import { RadarPanel, MiniTrend } from "./RadarPanel";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

export const WritingSection = ({ data }: { data: ParentDashboardData["writing"] }) => (
  <SectionCard icon={PenTool} title="寫作表現">
    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{data.summary}</p>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <RadarPanel data={data.categories} color="hsl(var(--secondary))" />
      <MiniTrend data={data.trend} label="近四個月整體表現" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-border">
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">最常出現的問題</p>
        <div className="flex flex-wrap gap-2">
          {data.commonErrors.map((e) => (
            <Badge key={e.label} variant="outline" className="bg-accent/10 text-accent border-accent/25">
              {e.label} · {e.count}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">值得肯定的地方</p>
        <div className="flex flex-wrap gap-2">
          {data.highlights.map((h) => (
            <Badge key={h} variant="outline" className="bg-success/10 text-success border-success/25">
              {h}
            </Badge>
          ))}
        </div>
      </div>
    </div>

    <div className="mt-6 flex gap-3 rounded-lg bg-muted/40 p-4">
      <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <p className="text-sm text-muted-foreground leading-relaxed">{data.teacherNote}</p>
    </div>
  </SectionCard>
);
