import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, FileText, Plus } from "lucide-react";
import { useEssayList } from "@/hooks/useEssays";
import {
  EssayStatusBadge,
  WritingLoading,
  WritingPageHeader,
} from "@/components/learn/writing/writingShared";
import { formatEssayDate } from "@/components/learn/writing/writingFormat";

/**
 * 我的作文 —— 列表（寫作系統 Phase 1）
 *
 * Phase 1 只有文字作文。圖片提交、OCR、AI 分析、老師批改都還沒開放。
 */
const StudentWriting = () => {
  const { essays, loading, error, refetch } = useEssayList();

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
          ) : essays.length === 0 ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p>還沒有任何作文</p>
                <p className="text-sm mt-2">點擊右上角「寫一篇作文」開始你的第一篇</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {essays.map((essay) => (
                <Link
                  key={essay.id}
                  to={`/learn/student/writing/${essay.id}`}
                  className="block rounded-lg transition-all duration-300 hover:shadow-lg hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-foreground truncate">{essay.title}</h2>
                        {essay.essay_topic ? (
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {essay.essay_topic}
                          </p>
                        ) : null}
                      </div>
                      <EssayStatusBadge status={essay.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{formatEssayDate(essay.essay_date)}</span>
                      {essay.charCount !== null ? <span>{essay.charCount} 字</span> : null}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-8">
            批改與回饋功能仍在開發中，目前送出的作文會先保存起來。
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default StudentWriting;
