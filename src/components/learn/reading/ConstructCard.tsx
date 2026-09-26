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
 */
export function ConstructCard({ stat, tone }: { stat: ConstructStat; tone: ConstructTone }) {
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

  return (
    <Card className={`p-4 shadow-sm ${shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-foreground">{stat.construct}</span>
            {tone === "weak" && (
              <span className="text-[11px] text-warning shrink-0">最需加強</span>
            )}
            {tone === "strong" && (
              <span className="text-[11px] text-secondary shrink-0">最穩定</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {CONSTRUCT_LABEL_ZH[stat.construct]}
          </div>
        </div>
        {acc !== null && <ProgressRing value={acc} tone={ring} />}
      </div>

      <div className="mt-3">
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
              {stat.median_ms !== null && ` · 約 ${Math.round(stat.median_ms / 1000)} 秒`}
            </div>
            {/* 🛑 題數不夠時講出來，不要讓一個 33% 看起來像定論 */}
            {stat.answered < 3 && (
              <div className="mt-1 text-xs text-muted-foreground">資料尚少</div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
