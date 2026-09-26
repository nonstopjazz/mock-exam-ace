import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, BookOpen, CheckCircle2, Loader2, PlayCircle, Search } from "lucide-react";
import { useReadingPassages } from "@/hooks/learn/useReadingPassages";

/**
 * 閱讀練習的文章列表。
 *
 * 🛑 清單是空的通常【不是壞掉】，而是題庫還沒上架——匯入之後每一篇都是草稿。
 *    所以空狀態要講清楚是哪一種，否則學生會以為網站壞了。
 */
export default function StudentReading() {
  const { items, loading, error, reload } = useReadingPassages();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.content_family ?? "").toLowerCase().includes(q) ||
        (p.subdomain ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const doneCount = items.filter((p) => p.sessionStatus === "SUBMITTED").length;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
              <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                閱讀練習
              </h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                一篇文章六題，各考一種閱讀能力
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <span className="text-sm text-muted-foreground shrink-0">
              練過 {doneCount} / {items.length}
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
              <p className="text-foreground font-medium">目前沒有可以練的文章</p>
              <p className="text-sm mt-2">題庫還沒有上架，過一陣子再回來看看</p>
            </div>
          </Card>
        ) : (
          <>
            {items.length > 8 && (
              <div className="relative mb-6 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋標題或主題"
                  className="pl-9"
                />
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>沒有符合「{query}」的文章</p>
                <p className="text-sm mt-2">換個關鍵字，或清空搜尋看全部</p>
              </div>
            ) : (
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
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
