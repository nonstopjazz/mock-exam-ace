import { ClipboardCheck } from "lucide-react";
import { SourceBadge } from "@/components/learn/teacher/shared";
import { QuietPanel, TYPE } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/** 近期評量 —— 刻意比上面的待辦與練習輕 */
export const RecentResults = ({ sd }: { sd: StudentDashboard }) => (
  <QuietPanel icon={ClipboardCheck} title="最近的成績">
    <div className="divide-y divide-border/50">
      {sd.scenario.results.map((r) => (
        <div key={r.id} className="flex items-center gap-2.5 py-2.5">
          <span className="text-sm text-foreground truncate min-w-0">{r.title}</span>
          <SourceBadge source={r.source} />
          <span className="ml-auto text-base font-semibold text-foreground tabular-nums shrink-0">
            {r.scoreLabel}
          </span>
          <span className={`w-9 text-right ${TYPE.micro} tabular-nums shrink-0`}>
            {r.dateLabel}
          </span>
        </div>
      ))}
    </div>
  </QuietPanel>
);
