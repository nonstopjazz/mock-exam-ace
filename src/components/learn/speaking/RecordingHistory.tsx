import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Mic, Play } from "lucide-react";
import { formatDuration } from "@/lib/speaking/audio";
import { RETENTION_DAYS } from "@/config/speaking";
import type { SpeakingRecording } from "@/lib/speaking/types";

interface RecordingHistoryProps {
  items: SpeakingRecording[];
  loading: boolean;
  error: string | null;
  playbackUrl: (item: SpeakingRecording) => Promise<string | null>;
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
}: {
  item: SpeakingRecording;
  playbackUrl: (item: SpeakingRecording) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

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
          <div className="flex items-center gap-2 mb-1">
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
              錄音檔已超過 {RETENTION_DAYS} 天保存期限，練習紀錄仍然保留
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
      {items.map((item) => (
        <HistoryRow key={item.id} item={item} playbackUrl={playbackUrl} />
      ))}
    </Card>
  );
}
