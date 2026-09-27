import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle, ArrowLeft, BookOpen, CheckCircle2, Loader2, PlayCircle, Search,
} from "lucide-react";
import { useReadingPassages, type PassageWithProgress } from "@/hooks/learn/useReadingPassages";

/**
 * 全部文章的列表。【管理員限定】。
 *
 * 🛑 學生不進這一頁。每篇文章都考同樣六個 construct，挑哪一篇不影響
 *    練到什麼——所以學生端只有「開始練習」，沒有挑選這件事。
 *    這頁是給管理員抽查特定文章用的：找題目、確認內容、點進去自己跑一遍。
 *
 * 🛑 會列出 DRAFT／BLOCKED。管理員看的是題庫的全貌，不是學生的世界——
 *    所以每一列都要標出狀態，否則會拿一篇學生根本看不到的文章下判斷。
 */

type StatusFilter = "ALL" | "NEW" | "IN_PROGRESS" | "DONE";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "NEW", label: "還沒練" },
  { value: "IN_PROGRESS", label: "做到一半" },
  { value: "DONE", label: "練過了" },
];

const ANY = "__ANY__";

const matchesStatus = (p: PassageWithProgress, f: StatusFilter) =>
  f === "ALL" ? true
  : f === "NEW" ? p.sessionStatus === null
  : f === "DONE" ? p.sessionStatus === "SUBMITTED"
  : p.sessionStatus === "IN_PROGRESS";

export default function ReadingArticles() {
  const { items, loading, error, reload } = useReadingPassages({ includeUnpublished: true });
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<string>(ANY);
  const [cefr, setCefr] = useState<string>(ANY);
  const [status, setStatus] = useState<StatusFilter>("ALL");

  // 選項從實際資料長出來，不寫死——題庫新增一個主題，這裡自己會有
  const families = useMemo(
    () => [...new Set(items.map((p) => p.content_family).filter(Boolean))].sort() as string[],
    [items],
  );
  const levels = useMemo(
    () => [...new Set(items.map((p) => p.cefr_level).filter(Boolean))].sort() as string[],
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (!matchesStatus(p, status)) return false;
      if (family !== ANY && p.content_family !== family) return false;
      if (cefr !== ANY && p.cefr_level !== cefr) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.content_family ?? "").toLowerCase().includes(q) ||
        (p.subdomain ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, family, cefr, status]);

  const filtering = query.trim() !== "" || family !== ANY || cefr !== ANY || status !== "ALL";

  const clearAll = () => {
    setQuery(""); setFamily(ANY); setCefr(ANY); setStatus("ALL");
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 gap-1">
          <Link to="/admin/reading">
            <ArrowLeft className="h-4 w-4" />
            閱讀題庫上架
          </Link>
        </Button>

        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
              <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                全部文章
              </h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                抽查題庫內容。點任何一篇可以自己跑一遍
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <span className="text-sm text-muted-foreground shrink-0 tabular-nums">
              共 {items.length} 篇
            </span>
          )}
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
        ) : items.length === 0 ? (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4" />
              <p className="text-foreground font-medium">題庫是空的</p>
              <p className="text-sm mt-2">還沒有匯入任何文章</p>
            </div>
          </Card>
        ) : (
          <>
            <div className="mb-6 space-y-3">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜尋標題或主題"
                    className="pl-9"
                  />
                </div>

                {families.length > 1 && (
                  <Select value={family} onValueChange={setFamily}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="主題" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>所有主題</SelectItem>
                      {families.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {levels.length > 1 && (
                  <Select value={cefr} onValueChange={setCefr}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="難度" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>所有難度</SelectItem>
                      {levels.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {STATUS_TABS.map((t) => (
                  <Button
                    key={t.value}
                    size="sm"
                    variant={status === t.value ? "default" : "outline"}
                    onClick={() => setStatus(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
                {filtering && (
                  <Button size="sm" variant="ghost" onClick={clearAll} className="text-muted-foreground">
                    清除篩選
                  </Button>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>沒有符合條件的文章</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>
                  清除篩選
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4 tabular-nums">
                  {filtered.length} 篇
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((p) => (
                    <Link key={p.passage_id} to={`/learn/student/reading/${p.passage_id}`}>
                      <Card className="p-6 h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h2 className="font-semibold text-foreground leading-snug min-w-0">
                            {p.title}
                          </h2>
                          {p.sessionStatus === "SUBMITTED" && (
                            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                          )}
                          {p.sessionStatus === "IN_PROGRESS" && (
                            <PlayCircle className="h-5 w-5 text-primary shrink-0" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 🛑 沒上架的一定要標出來。學生看不到這一篇，
                              而這頁的人很容易忘記自己看的是管理員視角。 */}
                          {p.status !== "PUBLISHED" && (
                            <Badge
                              variant="outline"
                              className="text-xs border-warning/40 bg-warning/10 text-foreground"
                            >
                              未上架
                            </Badge>
                          )}
                          {p.cefr_level && (
                            <Badge variant="secondary" className="text-xs">{p.cefr_level}</Badge>
                          )}
                          {p.content_family && (
                            <Badge variant="outline" className="text-xs">{p.content_family}</Badge>
                          )}
                        </div>
                        {p.sessionStatus === "IN_PROGRESS" && (
                          <p className="text-sm text-primary mt-3">做到一半，接著做</p>
                        )}
                        {p.sessionStatus === "SUBMITTED" && (
                          <p className="text-sm text-muted-foreground mt-3">練過了</p>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
