import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";

/** 共用雷達圖：只吃 short label，避免行動裝置上文字溢出 */
export const RadarPanel = ({
  data,
  color = "hsl(var(--secondary))",
}: {
  data: { short: string; value: number }[];
  color?: string;
}) => (
  <div className="h-[240px] w-full overflow-hidden">
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="short"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={2} />
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
      <p className="text-sm font-semibold text-foreground mb-3">{label}</p>
      <div className="flex items-end gap-2 h-24">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-xs text-muted-foreground tabular-nums">{d.value}</span>
            <div
              className="w-full rounded-t-sm bg-primary/70"
              style={{ height: `${(d.value / max) * 100}%` }}
            />
            <span className="text-xs text-muted-foreground truncate w-full text-center">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
