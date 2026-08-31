import { Mic } from "lucide-react";
import { SectionCard, InsufficientData } from "./shared";
import { RadarPanel, MiniTrend } from "./RadarPanel";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

export const SpeakingSection = ({ data }: { data: ParentDashboardData["speaking"] }) => (
  <SectionCard icon={Mic} title="口說表現">
    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{data.summary}</p>

    {!data.hasEnoughData ? (
      <InsufficientData hint="等口說練習累積到一定次數，這裡就會出現完整分析" />
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RadarPanel data={data.categories} color="hsl(var(--accent))" />
        <MiniTrend data={data.recordings} label="近四次錄音表現" />
      </div>
    )}
  </SectionCard>
);
