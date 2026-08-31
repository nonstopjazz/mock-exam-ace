import { Badge } from "@/components/ui/badge";
import { Activity, Flame } from "lucide-react";
import type { RhythmTrack } from "@/data/learn/studentDashboardMock";
import { StudentSection } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const Track = ({ track }: { track: RhythmTrack }) => {
  const done = track.days.filter(Boolean).length;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-20 shrink-0 text-sm text-foreground">{track.label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {track.days.map((d, i) => (
          <span
            key={i}
            className={
              d
                ? "h-3.5 w-3.5 rounded-full bg-secondary"
                : "h-3.5 w-3.5 rounded-full border border-border bg-muted/40"
            }
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground tabular-nums ml-auto shrink-0">
        {done} / {track.target}
      </span>
      {/* 紙本練習是學生自述，語意上和平台記錄不同 */}
      <span className="w-14 text-right text-[10px] text-muted-foreground shrink-0">
        {track.source === "self" ? "自行標記" : "平台記錄"}
      </span>
    </div>
  );
};

/**
 * Learning Rhythm —— 這週的學習節奏，不是單一個 streak 數字。
 * 涵蓋線上與紙本兩種練習，讓學生看得到自己的頻率與一致性。
 */
export const LearningRhythm = ({ sd }: { sd: StudentDashboard }) => {
  const { rhythm } = sd.scenario;
  const total = rhythm.reduce((s, t) => s + t.target, 0);
  const done = rhythm.reduce((s, t) => s + t.days.filter(Boolean).length, 0);

  return (
    <StudentSection
      icon={Activity}
      title="本週學習節奏"
      hint="週一到週日的完成情形"
      id="section-rhythm"
      action={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            連續 {sd.scenario.vocabulary.streakDays} 天
          </Badge>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground tabular-nums">
            本週 {done} / {total}
          </Badge>
        </div>
      }
    >
      <div className="divide-y divide-border/60">
        {rhythm.map((t) => (
          <Track key={t.label} track={t} />
        ))}
      </div>
    </StudentSection>
  );
};
