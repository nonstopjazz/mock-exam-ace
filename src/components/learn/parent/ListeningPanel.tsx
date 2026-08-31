import { Headphones } from "lucide-react";
import { PanelCard, LeadLine, Meter, MeterEmpty, TrendIcon } from "./shared";
import { toneMap } from "./tone";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/** 聽力只有四個面向：用 2×2 的緊湊格子，刻意和閱讀的長條列表不同形 */
export const ListeningPanel = ({ data }: { data: ParentDashboardData["listening"] }) => {
  const tones = toneMap(data.categories);

  return (
    <PanelCard icon={Headphones} title="聽力分析">
      <LeadLine>{data.summary}</LeadLine>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {data.categories.map((c) => (
          <div key={c.label} className="min-w-0">
            <p className="text-sm text-muted-foreground truncate mb-1">{c.label}</p>
            {c.value === null ? (
              <>
                {/* 🛑 未測得不等於分數低：不畫 0 分 */}
                <p className="text-sm text-muted-foreground mb-2">尚無足夠資料</p>
                <MeterEmpty />
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-bold text-foreground tabular-nums">{c.value}</span>
                  <TrendIcon trend={c.trend} />
                  {c.note && (
                    <span className="text-xs text-accent truncate">{c.note}</span>
                  )}
                </div>
                <Meter value={c.value} tone={tones[c.label]} />
              </>
            )}
          </div>
        ))}
      </div>
    </PanelCard>
  );
};
