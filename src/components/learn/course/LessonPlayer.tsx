import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Lock, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDuration } from "@/lib/learn/course/format";
import type { LessonPlayback } from "@/lib/learn/course/types";

/**
 * 真的會播影片的播放器。取代原本那個寫著「影片播放器」四個字的灰色方塊。
 *
 * 🛑 影片位址不從 props 的課程大綱來，而是呼叫 learn_course_playback()
 *    當場取得。大綱裡根本沒有 video_id——那是刻意的，見該 RPC 的註解。
 *
 * 🛑 Bunny 的網址帶簽章，會過期。過期前要重新取一次，否則學生看到一半
 *    畫面會變成 403，而且看起來像是「這個網站壞了」。
 *
 * ⚠️ 自動記錄觀看進度【還沒有做】。跨網域的 iframe 讀不到播放位置，
 *    要 Bunny 的 player.js 或 YouTube 的 IFrame API 才拿得到。
 *    所以現在是學生自己按「標記為完成」。資料庫的 last_position_seconds
 *    已經備好，接上那兩個 API 之後就能填——但在那之前，這裡不會假裝
 *    自己在追蹤進度。
 */

interface LessonPlayerProps {
  playback: LessonPlayback | null;
  loading: boolean;
  error: string | null;
  completed: boolean;
  /** 簽章快過期時重新取一次 */
  onRefresh: () => void;
  onComplete: () => void;
  completing: boolean;
}

/** 提前這麼多秒重新簽，不要等到真的過期 */
const REFRESH_MARGIN_SECONDS = 60;

export function LessonPlayer({
  playback, loading, error, completed, onRefresh, onComplete, completing,
}: LessonPlayerProps) {
  const [frameLoaded, setFrameLoaded] = useState(false);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 換一支影片就把「iframe 載好了」重設，否則會沿用上一支的狀態
  useEffect(() => { setFrameLoaded(false); }, [playback?.embed_url]);

  useEffect(() => {
    if (refreshRef.current) clearTimeout(refreshRef.current);
    if (!playback?.expires_at) return;

    const msLeft = new Date(playback.expires_at).getTime() - Date.now()
      - REFRESH_MARGIN_SECONDS * 1000;
    // 已經過期或快過期就立刻重取。setTimeout 收到負數會馬上觸發，
    // 但寫清楚比依賴那個行為好。
    refreshRef.current = setTimeout(onRefresh, Math.max(0, msLeft));

    return () => { if (refreshRef.current) clearTimeout(refreshRef.current); };
  }, [playback?.expires_at, onRefresh]);

  if (error) {
    return (
      <div className="space-y-4">
        <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
          <Lock className="h-12 w-12 text-muted-foreground" />
        </div>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading && !playback) {
    return (
      <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!playback) {
    return (
      <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
        <div className="text-center space-y-2">
          <PlayCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">請從左邊選一支影片開始</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {!frameLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
        <iframe
          key={playback.embed_url}
          src={playback.embed_url}
          title={playback.title}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          onLoad={() => setFrameLoaded(true)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{playback.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{formatDuration(playback.duration_seconds)}</span>
            {completed && (
              <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                已完成
              </Badge>
            )}
          </div>
        </div>
        {!completed && (
          <Button onClick={onComplete} disabled={completing} className="shrink-0">
            {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            標記為完成
          </Button>
        )}
      </div>

      {playback.description && (
        <p className="text-sm text-muted-foreground">{playback.description}</p>
      )}
    </div>
  );
}
