import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mic,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSpeakingGradingQueue,
  type GradingFilter,
} from "@/hooks/learn/useSpeakingGradingQueue";
import { formatDuration } from "@/lib/speaking/audio";
import type { SpeakingGradingRow } from "@/lib/speaking/types";

/**
 * 口說批改收件匣
 *
 * 老師勾選 → 按一次 → 佇列在伺服器端一則一則跑，關掉瀏覽器照跑。
 * concurrency = 1 由資料庫保證（advisory lock + 活租約），不是靠這一頁
 * 把按鈕停用。
 *
 * 🛑 學生不能觸發批改。這一頁是唯一的入口。
 */
const FILTERS: { value: GradingFilter; label: string }[] = [
  { value: "ungraded", label: "待批改" },
  { value: "queued", label: "佇列中" },
  { value: "failed", label: "失敗" },
  { value: "completed", label: "已完成" },
  { value: "all", label: "全部" },
];

const dateOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/*
 * ⚠️ 這裡刻意沒有「試聽」按鈕。
 *
 * speaking_admin_grading_queue() 不回傳 storage_path，所以前端簽不出播放
 * 網址。那個欄位是 `<學生 uid>/<練習 id>/…`，要給老師就得想清楚要不要把
 * 它放進一支老師端的回傳裡——為了一個次要功能順手加上去，是最容易在
 * 之後變成問題的那種改動。要做就另外做，連同它的測試。
 */

function StatusBadge({ row }: { row: SpeakingGradingRow }) {
  if (row.analysis_status === "COMPLETED") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Sparkles className="h-3 w-3" />
        {row.overall_band?.toFixed(1) ?? "已完成"}
      </Badge>
    );
  }
  if (row.analysis_status === "QUEUED" || row.analysis_status === "ANALYZING") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {row.analysis_status === "ANALYZING" ? "批改中" : "排隊中"}
      </Badge>
    );
  }
  if (row.analysis_status === "FAILED") {
    return (
      <Badge variant="destructive" className="shrink-0">
        失敗
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 text-muted-foreground">
      未批改
    </Badge>
  );
}

export default function SpeakingGrading() {
  const [filter, setFilter] = useState<GradingFilter>("ungraded");
  const { rows, summary, loading, error, refetch, enqueue, kickWorker } =
    useSpeakingGradingQueue(filter);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // 換篩選就清掉勾選。留著會讓人在「已完成」那一頁按下批改，
  // 送出的卻是上一頁勾的東西。
  useEffect(() => setSelected(new Set()), [filter]);

  /** 可以勾的：還沒批改或失敗的。已完成與排隊中的不該再送一次。 */
  const selectable = useMemo(
    () =>
      rows.filter((r) => r.analysis_status === null || r.analysis_status === "FAILED"),
    [rows],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable.map((r) => r.recording_id)),
    );
  };

  const submit = async () => {
    setSubmitting(true);
    const result = await enqueue([...selected]);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setSelected(new Set());
    const skipped = result.items.filter((i) => i.outcome !== "QUEUED").length;
    if (result.queued === 0) {
      toast.info("沒有新的項目被排入（可能都已在佇列裡）");
    } else {
      toast.success(
        `已排入 ${result.queued} 則${skipped > 0 ? `，${skipped} 則略過` : ""}`,
      );
    }
    if (result.daily_cap_reached) {
      toast.warning("今天的批改額度已用完，其餘的請明天再排。");
    }
  };

  const resume = async () => {
    const result = await kickWorker();
    if (result.ok) {
      toast.success("已重新啟動佇列");
      setTimeout(() => void refetch(), 1500);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/admin">
            <ArrowLeft className="h-4 w-4" />
            回管理中心
          </Link>
        </Button>

        <div className="mb-8 flex items-center gap-3 min-w-0">
          <div className="p-2 md:p-3 rounded-lg bg-secondary/10 shrink-0">
            <Mic className="h-6 w-6 md:h-8 md:w-8 text-secondary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">口說批改</h1>
            <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
              勾選錄音、按一次，系統會一則一則批改
            </p>
          </div>
        </div>

        {/* 摘要 */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <div className="mb-2 flex items-center gap-2">
              <Mic className="h-5 w-5 shrink-0 text-primary" />
              <span className="font-semibold text-foreground">待批改</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{summary?.ungraded ?? 0}</span>
              <span className="text-sm text-muted-foreground">則</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">有錄音檔、還沒有批改結果</p>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
            <div className="mb-2 flex items-center gap-2">
              <Loader2
                className={`h-5 w-5 shrink-0 text-secondary ${summary?.worker_busy ? "animate-spin" : ""}`}
              />
              <span className="font-semibold text-foreground">佇列中</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{summary?.in_queue ?? 0}</span>
              <span className="text-sm text-muted-foreground">則</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {summary?.worker_busy ? "正在批改，一次一則" : "目前沒有在跑"}
            </p>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-accent/10 to-treasure/10 border-accent/20">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />
              <span className="font-semibold text-foreground">今日已用</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{summary?.daily_used ?? 0}</span>
              <span className="text-sm text-muted-foreground">/ {summary?.daily_cap ?? 0} 則</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">每日上限，避免一次排爆</p>
          </Card>
        </div>

        {/* 🛑 鏈斷掉了：有工作在等但沒有人在跑 */}
        {summary?.work_waiting && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>佇列裡還有 {summary.in_queue} 則在等，但目前沒有在處理。</span>
              <Button variant="outline" size="sm" onClick={() => void resume()}>
                <PlayCircle className="h-4 w-4" />
                繼續處理佇列
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* 篩選 + 批次動作 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as GradingFilter)}>
            <TabsList>
              {FILTERS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            {selectable.length > 0 && (
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selected.size === selectable.length ? "取消全選" : `全選 ${selectable.length} 則`}
              </Button>
            )}
            <Button
              onClick={() => void submit()}
              disabled={selected.size === 0 || submitting}
              className="shrink-0"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              開始批改{selected.size > 0 ? `（${selected.size}）` : ""}
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="p-6">
            <div className="flex justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                重新載入
              </Button>
            </AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <Card className="p-6">
            <div className="py-12 text-center text-muted-foreground">
              <Mic className="mx-auto mb-4 h-12 w-12 opacity-40" />
              <p>
                {filter === "ungraded"
                  ? "沒有待批改的錄音"
                  : filter === "failed"
                    ? "沒有失敗的項目"
                    : "這個狀態下沒有錄音"}
              </p>
              <p className="mt-2 text-sm">
                {filter === "ungraded"
                  ? "學生上傳錄音之後就會出現在這裡"
                  : "換一個狀態看看"}
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            {rows.map((row) => {
              const canSelect =
                row.analysis_status === null || row.analysis_status === "FAILED";
              return (
                <div
                  key={row.recording_id}
                  className="flex items-start gap-3 border-b border-border py-4 last:border-0"
                >
                  <div className="pt-1">
                    <Checkbox
                      checked={selected.has(row.recording_id)}
                      disabled={!canSelect}
                      onCheckedChange={() => toggle(row.recording_id)}
                      aria-label={`選擇 ${row.student_name} 的錄音`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{row.student_name}</span>
                      <Badge variant="outline" className="shrink-0">
                        Part {row.prompt_part}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {dateOf(row.uploaded_at)}
                      </span>
                      {row.duration_seconds != null && (
                        <span className="text-xs text-muted-foreground">
                          長度 {formatDuration(row.duration_seconds)}
                        </span>
                      )}
                      <StatusBadge row={row} />
                    </div>

                    <p className="line-clamp-2 whitespace-pre-line break-words text-sm text-muted-foreground">
                      {row.prompt_text}
                    </p>

                    {/* 🛑 失敗原因只在這裡出現。學生端的 RPC 不回傳這個欄位。 */}
                    {row.analysis_status === "FAILED" && row.error_detail && (
                      <p className="mt-1 break-words text-xs text-destructive">
                        {row.error_detail}
                        {row.queue_attempts != null && row.queue_attempts > 0
                          ? `（已試 ${row.queue_attempts} 次）`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          批改在伺服器端一則一則進行，關掉這一頁也會繼續。學生不能自己觸發批改。
        </p>
      </div>
    </div>
  );
}
