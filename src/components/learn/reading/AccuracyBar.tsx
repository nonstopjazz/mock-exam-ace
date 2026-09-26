/**
 * 一條正確率。
 *
 * 🛑 六條全部【同一個顏色】。長度已經表達了大小，再用色相講一次
 *    是把唯一的自由通道浪費在已經看得到的資訊上，
 *    而且顏色深淺會讓人以為那是另一個維度。
 *
 * 細的、圓端、軌道比表面淡一階 —— 圖表的線條要讓位給數字。
 */
export function AccuracyBar({
  label, sublabel, value, right,
}: {
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  /** 0–1 */
  value: number;
  right?: React.ReactNode;
}) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
          {sublabel && (
            <span className="text-xs text-muted-foreground shrink-0">{sublabel}</span>
          )}
        </div>
        <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      {right && <div className="mt-1 text-xs text-muted-foreground">{right}</div>}
    </div>
  );
}
