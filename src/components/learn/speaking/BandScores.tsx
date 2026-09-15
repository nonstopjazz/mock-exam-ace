import { Progress } from "@/components/ui/progress";
import type { SpeakingBands } from "@/lib/speaking/types";

/**
 * 四項 band + 總分。
 *
 * 順序固定為 S1→S4（LEARNING_DOMAIN_MODEL.md §9.12）。這四項本來就是
 * IELTS 的四個評分項，中文標籤用的是那份分類法裡已經定好的字，
 * 不另外翻一套。
 *
 * ⚠️ 這裡只是【顯示】。這些分數不寫入任何 skill mastery——§9.13 的
 *    可計分單位是 rubric evidence，一個 band 是總評而不是 evidence。
 */
const CRITERIA = [
  { key: "fluency_score", code: "S1", zh: "流暢與連貫", en: "Fluency & Coherence" },
  { key: "lexical_score", code: "S2", zh: "詞彙運用", en: "Lexical Resource" },
  { key: "grammar_score", code: "S3", zh: "文法運用", en: "Grammatical Range & Accuracy" },
  { key: "pronunciation_score", code: "S4", zh: "發音與語調", en: "Pronunciation & Intonation" },
] as const;

/** band 顯示成 6.0 而不是 6——半級是這個量表的一部分，看得出來比較好。 */
const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(1));

export function BandScores({ bands }: { bands: SpeakingBands }) {
  return (
    <div className="space-y-4">
      {/* 總分 */}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-foreground tabular-nums">
          {fmt(bands.overall_band)}
        </span>
        <span className="text-sm text-muted-foreground">Overall Band（滿分 9.0）</span>
      </div>

      {/* 四項 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CRITERIA.map((criterion) => {
          const value = bands[criterion.key];
          return (
            <div key={criterion.key} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {criterion.zh}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-foreground">{fmt(value)}</span>
              </div>
              {/* 軌道覆寫成 bg-muted：Progress 預設的 bg-secondary 是深青色，
                  分數低的時候整條看起來像滿的。 */}
              <Progress value={value === null ? 0 : (value / 9) * 100} className="h-1.5 bg-muted" />
              <p className="mt-1 truncate text-xs text-muted-foreground">{criterion.en}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
