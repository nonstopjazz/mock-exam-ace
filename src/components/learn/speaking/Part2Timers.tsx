import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/speaking/audio";

/** IELTS Part 2 的規則：準備 1 分鐘、講 2 分鐘。 */
const PREP_SECONDS = 60;
const SPEAK_SECONDS = 120;

/**
 * Part 2 的兩個計時器。
 *
 * 【為什麼作答那一個沒有按鈕】
 *
 *   它跟著真正的錄音狀態跑。多一顆「開始計時」按鈕，就會出現計時器在跑
 *   但根本沒在錄的情況——學生講完兩分鐘才發現什麼都沒錄到。
 *   唯一的真相是 MediaRecorder 有沒有在錄，計時器只是把它顯示出來。
 *
 *   準備時間反過來：它發生在按錄音【之前】，沒有別的事件可以依附，
 *   所以要一顆自己的按鈕。
 */
export function Part2Timers({ recording }: { recording: boolean }) {
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [prepRunning, setPrepRunning] = useState(false);
  const [speakLeft, setSpeakLeft] = useState(SPEAK_SECONDS);

  useEffect(() => {
    if (!prepRunning || prepLeft <= 0) {
      if (prepLeft <= 0) setPrepRunning(false);
      return;
    }
    const timer = setTimeout(() => setPrepLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [prepRunning, prepLeft]);

  // 每次重新開始錄音都從 2:00 重來——重錄一次就是重新計時。
  useEffect(() => {
    if (recording) setSpeakLeft(SPEAK_SECONDS);
  }, [recording]);

  useEffect(() => {
    if (!recording || speakLeft <= 0) return;
    const timer = setTimeout(() => setSpeakLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [recording, speakLeft]);

  const prepPct = ((PREP_SECONDS - prepLeft) / PREP_SECONDS) * 100;
  const speakPct = ((SPEAK_SECONDS - speakLeft) / SPEAK_SECONDS) * 100;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-border p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            準備時間
          </div>
          <Button
            size="sm"
            variant={prepRunning ? "outline" : "default"}
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => {
              if (prepRunning) {
                setPrepRunning(false);
                setPrepLeft(PREP_SECONDS);
              } else {
                setPrepLeft(PREP_SECONDS);
                setPrepRunning(true);
              }
            }}
          >
            {prepRunning ? "重設" : prepLeft < PREP_SECONDS ? "重新開始" : "開始"}
          </Button>
        </div>
        <p className="font-mono text-2xl tabular-nums text-foreground">{formatDuration(prepLeft)}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${prepPct}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          <Timer className="h-4 w-4 shrink-0" />
          作答時間
          {recording && (
            <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
          )}
        </div>
        <p
          className={cn(
            "font-mono text-2xl tabular-nums text-foreground",
            recording && "text-destructive",
          )}
        >
          {formatDuration(speakLeft)}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-destructive transition-all duration-500"
            style={{ width: `${speakPct}%` }}
          />
        </div>
        {!recording && (
          <p className="mt-2 text-xs text-muted-foreground">按下面的錄音鍵就會自動開始</p>
        )}
      </div>
    </div>
  );
}
