import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";

/** 共用雷達圖：只吃 short label，避免行動裝置上文字溢出 */
export const RadarPanel = ({
  data,
  color = "hsl(var(--secondary))",
  className = "h-[300px] md:h-[340px]",
}: {
  data: { short: string; value: number }[];
  color?: string;
  className?: string;
}) => (
  <div className={`w-full overflow-hidden ${className}`}>
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="78%">
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="short"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.22} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  </div>
);

/** 共用小趨勢圖：以長條呈現，避免再引入第二種折線樣式 */
export const MiniTrend = ({
  data,
  label,
}: {
  data: { label: string; value: number }[];
  label: string;
}) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">{label}</p>
      <div className="flex items-end gap-2">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-xs text-muted-foreground tabular-nums">{d.value}</span>
            {/* 固定高度的軌道，百分比才有可解析的參考值 */}
            <div className="h-20 w-full flex items-end">
              <div
                className={`w-full rounded-t-sm ${
                  i === data.length - 1 ? "bg-secondary" : "bg-muted-foreground/30"
                }`}
                style={{ height: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground truncate w-full text-center">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
