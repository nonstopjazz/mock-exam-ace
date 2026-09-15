import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Loader2, Mic, RotateCcw, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { useSpeakingRecorder } from "@/hooks/learn/useSpeakingRecorder";
import { Part2Timers } from "./Part2Timers";
import { formatBytes, formatDuration } from "@/lib/speaking/audio";
import { MIN_RECORD_SECONDS, RETENTION_DAYS } from "@/config/speaking";
import type { SpeakingPrompt } from "@/lib/speaking/types";

interface SpeakingRecorderPanelProps {
  prompt: SpeakingPrompt;
  /** 上傳成功後通知外面重新載入「我練過的」。 */
  onSaved: () => void;
}

/**
 * 題卡 + 錄音。
 *
 * 刻意不做的事：不在這裡顯示分數、也不承諾什麼時候會有批改。
 * 這一批只做到「錄音存下來」，畫面上就只說到這裡——
 * 寫「AI 分析中」而後面沒有東西接，比什麼都不寫更糟。
 */
export function SpeakingRecorderPanel({ prompt, onSaved }: SpeakingRecorderPanelProps) {
  const recorder = useSpeakingRecorder(prompt.id);
  const [saving, setSaving] = useState(false);

  // 換題目就把上一題的錄音丟掉。留著會讓學生把 A 題的錄音傳到 B 題去。
  useEffect(() => {
    recorder.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.id]);

  const handleSave = async () => {
    setSaving(true);
    const id = await recorder.save();
    setSaving(false);
    if (id) {
      toast.success("錄音已上傳");
      onSaved();
    }
  };

  const isPart2 = prompt.part === 2;

  return (
    <Card className="p-6">
      {/* ── 題卡 ───────────────────────────────────────── */}
      <div className="mb-4 rounded-lg border border-border bg-muted/20 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{isPart2 ? "Part 2 — 題卡" : `Part ${prompt.part}`}</Badge>
          {!isPart2 && prompt.topic?.trim() && (
            <Badge variant="outline" className="max-w-full truncate">
              {prompt.topic}
            </Badge>
          )}
        </div>

        {isPart2 ? (
          <>
            <p className="whitespace-pre-line break-words font-semibold text-foreground">
              {prompt.title}
            </p>
            {prompt.cue?.trim() && (
              <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">
                {prompt.cue}
              </p>
            )}
            {prompt.bullets.length > 0 && (
              <>
                {/* cue 是空的時候補上這一句。舊題庫整批沒有 cue，
                    而「You should say:」本來就是題卡的固定格式，不是題目內容。 */}
                {!prompt.cue?.trim() && (
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    You should say:
                  </p>
                )}
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-foreground">
                  {prompt.bullets.map((bullet, index) => (
                    <li key={index} className="whitespace-pre-line break-words">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className="whitespace-pre-line break-words text-base font-medium leading-relaxed text-foreground">
            {prompt.question}
          </p>
        )}
      </div>

      {/* ── Part 2 的兩個計時器 ──────────────────────────── */}
      {isPart2 && (
        <div className="mb-4">
          <Part2Timers recording={recorder.phase === "recording"} />
        </div>
      )}

      {!recorder.supported && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            這個瀏覽器不支援錄音。請改用 Chrome、Edge 或 Safari，並確認網址是 https。
          </AlertDescription>
        </Alert>
      )}

      {recorder.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="break-words">{recorder.error}</AlertDescription>
        </Alert>
      )}

      {/* 錄音中：秒數 + 剩餘時間 */}
      {recorder.phase === "recording" && (
        <div className="mb-4 space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
            </span>
            <span className="text-3xl font-bold tabular-nums text-foreground">
              {formatDuration(recorder.elapsed)}
            </span>
            <span className="text-sm text-muted-foreground">
              / {formatDuration(recorder.maxSeconds)}
            </span>
          </div>
          <Progress
            value={(Math.min(recorder.elapsed, recorder.maxSeconds) / recorder.maxSeconds) * 100}
            className="h-2"
          />
        </div>
      )}

      {/* 試聽 */}
      {recorder.blobUrl && recorder.phase !== "done" && (
        <div className="mb-4 space-y-2">
          <audio controls src={recorder.blobUrl} className="w-full" />
          <p className="text-xs text-muted-foreground">
            {formatDuration(recorder.elapsed)}
            {recorder.blob ? ` · ${formatBytes(recorder.blob.size)}` : ""}
            {" · 還沒上傳"}
          </p>
        </div>
      )}

      {recorder.phase === "done" && (
        <Alert className="mb-4">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            已上傳。錄音檔會保存 {RETENTION_DAYS} 天，這段期間你都可以回來重聽。
          </AlertDescription>
        </Alert>
      )}

      {/* ── 操作 ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {(recorder.phase === "idle" || recorder.phase === "error") && (
          <Button onClick={() => void recorder.start()} disabled={!recorder.supported}>
            <Mic className="h-4 w-4" />
            開始錄音
          </Button>
        )}

        {recorder.phase === "permission" && (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            正在取得麥克風權限
          </Button>
        )}

        {recorder.phase === "recording" && (
          <Button variant="destructive" onClick={recorder.stop}>
            <Square className="h-4 w-4" />
            停止錄音
          </Button>
        )}

        {recorder.phase === "review" && (
          <>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              上傳這段錄音
            </Button>
            <Button variant="outline" onClick={recorder.reset} disabled={saving}>
              <RotateCcw className="h-4 w-4" />
              重錄
            </Button>
          </>
        )}

        {recorder.phase === "uploading" && (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            上傳中
          </Button>
        )}

        {recorder.phase === "done" && (
          <Button variant="outline" onClick={recorder.reset}>
            <Mic className="h-4 w-4" />
            再錄一次
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        最長 {formatDuration(recorder.maxSeconds)}，時間到會自動停止；少於 {MIN_RECORD_SECONDS}{" "}
        秒的不會上傳。上面的清單可以直接換下一題。
      </p>
    </Card>
  );
}
