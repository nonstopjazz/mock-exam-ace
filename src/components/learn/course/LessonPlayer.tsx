import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Lock, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDuration } from "@/lib/learn/course/format";
import { remainingSeconds, watchPercent } from "@/lib/learn/course/watchProgress";
import { useVideoWatch } from "@/hooks/learn/useVideoWatch";
import { reportLessonProgress } from "@/hooks/learn/useCourses";
import type { LessonPlayback } from "@/lib/learn/course/types";

/**
 * 真的會播影片的播放器，而且會自己記錄看了多久。
 *
 * 🛑 影片位址不從課程大綱來，而是呼叫 learn_course_playback() 當場取得。
 *    大綱裡根本沒有 video_id——那是刻意的。
 *
 * 🛑 Bunny 的網址帶簽章會過期，所以要在過期前重新取，否則學生看到一半
 *    會變成 403，而且看起來像是「這個網站壞了」。
 *
 * 🛑 完成【由伺服器判定】。這裡只負責把「看了幾秒」送上去。
 */

interface LessonPlayerProps {
  playback: LessonPlayback | null;
  loading: boolean;
  error: string | null;
  completed: boolean;
  /** 簽章快過期時重新取一次 */
  onRefresh: () => void;
  /** 伺服器判定完成時通知外層重抓大綱（循序課的解鎖要跟著更新） */
  onCompleted: () => void;
}

const REFRESH_MARGIN_SECONDS = 60;

export function LessonPlayer({
  playback, loading, error, completed, onRefresh, onCompleted,
}: LessonPlayerProps) {
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [marking, setMarking] = useState(false);
  const [serverCompleted, setServerCompleted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const isDone = completed || serverCompleted;

  /** 送進度上去。伺服器說完成了就通知外層 */
  const report = useCallback((lessonId: string, watchedSeconds: number) => {
    void reportLessonProgress(lessonId, null, false, watchedSeconds).then((r) => {
      if (r.ok && r.completed && !completedRef.current) {
        completedRef.current = true;
        setServerCompleted(true);
        onCompleted();
      }
    });
  }, [onCompleted]);

  const { watched, tracking, unavailable } = useVideoWatch(playback, iframeRef, report);

  useEffect(() => {
    setFrameLoaded(false);
    setServerCompleted(false);
    completedRef.current = false;
  }, [playback?.lesson_id]);

  useEffect(() => {
    if (refreshRef.current) clearTimeout(refreshRef.current);
    if (!playback?.expires_at) return;
    const msLeft = new Date(playback.expires_at).getTime() - Date.now()
      - REFRESH_MARGIN_SECONDS * 1000;
    refreshRef.current = setTimeout(onRefresh, Math.max(0, msLeft));
    return () => { if (refreshRef.current) clearTimeout(refreshRef.current); };
  }, [playback?.expires_at, onRefresh]);

  const markComplete = async () => {
    if (!playback) return;
    setMarking(true);
    const r = await reportLessonProgress(playback.lesson_id, null, true, null);
    setMarking(false);
    if (r.ok && r.completed) { setServerCompleted(true); onCompleted(); }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
          <Lock className="h-12 w-12 text-muted-foreground" />
        </div>
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      </div>
    );
  }

  if (loading && !playback) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!playback) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <div className="space-y-2 text-center">
          <PlayCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">請從旁邊選一支影片開始</p>
        </div>
      </div>
    );
  }

  const threshold = playback.threshold_seconds;
  const left = remainingSeconds(watched, threshold);
  const pct = watchPercent(watched, threshold);

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {!frameLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={playback.embed_url}
          src={playback.embed_url}
          title={playback.title}
          className="absolute inset-0 h-full w-full border-0"
          onLoad={() => setFrameLoaded(true)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground">{playback.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{formatDuration(playback.duration_seconds)}</span>
            {isDone && (
              <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                <CheckCircle2 className="mr-1 h-3 w-3" />已完成
              </Badge>
            )}
          </div>
        </div>

        {/* 🛑 強制觀看的課不顯示這顆按鈕。顯示一顆按了沒有用的按鈕，
            比沒有按鈕更糟——學生會以為是壞的。 */}
        {!isDone && !playback.require_watch && (
          <Button variant="outline" onClick={markComplete} disabled={marking} className="shrink-0">
            {marking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            標記為完成
          </Button>
        )}
      </div>

      {/* 觀看進度。門檻是 0（沒填影片長度）時不顯示——那條進度條沒有意義 */}
      {!isDone && threshold > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">觀看進度</span>
            <span className="text-muted-foreground">
              {left > 0 ? `再看 ${formatDuration(left)} 就算完成` : "即將完成"}
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}

      {unavailable && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            自動記錄觀看進度沒有運作
            {playback.provider === "YOUTUBE" ? "（多半是擋廣告的外掛擋掉了 YouTube 的播放器 API）" : ""}。
            {playback.require_watch
              ? "這門課要求看完才算完成，所以請先把擋廣告的外掛對這個網站關掉，再重新整理。"
              : "影片還是能看，但要自己按「標記為完成」。"}
          </AlertDescription>
        </Alert>
      )}

      {!unavailable && !tracking && threshold > 0 && (
        <p className="text-xs text-muted-foreground">正在連接播放器…</p>
      )}

      {playback.description && (
        <p className="text-sm text-muted-foreground">{playback.description}</p>
      )}
    </div>
  );
}
