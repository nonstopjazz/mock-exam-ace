import { ClipboardCheck } from "lucide-react";
import { SourceBadge } from "@/components/learn/teacher/shared";
import { StudentSection } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/** 近期評量 —— 刻意比上面的待辦與練習輕 */
export const RecentResults = ({ sd }: { sd: StudentDashboard }) => (
  <StudentSection icon={ClipboardCheck} title="最近的成績" hint="平台、老師與 AI 批改的紀錄">
    <div className="divide-y divide-border/60">
      {sd.scenario.results.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2">
          <span className="text-sm text-foreground truncate">{r.title}</span>
          <SourceBadge source={r.source} />
          <span className="ml-auto text-sm font-semibold text-foreground tabular-nums shrink-0">
            {r.scoreLabel}
          </span>
          <span className="w-10 text-right text-xs text-muted-foreground tabular-nums shrink-0">
            {r.dateLabel}
          </span>
        </div>
      ))}
    </div>
  </StudentSection>
);
