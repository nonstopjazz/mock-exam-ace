import { Card } from "@/components/ui/card";
import { skillLabel } from "@/lib/reading/skillLabels";
import {
  strongestSkills, ungradedTotal, unmappedSkillCount, weakestSkills, type SkillStat,
} from "@/lib/reading/statsShaping";

const WEAK_N = 2;
const STRONG_N = 2;

/**
 * 跨能力的診斷摘要。
 *
 * 🛑 這是【摘要】，不是第二套能力架構。所以只有幾顆 chip，
 *    沒有長條、沒有全部列出來、沒有展開。完整的細項屬於各自的
 *    construct 面板——同一份資料在畫面上只該有一個家。
 *
 * 🛑 題數不夠的不參與排名（measuredSkills 已擋掉）。練 1 題答對的
 *    100% 排進「表現穩定」，會讓學生停止練一個他其實沒把握的能力。
 */
export function DiagnosisSummary({ skills, minQuestions }: {
  skills: SkillStat[];
  minQuestions: number;
}) {
  const weak = weakestSkills(skills, WEAK_N);
  const strong = strongestSkills(skills, STRONG_N, WEAK_N);
  const ungraded = ungradedTotal(skills);
  const unmapped = unmappedSkillCount(skills);

  if (weak.length === 0 && strong.length === 0) return null;

  return (
    <Card className="p-5 shadow-sm border-border/60">
      <h2 className="font-semibold text-foreground">診斷摘要</h2>
      <p className="text-sm text-muted-foreground mt-1">
        跨六大能力比較，至少 {minQuestions} 題才列入排名。完整的細項在上面各自的能力卡裡
      </p>

      <div className="mt-4 space-y-3">
        {weak.length > 0 && <ChipRow label="最需要改善" skills={weak} tone="weak" />}
        {strong.length > 0 && <ChipRow label="目前表現穩定" skills={strong} tone="strong" />}
      </div>

      {/* 🛑 沒有標權重的題數要講出來，而且要講清楚那不是「你答錯」 */}
      {ungraded > 0 && (
        <p className="text-xs text-muted-foreground mt-5 pt-4 border-t border-border/60">
          另有 {ungraded} 筆題目標了細項能力但沒有標權重，沒有算進上面的百分比
          —— 那是題庫的資料缺漏，不是你答錯。
          {/* 🛑 對照表認不得的代號完全不顯示。但要留一句話，
              否則題庫新增能力而前端沒跟上時，沒有人會發現。 */}
          {unmapped > 0 && `另有 ${unmapped} 項細項能力尚未分類，暫未列入。`}
        </p>
      )}
    </Card>
  );
}

function ChipRow({ label, skills, tone }: {
  label: string;
  skills: SkillStat[];
  tone: "weak" | "strong";
}) {
  const cls =
    tone === "weak"
      ? "border-warning/40 bg-warning/10 text-foreground"
      : "border-secondary/40 bg-secondary/10 text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <span
            key={s.skill_code}
            className={`rounded-full border px-3 py-1 text-sm ${cls}`}
          >
            {/* measuredSkills 已保證認得，這裡不會出現代號 */}
            {skillLabel(s.skill_code)}
            <span className="ml-1.5 font-semibold tabular-nums">
              {Math.round((s.accuracy ?? 0) * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
