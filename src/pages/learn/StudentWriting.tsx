import { Link, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, FileText, Plus } from "lucide-react";
import { useEssayCards } from "@/hooks/learn/useEssayCards";
import { EssayCard } from "@/components/learn/writing/EssayCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WritingLoading, WritingPageHeader } from "@/components/learn/writing/writingShared";
import { MyErrorsPanel } from "@/components/learn/writing/MyErrorsPanel";
import { GRID_CARDS } from "@/lib/cardGrid";

/**
 * 我的作文 —— 卡片列表
 *
 * 資料一律來自 writing_student_essay_cards()：一次往返就拿到批改狀態，
 * 不對每一篇各打一次 RPC。權限由該函式的 auth.uid() 決定。
 *
 * 兩個分頁：
 *   作文列表   —— 既有的卡片牆
 *   我常犯的錯 —— 跨作文的彙總。學生本來只看得到單篇報告裡的錯誤，
 *                 「同一個錯我在 4 篇裡都犯過」今天要一篇篇開才數得出來。
 *
 * 🛑 錯誤那一頁的資料【展開才載入】，切到分頁時只打一支總覽 RPC。
 *
 * 分頁狀態放在網址（?tab=errors）而不是純 local state，因為有兩個地方
 * 要連過來：儀表板的「最近常錯」卡片，以及每篇報告裡的「你在 N 篇裡犯過」。
 * 連結若只能落在作文列表，那兩個入口就等於沒有指到東西。
 */
const TAB_ESSAYS = "essays";
const TAB_ERRORS = "errors";
const StudentWriting = () => {
  const { cards, loading, error, refetch } = useEssayCards();
  const [params, setParams] = useSearchParams();
  // 網址帶了不認得的值時退回作文列表，不要出現一個都沒選中的空分頁。
  const tab = params.get("tab") === TAB_ERRORS ? TAB_ERRORS : TAB_ESSAYS;

  const changeTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === TAB_ERRORS) p.set("tab", TAB_ERRORS);
    else p.delete("tab");
    // replace：切分頁不該在上一頁堆疊裡留一格
    setParams(p, { replace: true });
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <WritingPageHeader
            title="我的作文"
            subtitle="寫下來，之後可以隨時回頭看"
            action={
              <Button asChild>
                <Link to="/learn/student/writing/new">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">寫一篇作文</span>
                  <span className="sm:hidden">新增</span>
                </Link>
              </Button>
            }
          />

          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList className="mb-6">
              <TabsTrigger value={TAB_ESSAYS}>作文列表</TabsTrigger>
              <TabsTrigger value={TAB_ERRORS}>我常犯的錯</TabsTrigger>
            </TabsList>

            <TabsContent value={TAB_ESSAYS}>
          {loading ? (
            <WritingLoading label="正在載入你的作文" />
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
          ) : cards.length === 0 ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p>還沒有任何作文</p>
                <p className="text-sm mt-2">點擊右上角「寫一篇作文」開始你的第一篇</p>
              </div>
            </Card>
          ) : (
            <div className={GRID_CARDS}>
              {cards.map((card) => (
                <EssayCard key={card.essay_id} card={card} />
              ))}
            </div>
          )}
            </TabsContent>

            <TabsContent value={TAB_ERRORS}>
              <MyErrorsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default StudentWriting;
