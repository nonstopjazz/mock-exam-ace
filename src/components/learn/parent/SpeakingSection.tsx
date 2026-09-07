import { Mic } from "lucide-react";
import { PanelCard, LeadLine } from "./shared";
import { RadarPanel, MiniTrend } from "./RadarPanel";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/**
 * 口說：目前資料不足。
 * 🛑 UNMEASURED ≠ WEAK —— 不畫 0 分、不給假分數，
 *    改成說明「已經做了多少」與「之後會看到什麼」。
 */
export const SpeakingSection = ({ data }: { data: ParentDashboardData["speaking"] }) => (
  <PanelCard icon={Mic} title="口說表現">
    <LeadLine>{data.summary}</LeadLine>

    {!data.hasEnoughData ? (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <Mic className="h-12 w-12 text-muted-foreground/40 mx-auto" />
        <p className="font-semibold text-foreground mt-4">尚無足夠資料</p>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          目前已完成 {data.recordings.length} 次口說練習。
          <br className="hidden sm:block" />
          再累積幾次之後，這裡就會出現下面四個面向的完整分析。
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {data.categories.map((c) => (
            <span
              key={c.label}
              className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
        <div className="lg:col-span-3">
          <RadarPanel data={data.categories} color="hsl(var(--secondary))" />
        </div>
        <div className="lg:col-span-2">
          <MiniTrend data={data.recordings} label="近四次錄音表現" />
        </div>
      </div>
    )}
  </PanelCard>
);
