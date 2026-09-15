import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mic,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminSpeakingPrompts } from "@/hooks/learn/useAdminSpeakingPrompts";
import { useFeatureAccess } from "@/hooks/learn/useFeatureAccess";
import { PromptEditorDialog } from "@/components/admin/speaking/PromptEditorDialog";
import { FEATURE } from "@/config/speaking";
import type { AdminSpeakingPrompt } from "@/lib/speaking/types";

/**
 * 口說題庫（管理端）
 *
 * 兩件事刻意放在同一頁的最上面：題目有幾題，以及【目前有幾個人看得到】。
 * 題庫做好了但沒開放給任何人，是這個功能最容易發生的狀況——
 * 那個數字是 0 的時候，老師應該在這裡就看到，而不是等學生說「我沒有這個頁面」。
 */
/** 一頁幾題。50 列在桌機上約一個半螢幕，捲一下就到底。 */
const PAGE_SIZE = 50;

const PARTS = [
  { value: "all", label: "全部" },
  { value: "1", label: "Part 1" },
  { value: "2", label: "Part 2" },
  { value: "3", label: "Part 3" },
];

export default function SpeakingPrompts() {
  const { prompts, loading, error, refetch, save, setActive } = useAdminSpeakingPrompts();
  const { access } = useFeatureAccess(FEATURE);
  const [part, setPart] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<AdminSpeakingPrompt | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prompts.filter((p) => {
      if (part !== "all" && String(p.part) !== part) return false;
      if (!needle) return true;
      return [p.topic, p.question, p.title, p.cue, ...(p.bullets ?? [])]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [prompts, part, query]);

  // 題庫有 1,945 題。一次列出來不是慢，是找不到東西——
  // 所以先篩選，再分頁，一頁 50 列。
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = matches.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  // 換篩選條件就回到第一頁。留在第 12 頁而篩選後只剩 3 頁，畫面會是空的。
  useEffect(() => setPage(0), [part, query]);

  const activeCount = prompts.filter((p) => p.is_active).length;

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (prompt: AdminSpeakingPrompt) => {
    setEditing(prompt);
    setDialogOpen(true);
  };

  const toggle = async (prompt: AdminSpeakingPrompt) => {
    const result = await setActive(prompt, !prompt.is_active);
    if (result.ok) toast.success(prompt.is_active ? "已停用這一題" : "已重新啟用");
    else toast.error(result.error);
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

        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-secondary/10 shrink-0">
              <Mic className="h-6 w-6 md:h-8 md:w-8 text-secondary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">口說題庫</h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                管理 Part 1／2／3 的題目
              </p>
            </div>
          </div>
          <Button onClick={openNew} className="shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">新增題目</span>
            <span className="sm:hidden">新增</span>
          </Button>
        </div>

        {/* 題庫規模 vs 實際看得到的人 */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Mic className="h-5 w-5 text-primary shrink-0" />
              <span className="font-semibold text-foreground">啟用中的題目</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{activeCount}</span>
              <span className="text-sm text-muted-foreground">／ 共 {prompts.length} 題</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">停用的題目不會出現在學生的選單裡</p>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Settings2 className="h-5 w-5 text-secondary shrink-0" />
                <span className="font-semibold text-foreground truncate">目前開放給</span>
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0">
                <Link to="/admin/feature-access">設定</Link>
              </Button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{access?.reach ?? 0}</span>
              <span className="text-sm text-muted-foreground">人</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {access && access.reach === 0
                ? "還沒有開放給任何人，學生看不到這個功能"
                : "班級與個別授權重疊的只算一次"}
            </p>
          </Card>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">題目</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? "載入中…" : `符合 ${matches.length} 題`}
            </p>
          </div>
          <Tabs value={part} onValueChange={setPart}>
            <TabsList>
              {PARTS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋題目、主題或要點"
            className="pl-9"
          />
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
        ) : visible.length === 0 ? (
          <Card className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>
                {prompts.length === 0
                  ? "題庫還是空的"
                  : query.trim()
                    ? "沒有符合的題目"
                    : "這個 Part 還沒有題目"}
              </p>
              <p className="text-sm mt-2">
                {prompts.length === 0
                  ? "點右上角「新增題目」建立第一題"
                  : query.trim()
                    ? "換個關鍵字，或清空搜尋看全部"
                    : "換一個 Part 看看"}
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            {visible.map((prompt) => (
              <div key={prompt.id} className="py-4 border-b border-border last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="shrink-0">
                        Part {prompt.part}
                      </Badge>
                      {/* outline 而不是 secondary：停用是「這一題目前不算數」，
                          用實心色塊會讀成一個狀態標章，比啟用中的題目還顯眼 */}
                      {!prompt.is_active && (
                        <Badge variant="outline" className="shrink-0 text-muted-foreground">
                          已停用
                        </Badge>
                      )}
                      {prompt.practice_count > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          已被練習 {prompt.practice_count} 次
                        </span>
                      )}
                    </div>
                    {/* 題目在上、主題在下。
                        管理頁跟學生的選題畫面不一樣：同一個主題連著八題，
                        主題當標題就是同一行粗體字重複八次，而老師要找的那一句
                        反而變成底下的灰字。 */}
                    <p className="font-semibold text-foreground break-words">
                      {prompt.part === 2
                        ? prompt.title?.trim() || "（沒有標題）"
                        : prompt.question?.trim() || "（沒有題目）"}
                    </p>
                    {prompt.topic?.trim() && (
                      <p className="mt-1 text-sm text-muted-foreground break-words">
                        {prompt.topic}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(prompt)}>
                      編輯
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void toggle(prompt)}>
                      {prompt.is_active ? "停用" : "啟用"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}

        {!loading && !error && pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((n) => Math.max(0, n - 1))}
              disabled={current === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              上一頁
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              第 {current + 1} / {pageCount} 頁
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((n) => Math.min(pageCount - 1, n + 1))}
              disabled={current >= pageCount - 1}
            >
              下一頁
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <PromptEditorDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          onSave={save}
        />
      </div>
    </div>
  );
}
