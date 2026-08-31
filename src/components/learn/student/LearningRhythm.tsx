import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Flame } from "lucide-react";
import { WEEKDAY_LABELS, type RhythmTrack } from "@/data/learn/studentDashboardMock";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const SOURCE_LABEL = { auto: "平台記錄", self: "自行標記", teacher: "老師確認" } as const;

/**
 * Learning Rhythm —— 週一到週日的 habit grid。
 * 主體是格子本身，數字只是次要資訊：一眼要看得出哪幾天有做、哪一軌斷了。
 */
export const LearningRhythm = ({ sd }: { sd: StudentDashboard }) => {
  const { rhythm, todayIndex, vocabulary } = sd.scenario;
  const totalTarget = rhythm.reduce((s, t) => s + t.target, 0);
  const totalDone = rhythm.reduce((s, t) => s + t.days.filter(Boolean).length, 0);

  return (
    <Card className="p-5 h-full flex flex-col" id="section-rhythm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">本週學習節奏</h2>
          <p className="text-xs text-muted-foreground">深色格子代表當天有完成</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground">
            <Flame className="h-3.5 w-3.5 text-primary" />
            連續 {vocabulary.streakDays} 天
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            本週 {totalDone} / {totalTarget}
          </span>
        </div>
      </div>

      <TooltipProvider delayDuration={100}>
        <div className="flex-1">
          {/* 星期表頭 */}
          <div className="flex items-center gap-3 mb-1.5">
            <span className="w-16 shrink-0" />
            <div className="grid grid-cols-7 gap-1.5 flex-1 max-w-[19rem]">
              {WEEKDAY_LABELS.map((d, i) => (
                <span
                  key={d}
                  className={`text-center text-[11px] ${
                    i === todayIndex ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {d}
                </span>
              ))}
            </div>
            <span className="w-10 shrink-0" />
          </div>

          <div className="space-y-1.5">
            {rhythm.map((track: RhythmTrack) => {
              const done = track.days.filter(Boolean).length;
              return (
                <div key={track.label} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-foreground truncate">{track.label}</span>
                  <div className="grid grid-cols-7 gap-1.5 flex-1 max-w-[19rem]">
                    {track.days.map((filled, i) => (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div
                            className={[
                              "aspect-square rounded-md transition-all cursor-default",
                              filled
                                ? "bg-secondary hover:bg-secondary/85"
                                : "bg-muted/60 border border-border/70 hover:bg-muted",
                              i === todayIndex ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-card" : "",
                            ].join(" ")}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          週{WEEKDAY_LABELS[i]} · {track.label} ·{" "}
                          {filled ? `已完成（${SOURCE_LABEL[track.source]}）` : "沒有紀錄"}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <span
                    className={`w-10 shrink-0 text-right text-xs tabular-nums ${
                      done >= track.target ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {done}/{track.target}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </TooltipProvider>

      <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border">
        單字、閱讀、聽力由平台記錄；紙本練習是自行標記，兩者意義不同。
      </p>
    </Card>
  );
};
