import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AdminBreadcrumb, type AdminCrumb } from "@/components/admin/AdminPageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEssay } from "@/hooks/useEssays";
import { useAdminWritingAnalysis } from "@/hooks/learn/useAdminWritingAnalysis";
import { useWritingGrading } from "@/hooks/learn/useWritingGrading";
import { useReviewQueueNav } from "@/hooks/learn/useReviewQueueNav";
import { supabase } from "@/lib/supabase";
import { WritingLoading } from "@/components/learn/writing/writingShared";
import { WritingReportView } from "@/components/learn/writing/report/WritingReportView";
import { ScoreMark } from "@/components/learn/writing/ScoreMark";
import { TeacherFeedbackEditor } from "@/components/learn/writing/report/TeacherFeedbackEditor";
import {
  GRADING_EXPECTED_SECONDS,
  GRADING_PHASE_TEXT,
  type FriendlyError,
} from "@/lib/writing/gradingErrors";

/**
 * 單篇作文的批改頁（僅限管理員）
 *
 * 老師在這裡做三件事：看學生寫了什麼、觸發 AI 批改、（選填）寫下講評。
 *
 * ⚠️ 批改完成後學生【立即】看得到 AI 報告。講評不是發布關卡——
 *    寫不寫、什麼時候寫，都不影響學生能不能看到分析。
 */
const GRADING_TRAIL: AdminCrumb[] = [{ label: "作文收件匣", to: "/admin/writing" }];

const WritingGradingDetail = () => {
  const { essayId } = useParams<{ essayId: string }>();
  const { essay, text, loading: essayLoading } = useEssay(essayId);
  const analysis = useAdminWritingAnalysis(essayId);
  const grading = useWritingGrading();
  const nav = useReviewQueueNav(essayId);
  const navigate = useNavigate();
  const [failure, setFailure] = useState<FriendlyError | null>(null);
  const [marking, setMarking] = useState(false);

  const running = grading.runningEssayId === essayId;
  const elapsedSec = Math.round(grading.elapsedMs / 1000);

  const onGrade = async () => {
    if (!essayId) return;
    setFailure(null);
    const result = await grading.run(essayId);
    if (result.ok) {
      toast.success("批改完成，學生已經可以看到報告");
      await analysis.refetch();
    } else {
      setFailure(result.error ?? null);
    }
  };

  const hasReport = analysis.report?.report_ready;

  /**
   * 標記／取消「處理完成」。
   *
   * ⚠️ 這一步是【明確的人為動作】，不會因為老師開啟這一頁、捲到底部或
   *    AI 分析完成而自動發生。每日提醒的「待處理」就是以這件事為準——
   *    若它能被推導出來，提醒信會開始說謊。
   */
  const setReviewed = async (reviewed: boolean): Promise<boolean> => {
    if (!essayId) return false;
    setMarking(true);
    const { error } = await supabase.rpc("writing_set_teacher_reviewed", {
      p_essay_id: essayId,
      p_reviewed: reviewed,
    });
    setMarking(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await nav.refetch();
    return true;
  };

  const onToggleReviewed = async () => {
    const next = !nav.currentReviewed;
    if (await setReviewed(next)) {
      toast.success(next ? "已標記為處理完成" : "已取消完成檢閱");
    }
  };

  /** 儲存講評（若有改動）→ 標記處理完成 → 前往下一篇待檢閱的作文。 */
  const onSaveAndNext = async (saveDraft: () => Promise<boolean>) => {
    if (!(await saveDraft())) return;
    if (!(await setReviewed(true))) return;
    if (nav.nextEssayId) {
      navigate(`/admin/writing/${nav.nextEssayId}`);
    } else {
      toast.success("這是最後一篇，全部檢閱完成");
      navigate("/admin/writing");
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <AdminBreadcrumb trail={GRADING_TRAIL} />

          {essayLoading ? (
            <WritingLoading label="正在載入作文" />
          ) : !essay ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <p>找不到這篇作文</p>
              </div>
            </Card>
          ) : (
            <>
              <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-2">{essay.title}</h1>
              <p className="text-sm text-muted-foreground mb-6">
                {text ? `${text.word_count} 字 · ${text.char_count} 字元` : "尚無內文"}
                {essay.essay_topic ? ` · ${essay.essay_topic}` : ""}
              </p>

              {/* 學生原文 */}
              <Card className="p-6 mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">學生原文</h2>
                {text ? (
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">{text.content}</p>
                ) : (
                  <p className="text-muted-foreground">這篇作文還沒有內容，無法批改。</p>
                )}
              </Card>

              {/* 批改動作 */}
              <Card className="p-6 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">AI 批改</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hasReport
                        ? "已完成。重新批改會產生新的一份分析，取代學生目前看到的。"
                        : "分析完成後，學生就會在自己的作文頁看到完整報告。"}
                    </p>
                  </div>
                  <Button onClick={() => void onGrade()} disabled={running || !text}>
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {running ? "批改中" : hasReport ? "重新批改" : "開始批改"}
                  </Button>
                </div>

                {/* 老師會等超過一分鐘，畫面上要說得出現在在做什麼 */}
                {running ? (
                  <div className="mt-4 rounded-lg bg-muted/40 p-4">
                    <p className="text-sm text-foreground">{GRADING_PHASE_TEXT[grading.phase]}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      已經過 {elapsedSec} 秒，通常需要 {GRADING_EXPECTED_SECONDS} 秒左右。
                      這段時間可以離開這一頁，批改會繼續進行。
                    </p>
                  </div>
                ) : null}

                {failure ? (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium">{failure.message}</p>
                      <p className="text-sm mt-1">{failure.action}</p>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </Card>

              {/* 檢閱狀態：明確的人為動作，不從任何東西推導 */}
              <Card className="p-6 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">處理狀態</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {nav.currentReviewed
                        ? "已標記處理完成，不會再出現在待處理清單裡。"
                        : "標記之後這一篇就從待處理清單移除。講評寫不寫都可以。"}
                      {nav.remaining > 0 ? ` 另有 ${nav.remaining} 篇 AI 已完成、等待檢閱。` : ""}
                    </p>
                  </div>
                  <Button
                    variant={nav.currentReviewed ? "outline" : "default"}
                    onClick={() => void onToggleReviewed()}
                    disabled={marking}
                  >
                    {marking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {nav.currentReviewed ? "取消完成檢閱" : "完成檢閱"}
                  </Button>
                </div>
              </Card>

              {/* 講評（選填） */}
              {essayId ? (
                <div className="mb-6">
                  <TeacherFeedbackEditor
                    essayId={essayId}
                    extraAction={({ saving, saveDraft }) => (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void onSaveAndNext(saveDraft)}
                        disabled={saving || marking}
                      >
                        {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        儲存並下一篇
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  />
                </div>
              ) : null}

              <Separator className="my-8" />

              {/* 批改結果：與學生看到的呈現完全一致 */}
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">學生會看到的報告</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  以下是學生在自己的作文頁看到的內容，呈現方式完全相同。
                </p>
              </div>

              {analysis.loading ? (
                <WritingLoading label="載入批改結果" />
              ) : analysis.error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center gap-3">
                    <span>批改結果載入失敗</span>
                    <Button variant="outline" size="sm" onClick={() => void analysis.refetch()}>
                      重新載入
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : !analysis.report ? (
                <Card className="p-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <p>這篇作文還沒有批改過</p>
                    <p className="text-sm mt-2">按上面的「開始批改」產生分析</p>
                  </div>
                </Card>
              ) : !analysis.report.report_ready ? (
                <Card className="p-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <p>上一次批改沒有完成</p>
                    <p className="text-sm mt-2">
                      學生目前看不到報告。按「開始批改」再跑一次，已完成的部分會保留。
                    </p>
                  </div>
                </Card>
              ) : (
                <>
                  {/* 學生實際看到的分數。老師在這裡看不到的話，就無法判斷
                      AI 的標準鬆不鬆 —— 而那是只有老師能判斷的事。
                      🛑 與學生的作文卡共用 ScoreMark，數字不可能兩邊不一樣。 */}
                  {/* 🛑 分數讀不到時【不要靜默】。
                      第一版寫成 score ? (卡片) : null —— 結果 RPC 沒帶分數時
                      卡片就靜靜地不出現，老師只看到「批改完了但沒有分數」，
                      分不出是沒部署、沒跑 migration，還是真的沒分數。
                      那種失敗最花時間，因為畫面上沒有任何可以追的線索。 */
                  }
                  {analysis.report.score ? (
                    <Card className="p-6 mb-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="font-semibold text-foreground">學生看到的分數</h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            滿分 20。由 AI 在五個面向的評級換算而來
                            {analysis.report.score.measured < analysis.report.score.total
                              ? `，這篇評了 ${analysis.report.score.measured} / ${analysis.report.score.total} 項`
                              : ""}
                            。
                          </p>
                          {/* 🛑 下限要講出來。量表最低是 7 分（四個評級裡沒有
                              任何一個代表「完全不行」），不講的話低分看起來
                              比實際更低。 */}
                          <p className="text-xs text-muted-foreground mt-2">
                            這個量表的實際下限是 7 分 —— 即使每一項都評為最低的
                            DEVELOPING，換算後仍是 7 分。
                          </p>
                        </div>
                        <div className="shrink-0 pt-1">
                          <ScoreMark score={analysis.report.score} />
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <Alert className="mb-6">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        這篇的分數讀不到。報告本身正常，只是分數沒有跟著回來 ——
                        通常是 <code className="text-xs">add_writing_admin_analysis_score.sql</code>{" "}
                        還沒在這個環境執行。
                      </AlertDescription>
                    </Alert>
                  )}
                  <WritingReportView report={analysis.report} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default WritingGradingDetail;
