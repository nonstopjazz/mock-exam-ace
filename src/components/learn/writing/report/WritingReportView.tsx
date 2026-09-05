import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Sparkles, AlertCircle, ListChecks, Target } from "lucide-react";
import {
  COMPETENCY_CATEGORY_BY_CODE, COMPETENCY_SKILL_BY_CODE,
  ERROR_TAG_BY_CODE, HIGH_SCORE_CATEGORIES, HIGH_SCORE_FEATURE_BY_CODE,
} from "@/lib/writing/taxonomy";
import { ZERO_ERROR_LABEL } from "@/lib/writing/analysisContract";
import type { WritingReport } from "@/hooks/learn/useWritingReport";
import { AiBadge, EvidenceQuote, StatePill } from "./reportShared";
import { COMPETENCY_LABEL, HIGH_SCORE_LABEL, OVERALL_LABEL } from "./reportLabels";

/**
 * 學生看到的作文分析報告。
 *
 * 呈現原則（沿用已核准的「完整分析 + 漸進揭露」）：
 *   • 第一屏只放摘要：整體、值得肯定、需要處理、下一步
 *   • 三軸的【完整】結構留在下方，用 Accordion 收起來，不刪任何節點
 *   • 本次沒有出現的節點顯示為 inactive，不是消失——
 *     「未出現」與「沒有分析到」對學生是兩件不同的事
 *   • 每一個 AI 區塊都標示「AI 分析」：這是自動產生的基線分析，
 *     不是老師逐字寫的評語
 */

/** 綜合層的 text 是【說明】不是證據；refs 指回三軸，這裡把 refs 轉成看得懂的標籤。 */
const refLabels = (refs: readonly string[] | undefined): string[] =>
  (refs ?? [])
    .map(
      (r) =>
        COMPETENCY_SKILL_BY_CODE.get(r)?.zh ??
        ERROR_TAG_BY_CODE.get(r)?.zh ??
        HIGH_SCORE_FEATURE_BY_CODE.get(r)?.zh ??
        COMPETENCY_CATEGORY_BY_CODE.get(r)?.zh ??
        null,
    )
    .filter((x): x is string => Boolean(x));

const HighlightList = ({
  items,
  emptyLabel,
}: {
  items: readonly { text: string; refs?: readonly string[] }[];
  emptyLabel: string;
}) => {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, i) => {
        const labels = refLabels(item.refs);
        return (
          <li key={i} className="text-sm text-foreground leading-relaxed">
            <p>{item.text}</p>
            {labels.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <Badge key={l} variant="outline" className="text-xs font-normal text-muted-foreground">
                    {l}
                  </Badge>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

export const WritingReportView = ({ report }: { report: WritingReport }) => {
  const competency = report.competency_analysis;
  const errors = report.error_analysis;
  const highScore = report.high_score_feature_analysis;

  const overall = report.overall_evaluation;
  const errorFindings = errors?.findings ?? [];
  // count = 0 代表本篇未發現此類錯誤，不代表已精熟（TR-12 / TR-13）。
  const cleanCodes = (errors?.coverage ?? []).filter((c) => c.count === 0);

  return (
    <div className="space-y-8">
      {/* ── 第一屏：整體 ───────────────────────────────── */}
      {overall ? (
        <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <StatePill state={overall.level} label={OVERALL_LABEL[overall.level]} />
            <AiBadge />
          </div>
          <p className="text-lg font-semibold text-foreground leading-relaxed">{overall.headline}</p>
          <p className="mt-3 text-sm text-foreground/90 leading-relaxed">{overall.summary}</p>
        </Card>
      ) : null}

      {/* ── 值得肯定 / 需要處理 / 下一步 ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <h2 className="font-semibold text-foreground">值得肯定</h2>
          </div>
          <HighlightList items={report.strengths ?? []} emptyLabel="這次沒有特別標記的亮點。" />
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-5 w-5 text-accent shrink-0" />
            <h2 className="font-semibold text-foreground">需要處理</h2>
          </div>
          <HighlightList items={report.needs_work ?? []} emptyLabel="這次沒有標記需要處理的地方。" />
        </Card>
      </div>

      {report.next_steps && report.next_steps.length > 0 ? (
        <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="h-5 w-5 text-secondary shrink-0" />
            <h2 className="font-semibold text-foreground">下一步</h2>
          </div>
          <ol className="space-y-3 list-decimal list-inside">
            {report.next_steps.map((s, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed">
                {s.text}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {/* ── 完整分析：漸進揭露 ─────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold text-foreground">完整分析</h2>
          <AiBadge />
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          上面是重點整理，這裡是這篇作文的完整分析。點開任何一項可以看到判斷的依據與你的原文。
        </p>

        <Accordion type="multiple" className="space-y-3">
          {/* 錯誤 */}
          {errors ? (
            <AccordionItem value="errors" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex items-center gap-2 text-left">
                  <AlertCircle className="h-5 w-5 text-accent shrink-0" />
                  <span className="font-semibold text-foreground">錯誤與修正</span>
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    {errorFindings.length} 處
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {errorFindings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">這篇作文沒有找到需要標記的錯誤。</p>
                ) : (
                  <ul className="space-y-5">
                    {errorFindings.map((f, i) => (
                      <li key={i} className="space-y-2">
                        <Badge
                          variant="outline"
                          className="text-xs font-normal bg-accent/10 border-accent/20 text-foreground"
                        >
                          {ERROR_TAG_BY_CODE.get(f.code)?.zh ?? f.code}
                        </Badge>
                        <EvidenceQuote>{f.quote}</EvidenceQuote>
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">改成：</span>
                          {f.correction}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{f.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {cleanCodes.length > 0 ? (
                  <div className="mt-6 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-2">
                      {ZERO_ERROR_LABEL}（{cleanCodes.length} 類）
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cleanCodes.map((c) => (
                        <Badge
                          key={c.code}
                          variant="outline"
                          className="text-xs font-normal bg-muted text-muted-foreground border-border"
                        >
                          {ERROR_TAG_BY_CODE.get(c.code)?.zh ?? c.code}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      這代表這一篇沒有出現這幾類錯誤，不代表已經完全掌握。
                    </p>
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {/* 寫作能力 */}
          {competency ? (
            <AccordionItem value="competency" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex items-center gap-2 text-left">
                  <ListChecks className="h-5 w-5 text-secondary shrink-0" />
                  <span className="font-semibold text-foreground">寫作能力</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-6">
                {competency.categories.map((cat) => (
                  <div key={cat.code}>
                    <h3 className="font-semibold text-foreground mb-1">
                      {COMPETENCY_CATEGORY_BY_CODE.get(cat.code)?.zh ?? cat.code}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">{cat.summary}</p>
                    <ul className="space-y-3">
                      {cat.skills.map((s) => (
                        <li key={s.code} className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {COMPETENCY_SKILL_BY_CODE.get(s.code)?.zh ?? s.code}
                            </span>
                            <StatePill state={s.state} label={COMPETENCY_LABEL[s.state]} />
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{s.reason}</p>
                          {s.evidence.map((e, i) => (
                            <EvidenceQuote key={i}>{e.quote}</EvidenceQuote>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {/* 高分特徵 */}
          {highScore ? (
            <AccordionItem value="highscore" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex items-center gap-2 text-left">
                  <Sparkles className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-semibold text-foreground">高分特徵</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-6">
                {HIGH_SCORE_CATEGORIES.map((cat) => {
                  const codes = new Set(cat.features.map((f) => f.code));
                  const found = highScore.features.filter((f) => codes.has(f.code));
                  if (found.length === 0) return null;
                  return (
                    <div key={cat.code}>
                      <h3 className="font-semibold text-foreground mb-3">{cat.zh}</h3>
                      <ul className="space-y-3">
                        {found.map((f) => (
                          <li key={f.code} className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {HIGH_SCORE_FEATURE_BY_CODE.get(f.code)?.zh ?? f.code}
                              </span>
                              <StatePill state={f.quality} label={HIGH_SCORE_LABEL[f.quality]} />
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{f.reason}</p>
                            {f.instances.map((inst, i) => (
                              <EvidenceQuote key={i}>{inst.quote}</EvidenceQuote>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  「本次未出現」代表這篇作文沒有用到這個技巧，不代表你不會。
                </p>
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </div>
    </div>
  );
};
