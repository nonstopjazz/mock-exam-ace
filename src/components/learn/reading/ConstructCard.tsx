import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CONSTRUCT_LABEL_ZH } from "@/lib/reading/constructs";
import { accuracyOf, type ConstructStat } from "@/lib/reading/statsShaping";
import { ProgressRing } from "./ProgressRing";

export type ConstructTone = "weak" | "strong" | "neutral";

/**
 * 一個能力一張卡。六張要能【一眼比出來】，所以版型完全一致：
 * 同樣位置的短碼、同樣位置的環、同樣位置的題數。
 *
 * 🛑 只有最弱與最穩定的兩張帶顏色，而且很淡。六張都上色等於沒有上色，
 *    而紅綠燈式的評分會讓 75% 看起來像不及格。
 *
 * 🛑 「最穩定 / 最需加強」是【右上角的角標】，不是插在「SM 題材辨識」
 *    中間的一段文字。名稱被標籤切成兩半，六張卡就對不齊，也讀不快。
 *
 * 🛑 卡片本身不放子能力。三條細項塞進來，這張卡就從「能力版圖」
 *    變成一份報表；子能力屬於下一層，點開才出現。
 */
export function ConstructCard({ stat, tone, expanded, onToggle, skillCount }: {
  stat: ConstructStat;
  tone: ConstructTone;
  expanded: boolean;
  onToggle: () => void;
  skillCount: number;
}) {
  const acc = accuracyOf(stat);

  const shell =
    tone === "weak"   ? "border-warning/40 bg-warning/[0.04]"
  : tone === "strong" ? "border-secondary/40 bg-secondary/[0.04]"
  :                     "border-border/60";

  const ring =
    tone === "weak"   ? "text-warning"
  : tone === "strong" ? "text-secondary"
  //   🛑 中性的環用【全飽和】的 primary。降到 /70 之後跟 muted 軌道
  //      明度太接近，填滿與未填滿分不出來，環就只剩裝飾。
  :                     "text-primary";

  const badge =
    tone === "weak"   ? { text: "最需加強", cls: "border-warning/40 bg-warning/10 text-warning" }
  : tone === "strong" ? { text: "最穩定", cls: "border-secondary/40 bg-secondary/10 text-secondary" }
  :                     null;

  return (
    <Card
      className={`p-0 shadow-sm overflow-hidden transition-shadow ${shell} ${
        expanded ? "ring-2 ring-primary/30" : "hover:shadow-md"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="construct-detail"
        className="w-full text-left p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-bold text-foreground">{stat.construct}</div>
            <div className="text-sm text-muted-foreground truncate">
              {CONSTRUCT_LABEL_ZH[stat.construct]}
            </div>
          </div>
          {badge && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-none ${badge.cls}`}
            >
              {badge.text}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {acc === null ? (
              <span className="text-sm text-muted-foreground">還沒練過</span>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground tabular-nums leading-none">
                  {Math.round(acc * 100)}
                  <span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {stat.correct} / {stat.answered} 題
                </div>
                {stat.median_ms !== null && (
                  // 🛑 這是【中位數】。寫成「平均」是把另一個統計量的名字
                  //    掛在這個數字上——一次離譜的慢答就會讓平均說謊。
                  <div className="text-xs text-muted-foreground">
                    每題約 {Math.round(stat.median_ms / 1000)} 秒
                  </div>
                )}
                {/* 🛑 題數不夠時講出來，不要讓一個 33% 看起來像定論 */}
                {stat.answered < 3 && (
                  <div className="text-xs text-muted-foreground">資料尚少</div>
                )}
              </>
            )}
          </div>
          {acc !== null && <ProgressRing value={acc} tone={ring} />}
        </div>

        {/* 很輕的入口：一行字加一個箭頭，不跟上面的數字搶注意力 */}
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1 text-xs text-muted-foreground">
          {expanded ? (
            <>收起細項<ChevronDown className="h-3.5 w-3.5" /></>
          ) : (
            <>查看 {skillCount} 個細項<ChevronRight className="h-3.5 w-3.5" /></>
          )}
        </div>
      </button>
    </Card>
  );
}
