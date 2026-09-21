import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  PenLine,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { WritingLoading } from "@/components/learn/writing/writingShared";
import { BatchAnalyzeDialog } from "@/components/admin/writing/BatchAnalyzeDialog";
import { useWritingQueue } from "@/hooks/learn/useWritingQueue";
import { useAdminClasses } from "@/hooks/learn/useAdminClasses";
import { ErrorCodeFilter } from "@/components/admin/writing/ErrorCodeFilter";
import { ErrorTrackingPanel } from "@/components/admin/writing/ErrorTrackingPanel";
import { ERROR_TAG_BY_CODE } from "@/lib/writing/taxonomy";
import type { ErrorScope } from "@/lib/writing/errorTracking";
import {
  ANALYSIS_STATE_LABEL,
  analysisBadge,
  analysisState,
  describeEnqueue,
  isEnqueueable,
  type AnalysisState,
  type CostEstimate,
  type WritingQueueRow,
} from "@/lib/writing/gradingQueue";

/**
 * 作文收件匣（僅限管理員）
 *
 * 老師一次面對 10–20 篇的時候，需要的是「勾起來、按一次、去做別的事」，
 * 不是「開啟 → 分析 → 返回 → 開啟下一篇」。所以這一頁的核心是多選與批次。
 *
 * ⚠️ 這一頁【不推進佇列】。按下批次分析只是把工作寫進資料庫並踢 worker 一腳；
 *    之後老師關掉瀏覽器，分析照跑。畫面上的進度是讀資料庫，不是讀這個分頁的狀態。
 *
 * 同時只有一篇在分析（concurrency = 1）是資料庫層保證的，不是靠這裡把按鈕停用。
 */

type ReviewFilter = "ALL" | "PENDING" | "REVIEWED";
type TimeFilter = "ALL" | "TODAY" | "7D" | "30D";

const TIME_LABEL: Record<TimeFilter, string> = {
  ALL: "不限時間",
  TODAY: "今天",
  "7D": "最近 7 天",
  "30D": "最近 30 天",
};

function withinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

/** 時間 filter 轉成錯誤追蹤 RPC 要的起點。回 null = 不限 */
function timeFilterFrom(t: TimeFilter): string | null {
  if (t === "ALL") return null;
  const now = new Date();
  if (t === "TODAY") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d.toISOString();
  }
  const days = t === "7D" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

/**
 * 一列最多放幾個 error badge。
 * 實測單篇最多 11 個 code，全部攤開會把學生姓名那一行擠到看不見。
 * 手機一排只塞得下兩個，所以上限更嚴；兩個上限都用 CSS 切換，
 * 不用 JS 量視窗寬度（量出來的值在第一次 render 時還是錯的）。
 */
const BADGE_LIMIT = 6;
const BADGE_LIMIT_SM = 3;

/** 有篩選時把被選到的 code 排到前面，老師才不用在一排 badge 裡找自己剛選的那個 */
function orderedCodes(codes: readonly string[], selectedCodes: readonly string[]): string[] {
  if (selectedCodes.length === 0) return [...codes];
  const hit = new Set(selectedCodes);
  return [...codes].sort((a, b) => Number(hit.has(b)) - Number(hit.has(a)));
}

const WritingGrading = () => {
  const queue = useWritingQueue();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState("ALL");
  const [topicFilter, setTopicFilter] = useState("ALL");
  const [stateFilter, setStateFilter] = useState<AnalysisState | "ALL">("ALL");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("PENDING");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ALL");
  const [errorCodes, setErrorCodes] = useState<string[]>([]);
  const [tab, setTab] = useState("essays");
  // 錯誤追蹤的班級篩選要 class_id，而「作文」分頁是用班級【名稱】比對
  // row.class_names。兩者共用同一個下拉，所以這裡同時留著 id 與 name。
  const adminClasses = useAdminClasses();

  // 確認框：這是唯一會直接花錢的動作，按下去之前先讓老師看到規模。
  const [pending, setPending] = useState<{ ids: string[]; label: string } | null>(null);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  // 選項以 learn_admin_classes() 為準（它有 id）；
  // 佇列裡出現、但已封存或查不到的班級名稱也補進來，免得篩選少了選項。
  const classOptions = useMemo(() => {
    const byName = new Map<string, { id: string | null; name: string }>();
    for (const c of adminClasses.classes) byName.set(c.name, { id: c.id, name: c.name });
    for (const row of queue.rows) {
      for (const name of row.class_names ?? []) {
        if (!byName.has(name)) byName.set(name, { id: null, name });
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));
  }, [queue.rows, adminClasses.classes]);

  const topicOptions = useMemo(() => {
    const topics = new Set<string>();
    for (const row of queue.rows) if (row.essay_topic) topics.add(row.essay_topic);
    return [...topics].sort();
  }, [queue.rows]);

  const visible = useMemo(() => {
    return queue.rows.filter((row) => {
      if (classFilter !== "ALL" && !(row.class_names ?? []).includes(classFilter)) return false;
      if (topicFilter !== "ALL" && row.essay_topic !== topicFilter) return false;
      if (stateFilter !== "ALL" && analysisState(row) !== stateFilter) return false;
      if (reviewFilter === "PENDING" && row.teacher_reviewed) return false;
      if (reviewFilter === "REVIEWED" && !row.teacher_reviewed) return false;
      if (timeFilter === "TODAY" && !isToday(row.submitted_at)) return false;
      if (timeFilter === "7D" && !withinDays(row.submitted_at, 7)) return false;
      if (timeFilter === "30D" && !withinDays(row.submitted_at, 30)) return false;
      // error_codes 為 null 代表「這篇沒有已完成的分析」，不是「沒有錯誤」。
      // 老師篩選某個錯誤時，這種作文不該出現。
      if (errorCodes.length > 0
          && !errorCodes.some((c) => (row.error_codes ?? []).includes(c))) return false;
      return true;
    });
  }, [queue.rows, classFilter, topicFilter, stateFilter, reviewFilter, timeFilter, errorCodes]);

  /** 兩個分頁共用的篩選範圍。四支 RPC 吃同一組，數字才對得起來 */
  const scope: ErrorScope = useMemo(() => ({
    classId: classOptions.find((c) => c.name === classFilter)?.id ?? null,
    from: timeFilterFrom(timeFilter),
    to: null,
    topic: topicFilter === "ALL" ? null : topicFilter,
    codes: errorCodes,
  }), [classFilter, classOptions, timeFilter, topicFilter, errorCodes]);

  const hasNarrowingFilters =
    classFilter !== "ALL" || topicFilter !== "ALL" || timeFilter !== "ALL";

  /** 每個 error code 在【目前佇列】裡的作文數，給複選選單顯示規模 */
  const codeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of queue.rows) {
      for (const code of row.error_codes ?? []) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    return counts;
  }, [queue.rows]);

  // 勾選狀態只在【看得到的】列上有意義：篩選之後被藏起來的不應該偷偷被送出去分析。
  const selectableIds = useMemo(
    () => visible.filter(isEnqueueable).map((r) => r.essay_id),
    [visible],
  );
  const selectedVisible = useMemo(
    () => selectableIds.filter((id) => selected.has(id)),
    [selectableIds, selected],
  );
  const allSelected = selectableIds.length > 0 && selectedVisible.length === selectableIds.length;

  const failedVisible = useMemo(
    () => visible.filter((r) => analysisState(r) === "FAILED").map((r) => r.essay_id),
    [visible],
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
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const id of selectableIds) next.delete(id);
      else for (const id of selectableIds) next.add(id);
      return next;
    });
  };

  /** 先估算再確認。估不出來也照樣開框——確認本身比數字更重要。 */
  const askBatch = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    setPending({ ids, label });
    setEstimate(null);
    setEstimating(true);
    setEstimate(await queue.estimate(ids.length));
    setEstimating(false);
  };

  const runBatch = async () => {
    if (!pending) return;
    const { ids, label } = pending;
    setPending(null);

    const outcome = await queue.enqueue(ids);
    if (!outcome.ok) {
      toast.error(`${label}失敗：${outcome.error}`);
      return;
    }
    setSelected(new Set());
    const result = outcome.result;
    if (!result) return;

    toast.success(describeEnqueue(result));
    // 撞到上限是需要老師知道的事，不能只混在成功訊息裡帶過。
    if (result.capped > 0) {
      toast.warning(
        `今天的分析額度已滿（${result.daily_used}/${result.daily_cap}），有 ${result.capped} 篇沒有排入。明天會重新計算。`,
      );
    }
    if (result.kicked === false) {
      toast.warning("工作已排入，但沒能啟動處理。請按「繼續處理佇列」。");
    }
  };

  const onResume = async () => {
    const outcome = await queue.resume();
    if (outcome.ok) toast.success("已重新啟動佇列處理");
    else toast.error(outcome.error ?? "無法繼續處理");
  };

  const onToggleReviewed = async (row: WritingQueueRow) => {
    const next = !row.teacher_reviewed;
    const outcome = await queue.setReviewed(row.essay_id, next);
    if (!outcome.ok) toast.error(outcome.error ?? "標記失敗");
    else toast.success(next ? "已標記為處理完成" : "已取消完成檢閱");
  };

  const summary = queue.summary;
  const stalled = Boolean(summary && summary.work_waiting && !summary.worker_busy);

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <AdminPageHeader
            icon={PenLine}
            title="作文收件匣"
            subtitle="勾選多篇一次送出 AI 分析，系統會一篇一篇處理"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void queue.reload()}
                disabled={queue.loading}
              >
                <RefreshCw className={`h-4 w-4 ${queue.loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">重新載入</span>
              </Button>
            }
          />

          {queue.error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>載入收件匣失敗：{queue.error}</AlertDescription>
            </Alert>
          ) : null}

          {/* ── 概況 ───────────────────────────────────────────── */}
          {summary ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <PenLine className="h-5 w-5 text-primary shrink-0" />
                  <h2 className="font-semibold text-foreground">待處理</h2>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">{summary.pending_total}</span>
                  <span className="text-sm text-muted-foreground">篇</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  最早提交：{relativeTime(summary.oldest_pending_at)}
                </p>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-secondary shrink-0" />
                  <h2 className="font-semibold text-foreground">AI 佇列</h2>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">{summary.queued}</span>
                  <span className="text-sm text-muted-foreground">篇等待中</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {summary.worker_busy
                    ? "正在分析 1 篇，完成後自動接下一篇"
                    : summary.work_waiting
                      ? "目前沒有在處理"
                      : "佇列已清空"}
                </p>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-accent/10 to-treasure/10 border-accent/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-accent shrink-0" />
                  <h2 className="font-semibold text-foreground">等你檢閱</h2>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">{summary.awaiting_review}</span>
                  <span className="text-sm text-muted-foreground">篇</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {summary.failed > 0 ? `另有 ${summary.failed} 篇分析失敗` : "AI 已完成，尚未標記處理"}
                </p>
              </Card>
            </div>
          ) : null}

          {/* 鏈斷掉時才出現：有工作等著，但沒有人在跑 */}
          {stalled ? (
            <Alert className="mb-6 border-warning/20 bg-warning/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>佇列裡還有工作，但目前沒有在處理。</span>
                <Button size="sm" variant="outline" onClick={() => void onResume()} disabled={queue.busy}>
                  <PlayCircle className="h-4 w-4" />
                  繼續處理佇列
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* ── 共用篩選（兩個分頁都吃同一組）────────────────── */}
          <Card className="p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger><SelectValue placeholder="班級" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有班級</SelectItem>
                  {classOptions.map((c) => (
                    <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={topicFilter} onValueChange={setTopicFilter}>
                <SelectTrigger><SelectValue placeholder="題目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有題目</SelectItem>
                  {topicOptions.map((topic) => (
                    <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                <SelectTrigger><SelectValue placeholder="提交時間" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIME_LABEL) as TimeFilter[]).map((t) => (
                    <SelectItem key={t} value={t}>{TIME_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <ErrorCodeFilter value={errorCodes} onChange={setErrorCodes} counts={codeCounts} />
            </div>
          </Card>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="essays">作文</TabsTrigger>
              <TabsTrigger value="errors">錯誤追蹤</TabsTrigger>
              <TabsTrigger value="alerts">提醒</TabsTrigger>
            </TabsList>

            <TabsContent value="essays" className="mt-0">

          {/* ── 作文分頁專屬的篩選 ─────────────────────────────── */}
          <Card className="p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                value={stateFilter}
                onValueChange={(v) => setStateFilter(v as AnalysisState | "ALL")}
              >
                <SelectTrigger><SelectValue placeholder="分析狀態" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有分析狀態</SelectItem>
                  {(Object.keys(ANALYSIS_STATE_LABEL) as AnalysisState[]).map((s) => (
                    <SelectItem key={s} value={s}>{ANALYSIS_STATE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={reviewFilter} onValueChange={(v) => setReviewFilter(v as ReviewFilter)}>
                <SelectTrigger><SelectValue placeholder="檢閱狀態" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">尚未處理</SelectItem>
                  <SelectItem value="REVIEWED">已處理</SelectItem>
                  <SelectItem value="ALL">全部</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* ── 批次動作 ───────────────────────────────────────── */}
          <Card className="p-6 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  aria-label="全選"
                />
                <span className="text-sm text-muted-foreground truncate">
                  {selectedVisible.length > 0
                    ? `已選 ${selectedVisible.length} 篇`
                    : selectableIds.length > 0
                      ? `可選 ${selectableIds.length} 篇`
                      : "目前沒有可分析的作文"}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {failedVisible.length > 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => void askBatch(failedVisible, "重試")}
                    disabled={queue.busy}
                  >
                    <RotateCcw className="h-4 w-4" />
                    重試失敗項目（{failedVisible.length}）
                  </Button>
                ) : null}

                <Button
                  onClick={() => void askBatch(selectedVisible, "批次分析")}
                  disabled={queue.busy || selectedVisible.length === 0}
                >
                  {queue.busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  批次開始 AI 分析（{selectedVisible.length}）
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              系統一次只分析一篇，完成後自動接下一篇。送出之後可以關掉這一頁，分析會繼續進行。
            </p>
          </Card>

          {/* ── 清單 ───────────────────────────────────────────── */}
          {queue.loading ? (
            <WritingLoading label="載入收件匣" />
          ) : visible.length === 0 ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <p>{queue.rows.length === 0 ? "目前沒有已送出的作文" : "沒有符合篩選條件的作文"}</p>
                <p className="text-sm mt-2">
                  {queue.rows.length === 0
                    ? "學生送出作文之後會出現在這裡"
                    : "調整上方的篩選條件看看其他作文"}
                </p>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="divide-y divide-border">
                {visible.map((row) => {
                  const badge = analysisBadge(row);
                  const selectable = isEnqueueable(row);
                  return (
                    <div
                      key={row.essay_id}
                      className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <Checkbox
                        className="mt-1 shrink-0"
                        checked={selected.has(row.essay_id)}
                        onCheckedChange={() => toggle(row.essay_id)}
                        disabled={!selectable}
                        aria-label={`選取 ${row.student_name ?? ""}的${row.title}`}
                      />

                      <Link
                        to={`/admin/writing/${row.essay_id}`}
                        className="min-w-0 flex-1 rounded-md -mx-2 px-2 py-1 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-foreground truncate">
                            {row.student_name ?? "未命名學生"}
                          </span>
                          <span className="text-muted-foreground truncate">{row.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(row.class_names ?? []).join("、") || "未分班"}
                          {row.essay_topic ? ` · ${row.essay_topic}` : ""}
                          {" · "}
                          {row.word_count ?? "?"} 字 · {relativeTime(row.submitted_at)}
                          {row.analysis_version && row.analysis_version > 1
                            ? ` · 第 ${row.analysis_version} 次分析`
                            : ""}
                        </p>
                        {(() => {
                          // 🛑 null 是「沒有已完成的分析」，[] 是「分析完成、未發現錯誤」。
                          //    兩者都不代表學會了，所以這裡都不畫成「乾淨」的樣子——只是不畫。
                          const codes = orderedCodes(row.error_codes ?? [], errorCodes);
                          if (codes.length === 0) return null;
                          const shown = codes.slice(0, BADGE_LIMIT);
                          const rest = codes.length - shown.length;
                          const restSm = codes.length - BADGE_LIMIT_SM;
                          return (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {shown.map((code, i) => (
                                <Badge
                                  key={code}
                                  variant="outline"
                                  className={`text-xs font-normal ${
                                    i >= BADGE_LIMIT_SM ? "hidden sm:inline-flex" : ""
                                  } ${
                                    errorCodes.includes(code)
                                      ? "bg-accent/10 border-accent/30 text-foreground"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {ERROR_TAG_BY_CODE.get(code)?.zh ?? code}
                                </Badge>
                              ))}
                              {restSm > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs font-normal text-muted-foreground sm:hidden"
                                >
                                  +{restSm}
                                </Badge>
                              ) : null}
                              {rest > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs font-normal text-muted-foreground hidden sm:inline-flex"
                                >
                                  +{rest}
                                </Badge>
                              ) : null}
                            </div>
                          );
                        })()}
                        {analysisState(row) === "FAILED" && row.error_detail ? (
                          <p className="text-xs text-destructive mt-1 line-clamp-2">
                            {row.error_detail}
                          </p>
                        ) : null}
                      </Link>

                      <div className="flex items-center gap-2 shrink-0">
                        {row.has_feedback ? (
                          <Badge variant="outline" className="text-xs font-normal hidden sm:inline-flex">
                            有講評
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className={`text-xs font-normal ${badge.tone}`}>
                          {badge.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void onToggleReviewed(row)}
                          title={row.teacher_reviewed ? "取消完成檢閱" : "標記為處理完成"}
                          aria-label={row.teacher_reviewed ? "取消完成檢閱" : "標記為處理完成"}
                        >
                          <CheckCircle2
                            className={`h-5 w-5 ${
                              row.teacher_reviewed ? "text-success" : "text-muted-foreground/40"
                            }`}
                          />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

            </TabsContent>

            <TabsContent value="errors" className="mt-0">
              <ErrorTrackingPanel scope={scope} hasFilters={hasNarrowingFilters} />
            </TabsContent>

            <TabsContent value="alerts" className="mt-0">
              <Card className="p-6">
                <div className="text-center py-12 text-muted-foreground">
                  <p>提醒功能尚未啟用</p>
                  <p className="text-sm mt-2">
                    目前請用「錯誤追蹤」分頁主動查看。系統不會自動判定哪些學生需要提醒。
                  </p>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          <BatchAnalyzeDialog
            open={pending !== null}
            count={pending?.ids.length ?? 0}
            estimate={estimate}
            loading={estimating}
            onConfirm={() => void runBatch()}
            onCancel={() => setPending(null)}
          />
        </div>
      </div>
    </Layout>
  );
};

export default WritingGrading;
