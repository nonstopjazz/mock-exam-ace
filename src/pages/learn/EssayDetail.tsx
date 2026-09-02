import { Link, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, FileQuestion } from "lucide-react";
import { useEssay } from "@/hooks/useEssays";
import { EssayStatusBadge, WritingLoading } from "@/components/learn/writing/writingShared";
import { formatEssayDate } from "@/components/learn/writing/writingFormat";

/**
 * 作文詳情（寫作系統 Phase 1）
 *
 * 唯讀。已送出的作文在資料庫層就不可修改，這裡也不提供任何編輯入口。
 */
const EssayDetail = () => {
  const { essayId } = useParams<{ essayId: string }>();
  const { essay, text, loading, error, notFound, refetch } = useEssay(essayId);

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
            <Link to="/learn/student/writing">
              <ArrowLeft className="h-4 w-4" />
              我的作文
            </Link>
          </Button>

          {loading ? (
            <WritingLoading label="正在載入作文" />
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
          ) : notFound || !essay ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <FileQuestion className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p>找不到這篇作文</p>
                <p className="text-sm mt-2">它可能已被刪除，或不屬於你的帳號</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to="/learn/student/writing">回到我的作文</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <div className="mb-6">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-2xl md:text-4xl font-bold text-foreground min-w-0">
                    {essay.title}
                  </h1>
                  <EssayStatusBadge status={essay.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>{formatEssayDate(essay.essay_date)}</span>
                  {text ? <span>{text.char_count} 字</span> : null}
                </div>
              </div>

              {essay.essay_topic ? (
                <Card className="p-6 mb-6">
                  <h2 className="text-sm font-semibold text-muted-foreground mb-2">題目</h2>
                  <p className="text-foreground whitespace-pre-wrap">{essay.essay_topic}</p>
                </Card>
              ) : null}

              <Card className="p-6 mb-6">
                {text ? (
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                    {text.content}
                  </p>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>這篇作文還沒有內容</p>
                    <p className="text-sm mt-2">如果剛送出，請稍後重新整理</p>
                  </div>
                )}
              </Card>

              {essay.student_notes ? (
                <Card className="p-6 mb-6">
                  <h2 className="text-sm font-semibold text-muted-foreground mb-2">給老師的話</h2>
                  <p className="text-foreground whitespace-pre-wrap">{essay.student_notes}</p>
                </Card>
              ) : null}

              <Separator className="my-8" />
              <p className="text-center text-xs text-muted-foreground">
                批改與回饋功能仍在開發中。這篇作文已經保存，之後會出現在批改結果裡。
              </p>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default EssayDetail;
