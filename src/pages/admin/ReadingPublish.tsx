import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle, ArrowLeft, BookOpen, Loader2, Search, Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  useReadingAdminPassages, type AdminPassageRow,
} from "@/hooks/learn/useReadingAdminPassages";

/**
 * 閱讀題庫上架（管理端）
 *
 * 🛑 上架【不是】改一個欄位那麼單純：六題不完整的文章，資料庫的 trigger
 *    會擋下來。所以這一頁從不自己判斷能不能上架——ready 是後端算的，
 *    按下去失敗的原因也是 trigger 講的原話。畫面與資料庫說同一件事，
 *    是因為它們用的是同一份定義。
 *
 * 🛑 上架之後學生【不會立刻看到】。閱讀練習另外還有一道開放控制
 *    （/admin/feature-access），預設不對任何人開放。兩道閘都開了才看得到。
 */
type Filter = "ALL" | "READY_DRAFT" | "PUBLISHED" | "BLOCKED";

export default function ReadingPublish() {
  const { rows, loading, error, working, reload, setStatus } = useReadingAdminPassages();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  /**
   * 🛑 批次改狀態要先確認。上架是【對外】的動作——按下去那一刻，
   *    這些文章就出現在學生的清單裡。可以復原不代表不必確認：
   *    誤點與後悔之間，學生已經看到了。
   */
  const [pending, setPending] = useState<AdminPassageRow["status"] | null>(null);

  const stats = useMemo(() => ({
    published: rows.filter((r) => r.status === "PUBLISHED").length,
    readyDraft: rows.filter((r) => r.status !== "PUBLISHED" && r.ready).length,
    blocked: rows.filter((r) => !r.ready).length,
  }), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "READY_DRAFT" && !(r.status !== "PUBLISHED" && r.ready)) return false;
      if (filter === "PUBLISHED" && r.status !== "PUBLISHED") return false;
      if (filter === "BLOCKED" && r.ready) return false;
      if (!q) return true;
      return r.passage_id.toLowerCase().includes(q) || r.title.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllReadyDrafts = () => {
    setSelected(new Set(rows.filter((r) => r.status !== "PUBLISHED" && r.ready)
      .map((r) => r.passage_id)));
  };

  const selectedRows = rows.filter((r) => selected.has(r.passage_id));
  const selectedWithAttempts = selectedRows.filter((r) => r.attempt_count > 0);

  const apply = async (status: AdminPassageRow["status"]) => {
    setPending(null);
    if (selected.size === 0) return;
    const res = await setStatus([...selected], status);
    if (!res.ok) { toast.error(res.error); return; }
    setSelected(new Set());
    const { updated, failed } = res.result;
    if (failed === 0) toast.success(`${updated} 篇已更新`);
    else {
      toast.error(`${updated} 篇成功、${failed} 篇失敗`);
      const first = res.result.results.find((r) => !r.ok);
      if (first) toast.error(`${first.passage_id}：${first.reason}`, { duration: 8000 });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
              <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                閱讀題庫上架
              </h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                決定哪些文章學生練得到
              </p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <Link to="/admin/reading/import">
                <Upload className="h-4 w-4" />
                <span className="hidden md:inline">匯入</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden md:inline">管理中心</span>
              </Link>
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => void reload()}>重試</Button>
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <Card className="p-12">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="font-medium text-foreground">載入中</p>
            </div>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4" />
              <p className="text-foreground font-medium">題庫是空的</p>
              <p className="text-sm mt-2">先到「閱讀題庫匯入」上傳一批文章</p>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <StatCard
                label="已上架" value={stats.published} hint="學生練得到（還要開放對象）"
                tone="from-primary/10 to-accent/10 border-primary/20"
              />
              <StatCard
                label="可上架，還沒上架" value={stats.readyDraft} hint="六題完整"
                tone="from-secondary/10 to-explorer/10 border-secondary/20"
              />
              <StatCard
                label="不能上架" value={stats.blocked} hint="🛑 六題不完整，trigger 會擋"
                tone="from-accent/10 to-treasure/10 border-accent/20"
              />
            </div>

            <Alert className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                上架之後學生<span className="font-medium text-foreground">還不會看到</span>——
                閱讀練習另外有一道開放控制。兩道都開了才看得到：
                <Button variant="link" size="sm" asChild className="h-auto p-0 ml-1">
                  <Link to="/admin/feature-access">設定開放對象</Link>
                </Button>
              </AlertDescription>
            </Alert>

            <Card className="p-6 mb-6">
              <div className="flex flex-wrap gap-2 mb-4">
                {([
                  ["ALL", `全部 ${rows.length}`],
                  ["READY_DRAFT", `可上架 ${stats.readyDraft}`],
                  ["PUBLISHED", `已上架 ${stats.published}`],
                  ["BLOCKED", `不能上架 ${stats.blocked}`],
                ] as [Filter, string][]).map(([f, label]) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="relative mb-4 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋編號或標題"
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={selectAllReadyDrafts}
                        disabled={stats.readyDraft === 0}>
                  全選可上架的（{stats.readyDraft}）
                </Button>
                {selected.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    清除選取
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">已選 {selected.size} 篇</span>
              </div>

              {selected.size > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  {selectedWithAttempts.length > 0 && (
                    <p className="text-sm text-muted-foreground mb-3">
                      ⚠️ 選取的文章裡有 {selectedWithAttempts.length} 篇
                      <span className="text-foreground">已經有學生作答過</span>。
                      下架不會刪掉紀錄，但學生會突然找不到那幾篇。
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setPending("PUBLISHED")} disabled={working} className="gap-2">
                      {working && <Loader2 className="h-4 w-4 animate-spin" />}
                      上架這 {selected.size} 篇
                    </Button>
                    <Button variant="outline" onClick={() => setPending("DRAFT")} disabled={working}>
                      下架回草稿
                    </Button>
                    <Button variant="outline" onClick={() => setPending("ARCHIVED")} disabled={working}>
                      封存
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {visible.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>沒有符合的文章</p>
                <p className="text-sm mt-2">換個篩選條件，或清空搜尋</p>
              </div>
            ) : (
              <Card className="p-0 overflow-hidden">
                <ScrollArea className="max-h-[32rem]">
                  <div className="divide-y divide-border">
                    {visible.map((r) => (
                      <PassageRow
                        key={r.passage_id}
                        row={r}
                        checked={selected.has(r.passage_id)}
                        onToggle={() => toggle(r.passage_id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            )}
            <p className="text-sm text-muted-foreground mt-3">
              顯示 {visible.length} / {rows.length} 篇
            </p>
          </>
        )}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "PUBLISHED" ? `要上架這 ${selected.size} 篇嗎？`
                : pending === "DRAFT" ? `要把這 ${selected.size} 篇下架回草稿嗎？`
                : `要封存這 ${selected.size} 篇嗎？`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {pending === "PUBLISHED" ? (
                  <p>
                    按下去之後，這些文章會出現在<span className="text-foreground font-medium">
                    已開放閱讀練習的學生</span>的清單裡。還沒開放給任何人的話，
                    要到「設定開放對象」那邊開了才看得到。
                  </p>
                ) : (
                  <p>
                    這些文章會從學生的清單裡消失。
                    <span className="text-foreground font-medium">已經作答的紀錄不會被刪掉。</span>
                  </p>
                )}
                {selectedWithAttempts.length > 0 && pending !== "PUBLISHED" && (
                  <p>
                    ⚠️ 其中 <span className="text-foreground font-medium">
                    {selectedWithAttempts.length} 篇已經有學生作答過</span>，
                    他們會突然找不到那幾篇。
                  </p>
                )}
                <p>隨時可以改回來。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void apply(pending!)}>
              {pending === "PUBLISHED" ? "上架" : pending === "DRAFT" ? "下架" : "封存"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, hint, tone }: {
  label: string; value: number; hint: string; tone: string;
}) {
  return (
    <Card className={`p-6 bg-gradient-to-br ${tone}`}>
      <h3 className="font-semibold text-foreground mb-3">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-foreground">{value}</span>
        <span className="text-sm text-muted-foreground">篇</span>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{hint}</p>
    </Card>
  );
}

function PassageRow({ row, checked, onToggle }: {
  row: AdminPassageRow; checked: boolean; onToggle: () => void;
}) {
  return (
    <label className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/40">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs text-muted-foreground shrink-0">{row.passage_id}</code>
          <span className="font-medium text-foreground min-w-0">{row.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge
            variant={
              row.status === "PUBLISHED" ? "default"
              : row.status === "ARCHIVED" ? "outline" : "secondary"
            }
            className="text-xs"
          >
            {row.status === "PUBLISHED" ? "已上架"
              : row.status === "ARCHIVED" ? "已封存" : "草稿"}
          </Badge>
          <span className="text-xs text-muted-foreground">{row.question_count} 題</span>
          {row.cefr_level && (
            <span className="text-xs text-muted-foreground">{row.cefr_level}</span>
          )}
          {row.attempt_count > 0 && (
            <span className="text-xs text-muted-foreground">
              {row.attempt_count} 筆作答
            </span>
          )}
          {/* 🛑 只說「不能上架」等於要人自己去猜。缺哪幾個就寫哪幾個。 */}
          {!row.ready && (
            <Badge variant="destructive" className="text-xs">
              缺 {row.missing.length > 0 ? row.missing.join("/") : "完整題目"}
            </Badge>
          )}
        </div>
      </div>
    </label>
  );
}
