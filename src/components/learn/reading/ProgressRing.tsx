/**
 * 小小的環形進度。
 *
 * 🛑 細的線、圓端、軌道只比表面深一階——圖表的線條要讓位給數字。
 *    環本身不帶意義色，顏色由呼叫端給（最弱／最穩定／一般），
 *    因為「這是什麼狀態」是卡片的事，不是這個形狀的事。
 */
export function ProgressRing({
  value, size = 48, tone = "text-primary",
}: {
  /** 0–1 */
  value: number;
  size?: number;
  tone?: string;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0"
         role="img" aria-label={`${Math.round(pct * 100)}%`}>
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className="stroke-muted"
      />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={`${tone} stroke-current transition-all`}
      />
    </svg>
  );
}
