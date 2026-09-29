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
import { setLessonDuration } from "@/hooks/learn/useCourseAdmin";
import { useAdmin } from "@/hooks/useAdmin";
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
  const durationSentRef = useRef<string | null>(null);

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

  const { watched, tracking, unavailable, duration } = useVideoWatch(playback, iframeRef, report);
  const { isAdmin } = useAdmin();

  /**
   * 影片長度沒填時，從播放器讀回來補上。
   *
   * 🛑 只有管理員做這件事。長度決定完成門檻，開放給學生寫等於讓他們
   *    可以把門檻設成 1 秒。後端也擋，這裡只是不要白打一次會被拒絕的請求。
   *
   * 這也是為什麼發布前「用學生的畫面把每一支點過一遍」值得做——
   * 順手就把長度補齊了。
   */
  useEffect(() => {
    if (!playback || !isAdmin) return;
    if (playback.duration_seconds > 0 || duration <= 0) return;
    if (durationSentRef.current === playback.lesson_id) return;
    durationSentRef.current = playback.lesson_id;
    void setLessonDuration(playback.lesson_id, duration).then((updated) => {
      // 真的寫進去了才重載——門檻跟著變，畫面要拿到新的
      if (updated) onCompleted();
    });
  }, [playback, isAdmin, duration, onCompleted]);

  useEffect(() => {
    setFrameLoaded(false);
    setServerCompleted(false);
    completedRef.current = false;
    durationSentRef.current = null;
  }, [playback?.lesson_id]);

  // 簽章到期前先換一份新的，讓【下一次】載入用得到有效的網址。
  // 因為 iframe 的 key 綁的是 lesson_id，這不會打斷正在播的影片。
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
        {/* 🛑 key 綁 lesson_id，【不是】embed_url。
            Bunny 的網址帶簽章、會換，綁 embed_url 的話重新簽就會讓
            React 重新掛載這個 iframe——影片從頭開始播。學生把分頁開著
            看一支長片，看到一半畫面自己跳回 0:00。
            重新簽只需要影響【下一次載入】，不該打斷正在播的。 */}
        <iframe
          ref={iframeRef}
          key={playback.lesson_id}
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
            {/* 🛑 長度是 0 時不要顯示 0:00——那是一個看起來像真的的假數字。
                管理員看到「長度未填」才知道有事要處理。 */}
            <span>
              {playback.duration_seconds > 0
                ? formatDuration(playback.duration_seconds)
                : duration > 0
                  ? formatDuration(duration)
                  : "長度未填"}
            </span>
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

      {/*
        🛑 這【不是】播放位置，是「實際播過的秒數」的累計。
           兩者刻意不同：播放位置可以拖，拖到最後就是 100%。

           但一條進度條擺在影片正下方，任何人都會讀成「應該跟著影片跑」——
           它被回報過一次。所以不做成一條裸的進度條：給它外框、給它單位、
           並且明講拖曳不算。

        門檻是 0（影片長度沒填）時整塊不顯示——那條進度條沒有意義。
      */}
      {!isDone && threshold > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-foreground">完成進度</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              已看 {formatDuration(watched)} / 需 {formatDuration(threshold)}
            </span>
          </div>
          <Progress value={pct} className="mt-2 h-1.5" />
          <p className="mt-2 text-xs text-muted-foreground">
            {left > 0 ? `再看 ${formatDuration(left)} 就算完成。` : "即將完成。"}
            {" "}這是實際播放過的時間，跟影片的播放位置不同 —— 快轉或把進度條拖過去都不會累加。
          </p>
        </div>
      )}

      {/* 🛑 不要斷定原因。訊息裡寫「多半是擋廣告的外掛」之後，
          真正的原因是影片載不起來時，人會照著錯的方向去查。 */}
      {unavailable && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-1">
            <p>自動記錄觀看進度沒有連上播放器。</p>
            <p className="text-sm">
              {playback.provider === "YOUTUBE"
                ? "常見原因：擋廣告的外掛擋掉了 YouTube 的播放器 API。"
                : "常見原因：影片本身沒有載起來（簽章不對時 Bunny 會回 403），或播放器程式被擋掉。"}
              {" "}上面的影片如果播得動，就是後者；播不動，要先處理影片。
            </p>
            <p className="text-sm">
              {playback.require_watch
                ? "這門課要求看完才算完成，所以在這個狀況下沒辦法標記完成——請先解決上面那件事。"
                : "影片還是能看，完成可以自己按「標記為完成」。"}
            </p>
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
