import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ListTree } from "lucide-react";
import { skillLabel } from "@/lib/reading/skillLabels";
import {
  measuredSkills, strongestSkills, ungradedTotal, unmeasuredSkills, weakestSkills,
  type SkillStat,
} from "@/lib/reading/statsShaping";

const WEAK_N = 3;
const STRONG_N = 3;

/**
 * 細項能力的診斷。
 *
 * 【漸進揭露 —— 與作文分析同一套】
 *   上層只給可行動的摘要（最需改善 3 個、表現良好 3 個），
 *   完整列表放進預設收合的 Accordion，學生自己點開才展開。
 *   作文分析的原則照搬：收起來，但一個節點都不刪。
 *
 * 🛑 預設【不攤開全部】。十幾條長條會把這一頁變成報表，而學生真正需要的
 *    是「先練哪三個」。
 *
 * 🛑 視覺層級要低於六大能力。六大能力是穩定的能力版圖（2×3 cards），
 *    細項是往下挖的診斷——細項用細長條、不用環、不做成卡片牆。
 *
 * 🛑 中文是標題，英文代號是次要文字。代號是資料庫的身分，
 *    不是給人讀的名字——把它當標題等於把資料庫欄位秀給學生看。
 */
export function SkillDiagnosis({ skills, minQuestions }: {
  skills: SkillStat[];
  minQuestions: number;
}) {
  const weak = weakestSkills(skills, WEAK_N);
  const strong = strongestSkills(skills, STRONG_N, WEAK_N);
  const all = measuredSkills(skills);
  const unmeasured = unmeasuredSkills(skills);
  const ungraded = ungradedTotal(skills);

  if (all.length === 0 && unmeasured.length === 0) return null;

  const fullCount = all.length + unmeasured.length;
  const hasMore = all.length > weak.length + strong.length || unmeasured.length > 0;

  return (
    <Card className="p-5 md:p-6 shadow-sm border-border/60">
      <div className="mb-5">
        <h2 className="font-semibold text-foreground">細項診斷</h2>
        <p className="text-sm text-muted-foreground mt-1">
          每題會標幾個細項能力，依題目權重加權。至少 {minQuestions} 題才算得準
        </p>
      </div>

      {all.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-foreground">還沒有細項能力練到足夠的題數</p>
          <p className="text-sm mt-2">再練幾篇，這裡就會出現</p>
        </div>
      ) : (
        <div className="space-y-6">
          {weak.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-foreground mb-3">最需要改善</h3>
              <div className="space-y-2">
                {weak.map((s) => <SkillRow key={s.skill_code} skill={s} tone="weak" />)}
              </div>
            </section>
          )}

          {strong.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-foreground mb-3">目前表現良好</h3>
              <div className="space-y-2">
                {strong.map((s) => <SkillRow key={s.skill_code} skill={s} tone="strong" />)}
              </div>
            </section>
          )}

          {/* ── 完整細項能力：漸進揭露，預設收合 ───────────── */}
          {hasMore && (
            <Accordion type="single" collapsible>
              <AccordionItem value="all-skills" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2 text-left">
                    <ListTree className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">完整細項能力</span>
                    <Badge
                      variant="outline"
                      className="text-xs font-normal text-muted-foreground"
                    >
                      {fullCount} 項
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    上面是重點，這裡是全部細項能力的正確率。
                  </p>
                  <div className="space-y-2">
                    {all.map((s) => <SkillRow key={s.skill_code} skill={s} tone="neutral" />)}
                  </div>

                  {unmeasured.length > 0 && (
                    <div className="pt-5">
                      <h3 className="text-sm font-medium text-foreground mb-1">資料尚少</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        練到的題數還不夠，不給正確率比給一個不準的數字好
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {unmeasured.map((s) => {
                          const l = skillLabel(s.skill_code);
                          return (
                            <span key={s.skill_code} className="text-sm text-muted-foreground">
                              {l.label}
                              <span className="ml-1 text-xs">
                                {s.graded > 0 ? `${s.graded} 題` : `${s.ungraded} 題沒有權重`}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      )}

      {/* 🛑 沒有標權重的題數要講出來，而且要講清楚那不是「你答錯」。
          這句同時限定上面看得到的百分比，所以不收進 Accordion 裡。 */}
      {ungraded > 0 && (
        <p className="text-xs text-muted-foreground mt-6 pt-4 border-t border-border/60">
          另有 {ungraded} 筆題目標了細項能力但沒有標權重，沒有算進上面的百分比
          —— 那是題庫的資料缺漏，不是你答錯。
        </p>
      )}
    </Card>
  );
}

function SkillRow({ skill, tone }: { skill: SkillStat; tone: "weak" | "strong" | "neutral" }) {
  const l = skillLabel(skill.skill_code);
  const pct = Math.round((skill.accuracy ?? 0) * 100);
  const bar =
    tone === "weak" ? "bg-warning" : tone === "strong" ? "bg-secondary" : "bg-primary/60";

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{l.label}</span>
          {/* 認得的代號才把英文當次要說明；認不得的話中文本身就是代號，不必重複 */}
          {!l.isFallback && (
            <span className="text-xs text-muted-foreground">{l.code}</span>
          )}
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-right shrink-0 w-20">
        <div className="text-sm font-semibold text-foreground tabular-nums">{pct}%</div>
        <div className="text-xs text-muted-foreground">{skill.graded} 題</div>
      </div>
    </div>
  );
}
