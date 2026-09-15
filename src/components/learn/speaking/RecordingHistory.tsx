import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Mic, Play, Sparkles } from "lucide-react";
import { formatDuration } from "@/lib/speaking/audio";
import { RETENTION_DAYS } from "@/config/speaking";
import { GradingResult } from "./GradingResult";
import type { SpeakingPractice } from "@/lib/speaking/types";

interface RecordingHistoryProps {
  items: SpeakingPractice[];
  loading: boolean;
  error: string | null;
  playbackUrl: (item: SpeakingPractice) => Promise<string | null>;
  onRetry: () => void;
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 一列練習。播放網址是按下去才取的——signed URL 有效期短，先取會過期。 */
function HistoryRow({
  item,
  playbackUrl,
  defaultExpanded,
}: {
  item: SpeakingPractice;
  playbackUrl: (item: SpeakingPractice) => Promise<string | null>;
  /** 最新的那一則預設展開——剛錄完回來看結果是最常見的動作。 */
  defaultExpanded: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const expired = Boolean(item.file_deleted_at);
  const playable = item.status === "UPLOADED" || item.status === "GRADED";

  const open = async () => {
    setLoading(true);
    const next = await playbackUrl(item);
    setLoading(false);
    if (next) setUrl(next);
    else setFailed(true);
  };

  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* flex-wrap 是必要的：Part、時間、長度、分數徽章在 390px 下放不進
              同一行，沒有 wrap 的話最後那個（分數）會被擠出可視範圍——
              而分數正是學生最想先看到的東西。 */}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="shrink-0">
              Part {item.prompt_part}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">
              {dateOf(item.created_at)}
            </span>
            {item.duration_seconds != null && (
              <span className="text-xs text-muted-foreground shrink-0">
                {/* 加「長度」兩個字：緊接在時間後面的 2:01 會被讀成另一個時刻 */}
                長度 {formatDuration(item.duration_seconds)}
              </span>
            )}
            {item.grading_state === "GRADED" && item.overall_band !== null && (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <Sparkles className="h-3 w-3" />
                {item.overall_band.toFixed(1)}
              </Badge>
            )}
          </div>
          {/* 題目是當時的快照，不是現在題庫裡的樣子 */}
          <p className="text-sm text-foreground whitespace-pre-line break-words line-clamp-3">
            {item.prompt_text}
          </p>
          {item.status === "FAILED" && (
            <p className="mt-1 text-xs text-destructive break-words">
              上傳失敗{item.error_detail ? `：${item.error_detail}` : ""}
            </p>
          )}
          {item.status === "PENDING" && (
            <p className="mt-1 text-xs text-muted-foreground">還沒有錄音檔</p>
          )}
          {expired && (
            <p className="mt-1 text-xs text-muted-foreground">
              錄音檔已超過 {RETENTION_DAYS} 天保存期限，練習紀錄與批改結果仍然保留
            </p>
          )}
          {item.grading_state === "GRADING" && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-secondary">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              AI 批改中
            </p>
          )}
        </div>

        {playable && !expired && !url && (
          <Button variant="outline" size="sm" onClick={() => void open()} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            播放
          </Button>
        )}
      </div>

      {url && <audio controls src={url} className="mt-3 w-full" />}
      {failed && (
        <p className="mt-2 text-xs text-destructive">取不到播放網址，請重新整理後再試。</p>
      )}

      {/* 預設收合。分數已經在上面那一行的徽章裡，想看四項與講評才展開——
          30 則練習全部攤開會是一面看不完的牆。 */}
      {item.grading_state === "GRADED" && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 -ml-2"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收合批改結果" : "看批改結果"}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {expanded && <GradingResult practice={item} />}
        </>
      )}
    </div>
  );
}

export function RecordingHistory({
  items,
  loading,
  error,
  playbackUrl,
  onRetry,
}: RecordingHistoryProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            重新載入
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-12 text-muted-foreground">
          <Mic className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p>還沒有任何錄音</p>
          <p className="text-sm mt-2">上面挑一題，按「開始錄音」就可以了</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {items.map((item, index) => (
        <HistoryRow
          key={item.id}
          item={item}
          playbackUrl={playbackUrl}
          defaultExpanded={index === 0 && item.grading_state === "GRADED"}
        />
      ))}
    </Card>
  );
}
