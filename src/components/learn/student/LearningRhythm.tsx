import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Flame } from "lucide-react";
import {
  WEEKDAY_LABELS, WEEK_DATES, type CompletionSource, type RhythmTrack,
} from "@/data/learn/studentDashboardMock";
import { TYPE } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const SOURCE_TAG: Record<CompletionSource, string> = {
  auto: "AUTO",
  self: "SELF-REPORTED",
  teacher: "TEACHER VERIFIED",
};

const SOURCE_NOTE: Record<CompletionSource, string> = {
  auto: "平台記錄",
  self: "自行標記 · 待老師確認",
  teacher: "老師已確認",
};

/**
 * Learning Rhythm —— 一週的 habit grid。
 * 主體是格子的節奏本身；右側的 n/m 只是佐證，權重刻意壓低。
 * 🛑 顏色不是唯一辨識方式：tooltip 會說出日期、項目、來源與狀態。
 */
export const LearningRhythm = ({ sd }: { sd: StudentDashboard }) => {
  const { rhythm, todayIndex, vocabulary } = sd.scenario;
  const totalTarget = rhythm.reduce((s, t) => s + t.target, 0);
  const totalDone = rhythm.reduce((s, t) => s + t.days.filter(Boolean).length, 0);

  return (
    <Card className="p-5 h-full flex flex-col bg-card border-border/70" id="section-rhythm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className={TYPE.sectionHeading}>本週學習節奏</h2>
          <p className={TYPE.micro}>深色格子代表當天有完成</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground">
            <Flame className="h-3.5 w-3.5 text-primary" />
            連續 {vocabulary.streakDays} 天
          </span>
          <span className={`${TYPE.micro} tabular-nums`}>本週 {totalDone} / {totalTarget}</span>
        </div>
      </div>

      <TooltipProvider delayDuration={80}>
        <div className="flex-1">
          {/* 星期表頭；今天用一小段指示線標出，不用刺眼色塊 */}
          <div className="flex items-center gap-3 mb-2">
            <span className="w-[4.5rem] shrink-0" />
            <div className="grid grid-cols-7 gap-[5px] w-[15.25rem]">
              {WEEKDAY_LABELS.map((d, i) => (
                <div key={d} className="flex flex-col items-center gap-1">
                  <span
                    className={`text-[11px] leading-none ${
                      i === todayIndex ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {d}
                  </span>
                  <span
                    className={`h-[2px] w-4 rounded-full ${
                      i === todayIndex ? "bg-primary/70" : "bg-transparent"
                    }`}
                  />
                </div>
              ))}
            </div>
            <span className="w-9 shrink-0" />
          </div>

          <div className="space-y-[5px]">
            {rhythm.map((track: RhythmTrack) => {
              const done = track.days.filter(Boolean).length;
              const met = done >= track.target;
              return (
                <div key={track.label} className="flex items-center gap-3">
                  <span className="w-[4.5rem] shrink-0 text-[13px] text-foreground/85 truncate">
                    {track.label}
                  </span>
                  <div className="grid grid-cols-7 gap-[5px] w-[15.25rem]">
                    {track.days.map((filled, i) => (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`${WEEK_DATES[i]} ${track.label}：${filled ? "已完成" : "沒有紀錄"}`}
                            className={[
                              "h-[30px] rounded-md transition-all duration-150 outline-none",
                              filled
                                ? "bg-secondary hover:bg-secondary/85"
                                : "bg-muted/50 ring-1 ring-inset ring-border/70 hover:bg-muted",
                              "hover:ring-2 hover:ring-secondary/40",
                              i === todayIndex && !filled ? "ring-1 ring-primary/45" : "",
                              i === todayIndex && filled ? "ring-2 ring-primary/35 ring-offset-1 ring-offset-card" : "",
                            ].join(" ")}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="px-2.5 py-2">
                          <p className="text-xs font-semibold text-foreground">
                            {WEEK_DATES[i]} · {track.label}
                          </p>
                          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground mt-1">
                            {SOURCE_TAG[track.source]}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {filled ? SOURCE_NOTE[track.source] : "沒有紀錄"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <span
                    className={`w-9 shrink-0 text-right text-[11px] tabular-nums ${
                      met ? "text-foreground/70 font-medium" : "text-muted-foreground/80"
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

      {/* legend 刻意極簡，不搶主視覺 */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/60">
        <span className={`flex items-center gap-1.5 ${TYPE.micro}`}>
          <span className="h-3 w-3 rounded-[4px] bg-secondary" />已完成
        </span>
        <span className={`flex items-center gap-1.5 ${TYPE.micro}`}>
          <span className="h-3 w-3 rounded-[4px] bg-muted/50 ring-1 ring-inset ring-border/70" />
          沒有紀錄
        </span>
        <span className={`${TYPE.micro} ml-auto`}>紙本練習為自行標記</span>
      </div>
    </Card>
  );
};
