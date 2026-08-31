import { LucideIcon } from "lucide-react";
import { SectionCard, ScoreBar } from "./shared";
import type { ScoreItem } from "@/data/learn/parentDashboardMock";

/** Reading / Listening 共用：水平長條 + 趨勢 */
export const DomainBars = ({
  icon,
  title,
  summary,
  categories,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  categories: ScoreItem[];
}) => (
  <SectionCard icon={icon} title={title}>
    <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{summary}</p>
    <div className="space-y-4">
      {categories.map((c) => (
        <ScoreBar key={c.label} item={c} />
      ))}
    </div>
  </SectionCard>
);
