import { PenTool, MessageSquareQuote } from "lucide-react";
import { PanelCard, LeadLine } from "./shared";
import { RadarPanel, MiniTrend } from "./RadarPanel";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/**
 * 寫作：雷達圖是這一區的主角，放大並吃掉大部分寬度；
 * 趨勢 → 診斷 → 值得肯定，依重要性往下遞減。
 */
export const WritingSection = ({ data }: { data: ParentDashboardData["writing"] }) => {
  const maxError = Math.max(...data.commonErrors.map((e) => e.count), 1);

  return (
    <PanelCard icon={PenTool} title="寫作表現">
      <LeadLine>{data.summary}</LeadLine>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
        <div className="lg:col-span-3">
          <RadarPanel data={data.categories} color="hsl(var(--secondary))" />
        </div>
        <div className="lg:col-span-2">
          <MiniTrend data={data.trend} label="近四個月整體表現" />
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">最常出現的問題</p>
        <div className="space-y-2">
          {data.commonErrors.map((e, i) => (
            <div key={e.label} className="flex items-center gap-3">
              <span className="text-sm text-foreground w-20 shrink-0 truncate">{e.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                {/* 只有最常出現的那一項用強調色，其餘保持中性 */}
                <div
                  className={`h-full rounded-full ${i === 0 ? "bg-accent" : "bg-muted-foreground/35"}`}
                  style={{ width: `${(e.count / maxError) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right shrink-0">
                {e.count} 次
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <p className="text-xs text-muted-foreground mb-2">值得肯定的地方</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {data.highlights.map((h) => (
              <span key={h} className="text-sm text-foreground">· {h}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3 border-t border-border pt-5">
        <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-foreground/80 leading-relaxed">{data.teacherNote}</p>
      </div>
    </PanelCard>
  );
};
