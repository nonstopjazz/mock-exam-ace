import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, BarChart3, Loader2 } from "lucide-react";
import { CONSTRUCT_LABEL_ZH, CONSTRUCT_ORDER } from "@/lib/reading/constructs";
import {
  accuracyOf, measuredSkills, ungradedTotal, unmeasuredSkills, weakestConstruct,
} from "@/lib/reading/statsShaping";
import { useReadingStats } from "@/hooks/learn/useReadingStats";
import { AccuracyBar } from "@/components/learn/reading/AccuracyBar";

/**
 * 我的閱讀統計。
 *
 * 🛑 這一頁最重要的性質是【肯講「還看不出來」】。
 *    練兩題錯一題就說「你的推論很弱」，學生會信，然後去練一個
 *    他其實沒問題的能力。題數不夠時要照實說，不是退而求其次給個數字。
 *
 * 🛑 micro-skill 有 10% 的題目沒有標權重。那些【不算進正確率】，
 *    但要把題數講出來——不講的話，分母對不起來時學生只會覺得這統計怪怪的。
 */
export default function ReadingStats() {
  const { stats, loading, error, reload } = useReadingStats();

  const header = (
    <div className="mb-8 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 md:p-3 rounded-lg bg-secondary/10 shrink-0">
          <BarChart3 className="h-6 w-6 md:h-8 md:w-8 text-secondary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
            我的閱讀統計
          </h1>
          <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
            練過哪些、哪個能力還需要加強
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
  );

  if (loading) {
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

  if (error || !stats) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          {header}
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error ?? "讀不到統計"}</AlertDescription>
          </Alert>
          <Button onClick={() => void reload()}>重試</Button>
        </div>
      </Layout>
    );
  }

  if (stats.overall.answered === 0) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          {header}
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4" />
              <p className="text-foreground font-medium">還沒有統計</p>
              <p className="text-sm mt-2">練過幾篇之後，這裡會告訴你哪個能力需要加強</p>
              <Button asChild className="mt-6">
                <Link to="/learn/student/reading">去找一篇來練</Link>
              </Button>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  const constructs = [...stats.by_construct].sort(
    (a, b) => CONSTRUCT_ORDER[a.construct] - CONSTRUCT_ORDER[b.construct],
  );
  const weakest = weakestConstruct(stats.by_construct);
  const measured = measuredSkills(stats.by_skill);
  const unmeasured = unmeasuredSkills(stats.by_skill);
  const ungraded = ungradedTotal(stats.by_skill);
  const changedAway = stats.by_construct.reduce(
    (n, c) => n + c.changed_away_from_correct, 0);
  const overallAccuracy = stats.overall.answered === 0
    ? 0 : stats.overall.correct / stats.overall.answered;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {header}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <h2 className="font-semibold text-foreground mb-3">總正確率</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {Math.round(overallAccuracy * 100)}
              </span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {stats.overall.correct} / {stats.overall.answered} 題
            </p>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
            <h2 className="font-semibold text-foreground mb-3">練過的文章</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{stats.overall.passages}</span>
              <span className="text-sm text-muted-foreground">篇</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              共 {stats.overall.sessions} 次練習
            </p>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-accent/10 to-treasure/10 border-accent/20">
            <h2 className="font-semibold text-foreground mb-3">本來選對卻改錯</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{changedAway}</span>
              <span className="text-sm text-muted-foreground">題</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {changedAway === 0 ? "沒有發生過" : "第一直覺是對的，可以多相信一點"}
            </p>
          </Card>
        </div>

        {/* 🛑 肯講「還看不出來」。題數不夠時不給結論。 */}
        <Alert className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {weakest ? (
              <>
                目前最需要加強的是
                <span className="font-medium text-foreground">
                  {" "}{weakest.construct}・{CONSTRUCT_LABEL_ZH[weakest.construct]}
                </span>
                （{weakest.correct} / {weakest.answered} 題）。
              </>
            ) : (
              <>
                練得還不夠多，看不出哪個能力比較弱。每個能力至少練 3 題才算得準。
              </>
            )}
          </AlertDescription>
        </Alert>

        <Card className="p-6 mb-8">
          <h2 className="font-semibold text-foreground mb-1">六大能力</h2>
          <p className="text-sm text-muted-foreground mb-6">依固定順序排，方便每次比對</p>
          <div className="space-y-5">
            {constructs.map((c) => {
              const acc = accuracyOf(c);
              if (acc === null) {
                return (
                  <div key={c.construct} className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {c.construct}
                      <span className="text-muted-foreground ml-2">
                        {CONSTRUCT_LABEL_ZH[c.construct]}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground shrink-0">還沒練過</span>
                  </div>
                );
              }
              return (
                <AccuracyBar
                  key={c.construct}
                  label={c.construct}
                  sublabel={CONSTRUCT_LABEL_ZH[c.construct]}
                  value={acc}
                  right={
                    <span className="flex flex-wrap gap-x-3">
                      <span>{c.correct} / {c.answered} 題</span>
                      {c.median_ms !== null && (
                        <span>每題約 {Math.round(c.median_ms / 1000)} 秒</span>
                      )}
                      {c.changed_away_from_correct > 0 && (
                        <span>改錯 {c.changed_away_from_correct} 題</span>
                      )}
                    </span>
                  }
                />
              );
            })}
          </div>
        </Card>

        <Card className="p-6 mb-8">
          <h2 className="font-semibold text-foreground mb-1">細項能力</h2>
          <p className="text-sm text-muted-foreground mb-6">
            每題會標幾個細項能力，依題目的權重加權。至少 {stats.overall.min_questions_for_skill} 題才算得準
          </p>

          {measured.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>還沒有任何細項能力練到足夠的題數</p>
              <p className="text-sm mt-2">再練幾篇，這裡就會出現</p>
            </div>
          ) : (
            <div className="space-y-5">
              {measured.map((s) => (
                <AccuracyBar
                  key={s.skill_code}
                  label={s.skill_code}
                  value={s.accuracy!}
                  right={<span>{s.graded} 題</span>}
                />
              ))}
            </div>
          )}

          {unmeasured.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-2">還量不出來</h3>
              <p className="text-sm text-muted-foreground mb-3">
                這些練到的題數還不夠，不給正確率比給一個不準的數字好
              </p>
              <div className="flex flex-wrap gap-2">
                {/* 🛑 graded 是 0 時【不能顯示「0 題」】。那個 skill 其實練過
                    （ungraded 那幾題），只是題庫沒有標權重。寫 0 題會讓學生
                    以為自己沒練過，而真正的原因完全不同。 */}
                {unmeasured.map((s) => (
                  <Badge key={s.skill_code} variant="outline" className="text-xs">
                    {s.skill_code}
                    <span className="ml-1 text-muted-foreground">
                      {s.graded > 0
                        ? `${s.graded} 題`
                        : `${s.ungraded} 題沒有權重`}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 🛑 沒有標權重的題數要講出來。不講的話，分母對不起來時
              學生只會覺得這個統計怪怪的。 */}
          {ungraded > 0 && (
            <p className="text-xs text-muted-foreground mt-6">
              另有 {ungraded} 筆題目標了細項能力但沒有標權重，沒有算進上面的百分比
              —— 那是題庫的資料缺漏，不是你答錯。
            </p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-foreground mb-4">最近的練習</h2>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">還沒有練習紀錄</p>
          ) : (
            <div className="divide-y divide-border -mx-6">
              {stats.recent.map((r) => (
                <Link
                  key={r.session_id}
                  to={`/learn/student/reading/${r.passage_id}`}
                  className="flex items-start justify-between gap-3 px-6 py-3 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(r.started_at).toLocaleDateString("zh-TW")}
                      {r.total_seconds !== null && ` ・ ${Math.round(r.total_seconds / 60)} 分鐘`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium text-foreground tabular-nums">
                      {r.correct} / {r.answered}
                    </div>
                    {r.status === "IN_PROGRESS" && (
                      <div className="text-xs text-primary mt-1">做到一半</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
