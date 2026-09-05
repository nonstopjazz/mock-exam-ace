import { Link, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, FileQuestion, Loader2 } from "lucide-react";
import { useEssay } from "@/hooks/useEssays";
import { useWritingReport } from "@/hooks/learn/useWritingReport";
import { EssayStatusBadge, WritingLoading } from "@/components/learn/writing/writingShared";
import { formatEssayDate } from "@/components/learn/writing/writingFormat";
import { WritingReportView } from "@/components/learn/writing/report/WritingReportView";

/**
 * 作文詳情（寫作系統 Phase 1）
 *
 * 唯讀。已送出的作文在資料庫層就不可修改，這裡也不提供任何編輯入口。
 */
const EssayDetail = () => {
  const { essayId } = useParams<{ essayId: string }>();
  const { essay, text, loading, error, notFound, refetch } = useEssay(essayId);
  const report = useWritingReport(essayId);

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

              {/* ── 批改結果 ────────────────────────────────────
                  三種狀態要分得清楚，因為它們對學生的意義完全不同：
                    還沒開始批改 / 批改進行中 / 已完成
                  「進行中」不會顯示任何半套內容——RPC 在綜合層完成前
                  就已經把那四欄擋成 NULL 了。 */}
              {report.loading ? (
                <WritingLoading label="正在載入批改結果" />
              ) : report.error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center gap-3">
                    <span>批改結果載入失敗：{report.error}</span>
                    <Button variant="outline" size="sm" onClick={() => void report.refetch()}>
                      重新載入
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : report.notRequested ? (
                <Card className="p-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <p>老師還沒開始批改這篇作文</p>
                    <p className="text-sm mt-2">批改完成後，詳細分析會出現在這裡</p>
                  </div>
                </Card>
              ) : report.report && !report.report.report_ready ? (
                <Card className="p-6">
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">批改進行中</p>
                    <p className="text-xs text-muted-foreground">完成後重新整理就看得到</p>
                    <Button variant="outline" size="sm" onClick={() => void report.refetch()}>
                      重新整理
                    </Button>
                  </div>
                </Card>
              ) : report.report ? (
                <WritingReportView report={report.report} />
              ) : null}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default EssayDetail;
