import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, BookOpen, Loader2 } from "lucide-react";
import { allAnswered } from "@/lib/reading/answerState";
import { useReadingSession } from "@/hooks/learn/useReadingSession";
import { PassagePane } from "@/components/learn/reading/PassagePane";
import { QuestionCard } from "@/components/learn/reading/QuestionCard";
import { ReadingSummaryPanel } from "@/components/learn/reading/ReadingSummaryPanel";

/**
 * 閱讀練習 —— 左邊文章、右邊六題，逐題送出。
 *
 * 【為什麼是逐題送出，不是六題一起交】
 *   六題一起交的話，學生要等到最後才知道哪裡錯，而那時他已經忘記
 *   自己當初為什麼那樣選。逐題送出讓「我以為是 C」與「原來是 B，因為…」
 *   這兩件事在同一個畫面上，那是閱讀練習真正學到東西的地方。
 *   代價是不能反悔——所以按鈕旁邊先講清楚。
 *
 * 🛑 送出前前端【沒有】正解。reading_get_passage 不回傳它，
 *    所以這不是「藏起來」，是根本沒有。
 */
export default function ReadingPractice() {
  const { passageId } = useParams<{ passageId: string }>();
  const s = useReadingSession(passageId);

  const answeredCount = Object.keys(s.results).length;
  const totalQuestions = s.payload?.questions.length ?? 0;
  const done = allAnswered(totalQuestions, answeredCount);

  const header = useMemo(
    () => (
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
              讀完文章，六題各考一種能力
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1 md:gap-2">
          <Link to="/learn/student/reading">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">文章列表</span>
          </Link>
        </Button>
      </div>
    ),
    [],
  );

  if (s.loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          {header}
          <Card className="p-12">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="font-medium text-foreground">載入中</p>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  if (s.error && !s.payload) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          {header}
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{s.error}</AlertDescription>
          </Alert>
          <div className="flex gap-3">
            <Button onClick={() => void s.reload()}>重試</Button>
            <Button variant="outline" asChild><Link to="/learn/student/reading">回文章列表</Link></Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!s.payload) return null;

  // 結算畫面
  if (s.summary) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          {header}
          <Card className="p-6 mb-6">
            <h2 className="font-semibold text-foreground text-lg">{s.payload.passage.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">練習結束</p>
          </Card>
          <ReadingSummaryPanel summary={s.summary} />
          <div className="mt-8">
            <Button asChild><Link to="/learn/student/reading">換一篇</Link></Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {header}

        {s.resumed && answeredCount > 0 && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              你之前練過這一篇，已經答了 {answeredCount} 題。接著做就好，答過的不會重來。
            </AlertDescription>
          </Alert>
        )}

        {s.error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{s.error}</AlertDescription>
          </Alert>
        )}

        {/* 桌機左文章右題目；窄螢幕文章在上、可收合 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <PassagePane passage={s.payload.passage} />

          <div className="space-y-6 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                已作答 {answeredCount} / {totalQuestions}
              </span>
              {totalQuestions < 6 && (
                <span className="text-sm text-muted-foreground">
                  這一篇只有 {totalQuestions} 題
                </span>
              )}
            </div>

            {s.payload.questions.map((q, i) => (
              <QuestionCard
                key={q.question_id}
                question={q}
                index={i}
                draft={s.drafts[q.question_id]}
                result={s.results[q.question_id]}
                submitting={s.submitting === q.question_id}
                onPick={(option) => s.pick(q.question_id, option)}
                onSubmit={() => void s.submit(q.question_id)}
              />
            ))}

            <Card className="p-6">
              {done ? (
                <p className="text-sm text-muted-foreground mb-4">六題都做完了，看結果吧。</p>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">
                  還有 {totalQuestions - answeredCount} 題沒作答。
                  現在結束的話，沒作答的會記成「沒作答」，不算答錯。
                </p>
              )}
              <Button onClick={() => void s.finish()} disabled={s.finishing} className="gap-2">
                {s.finishing && <Loader2 className="h-4 w-4 animate-spin" />}
                {done ? "看結果" : "結束並看結果"}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
