import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle, ArrowLeft, ArrowRight, BarChart3, Loader2, Target, TrendingUp,
} from "lucide-react";
import { CONSTRUCTS, CONSTRUCT_LABEL_ZH, CONSTRUCT_ORDER, type Construct }
  from "@/lib/reading/constructs";
import {
  accuracyOf, strongestConstruct, weakestConstruct, type ConstructStat,
} from "@/lib/reading/statsShaping";
import { useReadingStats } from "@/hooks/learn/useReadingStats";
import { ConstructCard, type ConstructTone } from "@/components/learn/reading/ConstructCard";
import { SkillDiagnosis } from "@/components/learn/reading/SkillDiagnosis";

/**
 * 我的閱讀能力 —— 學習診斷。
 *
 * 【版面的用意】
 *   一眼答三個問題：我整體如何、哪裡最弱、下一步做什麼。
 *   所以是 Summary → 下一步 → 六大能力 → 細項 → 紀錄，
 *   而不是把所有數字平鋪成一份報表。視覺重量依序遞減。
 *
 * 🛑 這一頁肯講「還看不出來」。練兩題錯一題就說某個能力弱，
 *    學生會信，然後去練一個他其實沒問題的能力。
 *
 * 🛑 趨勢（↑5%）目前【沒有資料】。reading_my_stats 不回傳前一期的數字，
 *    所以這裡不顯示趨勢，也不用任何方式估一個出來。
 */

/** 每個能力的下一步建議。純文案，不是算出來的。 */
const ADVICE: Record<Construct, string> = {
  SM: "先抓「整篇在談什麼」，再檢查選項有沒有超出文章範圍。",
  MI: "練習把全文收斂成一句話，特別小心只涵蓋某一段的選項。",
  SD: "回原文定位，確認選項的每個字都在文章裡找得到依據。",
  CO: "練習從文中證據推到沒有明說的結論，同時避免推得太遠。",
  CD: "注意作者為什麼舉這個例子、這一段放在這裡的作用是什麼。",
  VC: "從上下文推字義，不要只用背過的字面意思去對。",
};

export default function ReadingStats() {
  const { stats, loading, error, reload } = useReadingStats();

  const header = (
    <div className="mb-8 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">我的閱讀能力</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          了解你的閱讀強項，找到下一步最值得練習的能力
        </p>
      </div>
      <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1 md:gap-2">
        <Link to="/learn/student/reading">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">文章列表</span>
        </Link>
      </Button>
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <Layout>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:py-10">{children}</div>
    </Layout>
  );

  if (loading) {
    return shell(<>
      {header}
      <Card className="p-12 shadow-sm border-border/60">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="font-medium text-foreground">載入中</p>
        </div>
      </Card>
    </>);
  }

  if (error || !stats) {
    return shell(<>
      {header}
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error ?? "讀不到統計"}</AlertDescription>
      </Alert>
      <Button onClick={() => void reload()}>重試</Button>
    </>);
  }

  if (stats.overall.answered === 0) {
    return shell(<>
      {header}
      <Card className="p-12 shadow-sm border-border/60">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4" />
          <p className="text-foreground font-medium">還沒有資料</p>
          <p className="text-sm mt-2">練過幾篇之後，這裡會告訴你哪個能力最值得加強</p>
          <Button asChild className="mt-6">
            <Link to="/learn/student/reading">去找一篇來練</Link>
          </Button>
        </div>
      </Card>
    </>);
  }

  const byConstruct = new Map(stats.by_construct.map((c) => [c.construct, c]));
  const ordered: ConstructStat[] = [...CONSTRUCTS]
    .sort((a, b) => CONSTRUCT_ORDER[a] - CONSTRUCT_ORDER[b])
    .map((c) => byConstruct.get(c) ?? {
      construct: c, answered: 0, correct: 0,
      median_ms: null, changed: 0, changed_away_from_correct: 0,
    });

  const weakest = weakestConstruct(stats.by_construct);
  const strongest = strongestConstruct(stats.by_construct);
  const overall = stats.overall.correct / stats.overall.answered;

  const toneOf = (c: Construct): ConstructTone =>
    weakest?.construct === c ? "weak"
    : strongest?.construct === c ? "strong"
    : "neutral";

  return shell(<>
    {header}

    {/* ── Summary：三張角色不同的卡 ───────────────────── */}
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <Card className="p-5 shadow-sm border-border/60 sm:col-span-1">
        <div className="text-sm text-muted-foreground">閱讀正確率</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-4xl font-bold text-foreground tabular-nums">
            {Math.round(overall * 100)}
          </span>
          <span className="text-lg text-muted-foreground">%</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {stats.overall.correct} / {stats.overall.answered} 題
        </div>
        {/* 🛑 沒有前一期的資料，所以這裡不放趨勢。估一個出來是假的。 */}
        <div className="mt-3 text-xs text-muted-foreground">
          練過 {stats.overall.passages} 篇 · {stats.overall.sessions} 次練習
        </div>
      </Card>

      <SummarySide
        label="最需加強"
        stat={weakest}
        tone="weak"
        emptyHint={`每個能力至少練 ${3} 題才看得出來`}
      />
      <SummarySide
        label="最穩定"
        stat={strongest}
        tone="strong"
        emptyHint="再多練幾個能力就能比較"
      />
    </section>

    {/* ── 下一步 ──────────────────────────────────────── */}
    {weakest && (
      <Card className="p-5 md:p-6 mb-10 shadow-sm border-primary/30 bg-primary/[0.04]">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">
                下一步先練 {weakest.construct}・{CONSTRUCT_LABEL_ZH[weakest.construct]}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                目前 {weakest.answered} 題只答對 {weakest.correct} 題。
                {ADVICE[weakest.construct]}
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0 gap-2 w-full md:w-auto">
            <Link to="/learn/student/reading">
              開始練習
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>
    )}

    {/* ── 六大能力 ────────────────────────────────────── */}
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="font-semibold text-foreground">六大能力</h2>
        <p className="text-sm text-muted-foreground mt-1">
          固定順序排列，方便每次回來比對
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {ordered.map((c) => (
          <ConstructCard key={c.construct} stat={c} tone={toneOf(c.construct)} />
        ))}
      </div>
    </section>

    {/* ── 細項診斷 ────────────────────────────────────── */}
    <section className="mb-10">
      <SkillDiagnosis
        skills={stats.by_skill}
        minQuestions={stats.overall.min_questions_for_skill}
      />
    </section>

    {/* ── 最近練習 ────────────────────────────────────── */}
    <section>
      <div className="mb-4">
        <h2 className="font-semibold text-foreground">最近的練習</h2>
      </div>
      <Card className="p-0 overflow-hidden shadow-sm border-border/60">
        {stats.recent.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">還沒有練習紀錄</p>
        ) : (
          <div className="divide-y divide-border/60">
            {stats.recent.map((r) => (
              <Link
                key={r.session_id}
                to={`/learn/student/reading/${r.passage_id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  {/* 手機上標題換行，不截斷——截成一半的標題認不出是哪一篇 */}
                  <div className="font-medium text-foreground leading-snug">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(r.started_at).toLocaleDateString("zh-TW")}
                    {r.total_seconds !== null && ` · ${Math.round(r.total_seconds / 60)} 分鐘`}
                    {r.status === "IN_PROGRESS" && " · 做到一半"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {r.correct} / {r.answered}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
      {/* 🛑 這一列只有總分。要標出「這篇錯在哪個 construct」需要
          reading_my_stats 回傳逐題結果——那是後端的改動，這次不做。 */}
    </section>
  </>);
}

function SummarySide({ label, stat, tone, emptyHint }: {
  label: string;
  stat: ConstructStat | null;
  tone: "weak" | "strong";
  emptyHint: string;
}) {
  const shell = tone === "weak"
    ? "border-warning/40 bg-warning/[0.04]"
    : "border-secondary/40 bg-secondary/[0.04]";
  const ink = tone === "weak" ? "text-warning" : "text-secondary";
  const Icon = tone === "weak" ? Target : TrendingUp;

  if (!stat) {
    return (
      <Card className="p-5 shadow-sm border-border/60">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-base font-medium text-foreground">還看不出來</div>
        <div className="mt-1 text-sm text-muted-foreground">{emptyHint}</div>
      </Card>
    );
  }

  const acc = accuracyOf(stat)!;
  return (
    <Card className={`p-5 shadow-sm ${shell}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${ink}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 font-semibold text-foreground">
        {stat.construct}・{CONSTRUCT_LABEL_ZH[stat.construct]}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-foreground tabular-nums">
          {Math.round(acc * 100)}
        </span>
        <span className="text-sm text-muted-foreground">
          % · {stat.correct} / {stat.answered}
        </span>
      </div>
    </Card>
  );
}
