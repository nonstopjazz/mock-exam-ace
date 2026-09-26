import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CONSTRUCT_LABEL_ZH, type Construct } from "@/lib/reading/constructs";
import {
  accuracyOf, constructSkillRows, type ConstructStat, type SkillRow, type SkillStat,
} from "@/lib/reading/statsShaping";
import type { ConstructTone } from "./ConstructCard";

/**
 * 一個 construct 的子能力面板。
 *
 * 🛑 一次只開一個。六組同時攤開就退回成一張長列表，層級等於沒有。
 *
 * 🛑 迷你長條就是迷你的。橫跨整頁的長條會讓子能力看起來跟六大能力一樣重，
 *    但它們是下一層。
 */
export function ConstructDetailPanel({ stat, skills, tone, onClose }: {
  stat: ConstructStat;
  skills: SkillStat[];
  tone: ConstructTone;
  onClose: () => void;
}) {
  const rows = constructSkillRows(skills, stat.construct);
  const acc = accuracyOf(stat);

  const bar =
    tone === "weak" ? "bg-warning" : tone === "strong" ? "bg-secondary" : "bg-primary";

  return (
    <Card id="construct-detail" className="mt-4 p-5 shadow-sm border-border/60">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">
            {stat.construct}｜{CONSTRUCT_LABEL_ZH[stat.construct]}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {acc === null
              ? "還沒練過"
              : `整體 ${Math.round(acc * 100)}%・${stat.correct} / ${stat.answered} 題`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="收起細項"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rows.map((r) => <SkillMini key={r.code} row={r} bar={bar} />)}
      </div>
    </Card>
  );
}

function SkillMini({ row, bar }: { row: SkillRow; bar: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-3">
      {/* 🛑 這裡只有中文。skill_code 是資料庫的身分，不是給學生看的東西 */}
      <div className="text-sm font-medium text-foreground">{row.label}</div>

      {row.state === "measured" ? (
        <>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-foreground tabular-nums leading-none">
              {row.pct}%
            </span>
            <span className="text-xs text-muted-foreground">{row.graded} 題</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${row.pct}%` }} />
          </div>
        </>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">
          {/* 🛑 題數不夠【不給百分比】。1 題答對寫成 100%，是拿雜訊當結論 */}
          {row.state === "insufficient" ? `資料不足・${row.graded} 題` : "尚無足夠資料"}
        </div>
      )}
    </div>
  );
}
