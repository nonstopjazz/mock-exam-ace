import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle, ArrowRight, BarChart3, BookOpen, CheckCircle2, Library, Loader2, PlayCircle,
} from "lucide-react";
import { useReadingPassages } from "@/hooks/learn/useReadingPassages";
import { pickNext, progressOf } from "@/lib/reading/nextPassage";

/**
 * 閱讀練習的首頁。
 *
 * 【為什麼不是文章列表】
 *   每一篇文章都固定考同樣六個 construct，所以「挑哪一篇」對學生的練習
 *   內容沒有任何影響——那個選擇只會製造猶豫。一進來 296 張卡片要挑，
 *   最常見的結果不是挑到最適合的，是關掉頁面。
 *
 *   所以這一頁只回答一件事：現在開始下一篇。列表還在，但在 /articles。
 *
 * 🛑 做到一半的優先。學生上次按到一半離開，回來卻被丟到新的一篇，
 *    那筆紀錄就永遠留在半路——而他以為自己練過了。
 *
 * 🛑 完成度的分母是【他看得到的篇數】，不是題庫總數。
 */
export default function ReadingHome() {
  const navigate = useNavigate();
  const { items, loading, error, reload } = useReadingPassages();

  const pick = pickNext(items);
  const { done, total } = progressOf(items);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const targetId = pick.kind === "resume" || pick.kind === "next" ? pick.passageId : null;
  const target = targetId ? items.find((p) => p.passage_id === targetId) : null;

  const shell = (children: React.ReactNode) => (
    <Layout>
      <div className="mx-auto w-full max-w-[720px] px-4 py-8 md:py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
            <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">閱讀練習</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              每次一篇文章，完成 6 題閱讀理解
            </p>
          </div>
        </div>
        {children}
      </div>
    </Layout>
  );

  if (loading) {
    return shell(
      <Card className="p-12 shadow-sm border-border/60">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="font-medium text-foreground">載入中</p>
        </div>
      </Card>,
    );
  }

  if (error) {
    return shell(<>
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      <Button onClick={() => void reload()}>重試</Button>
    </>);
  }

  if (pick.kind === "empty") {
    return shell(
      <Card className="p-12 shadow-sm border-border/60">
        <div className="text-center text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4" />
          {/* 🛑 空的通常不是壞掉，是題庫還沒上架。講清楚是哪一種，
              否則學生會以為網站壞了，然後去問老師。 */}
          <p className="text-foreground font-medium">目前沒有可以練的文章</p>
          <p className="text-sm mt-2">題庫還沒有上架，過一陣子再回來看看</p>
        </div>
      </Card>,
    );
  }

  return shell(<>
    {/* ── 主 CTA：整頁只有這一個決定 ─────────────────── */}
    {pick.kind === "done" ? (
      <Card className="p-8 mb-6 shadow-sm border-success/30 bg-success/[0.06] text-center">
        <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground">{total} 篇全部練完了</h2>
        <p className="text-sm text-muted-foreground mt-2">
          去看看這些練習累積出什麼，或回列表重練任何一篇
        </p>
        <Button asChild size="lg" className="mt-6 gap-2">
          <Link to="/learn/student/reading/stats">
            看我的閱讀能力
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </Card>
    ) : (
      <Card className="p-8 mb-6 shadow-sm bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 text-center">
        {/* 🛑 外層要是 block。chip 自己是 inline-flex，直接放在按鈕前面
            會跟按鈕排在同一行上，看起來像兩顆併排的控制項。 */}
        {pick.kind === "resume" && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-foreground">
              <PlayCircle className="h-3.5 w-3.5 text-primary" />
              做到一半
            </span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full sm:w-auto h-14 px-10 text-base gap-2"
          onClick={() => navigate(`/learn/student/reading/${targetId}`)}
        >
          {pick.kind === "resume" ? "繼續上次練習" : "開始練習"}
          <ArrowRight className="h-5 w-5" />
        </Button>

        {/* 標題只是告知，不是選擇——所以放在按鈕【下面】而且是次要文字 */}
        {target && (
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
            {pick.kind === "resume" ? "上次做到：" : "下一篇："}
            <span className="text-foreground">{target.title}</span>
          </p>
        )}
      </Card>
    )}

    {/* ── 完成度 ──────────────────────────────────────── */}
    <Card className="p-5 mb-6 shadow-sm border-border/60">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">已完成</span>
        <span className="text-sm text-foreground tabular-nums">
          <span className="text-lg font-bold">{done}</span> / {total} 篇
        </span>
      </div>
      {/* 🛑 不用 ProgressBar：它的軌道是 bg-secondary（深青），
          8 / 296 會看起來像一條幾乎跑滿的青色長條。 */}
      <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </Card>

    {/* ── 次要入口：不與主 CTA 競爭 ───────────────────── */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Button variant="outline" asChild className="justify-start gap-2 h-auto py-3">
        <Link to="/learn/student/reading/stats">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          我的閱讀統計
        </Link>
      </Button>
      <Button variant="outline" asChild className="justify-start gap-2 h-auto py-3">
        <Link to="/learn/student/reading/articles">
          <Library className="h-4 w-4 text-muted-foreground" />
          瀏覽全部文章
        </Link>
      </Button>
    </div>
  </>);
}
