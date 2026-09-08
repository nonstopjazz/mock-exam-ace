import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, FileText, Plus } from "lucide-react";
import { useEssayCards } from "@/hooks/learn/useEssayCards";
import { EssayCard } from "@/components/learn/writing/EssayCard";
import { WritingLoading, WritingPageHeader } from "@/components/learn/writing/writingShared";
import { GRID_CARDS } from "@/lib/cardGrid";

/**
 * 我的作文 —— 卡片列表
 *
 * 資料一律來自 writing_student_essay_cards()：一次往返就拿到批改狀態，
 * 不對每一篇各打一次 RPC。權限由該函式的 auth.uid() 決定。
 */
const StudentWriting = () => {
  const { cards, loading, error, refetch } = useEssayCards();

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
        </div>
      </div>
    </Layout>
  );
};

export default StudentWriting;
