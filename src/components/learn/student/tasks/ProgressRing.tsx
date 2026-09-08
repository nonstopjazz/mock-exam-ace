import { Check } from "lucide-react";

/**
 * 常態練習的當期進度環。Dashboard 與任務頁共用同一個，兩邊的視覺才不會各長各的。
 *
 * 🛑 進度為 0 時整段不畫：圓頭線帽會在 12 點鐘方向留下一個小點，看起來像壞掉。
 */
const R = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * R;

export const ProgressRing = ({
  percent,
  met,
  label,
  size = 46,
}: {
  percent: number;
  met: boolean;
  /** 環中央的字，通常是「2/3」。達成時會換成勾。 */
  label: string;
  size?: number;
}) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 36 36" style={{ width: size, height: size }} className="-rotate-90">
      <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3.2" className="stroke-muted" />
      {percent > 0 ? (
        <circle
          cx="18"
          cy="18"
          r={R}
          fill="none"
          strokeWidth="3.2"
          strokeLinecap="round"
          className={`transition-all duration-300 ${met ? "stroke-success" : "stroke-secondary"}`}
          strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        />
      ) : null}
    </svg>
    <span className="absolute inset-0 grid place-items-center">
      {met ? (
        <Check className="h-4 w-4 text-success" aria-hidden />
      ) : (
        <span className="text-[11px] font-bold tabular-nums text-foreground">{label}</span>
      )}
    </span>
  </div>
);
