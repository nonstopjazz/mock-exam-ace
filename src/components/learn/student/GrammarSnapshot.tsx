import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  XCircle,
} from "lucide-react";
import { Chart as ChartJS, ArcElement, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import {
  BAND_LABEL,
  BAND_RANGE,
  bandOf,
  buildGrammarMock,
  type GrammarBand,
} from "./grammarMock";
import { cn } from "@/lib/utils";
import { SURFACE, TYPE } from "./shared";

/**
 * 文法分析 —— Dashboard 最下方。
 *
 * 左邊是雙層同心圓（外圈大主題、內圈中主題），右邊是同一份資料的清單。
 * 兩邊讀的是同一棵樹，所以數字一定對得起來。
 *
 * 🛑 目前是模擬資料，畫面上直接講明，不用小字藏起來。
 *
 * 配色說明（給之後要動這一段的人）：
 *   熟練度是有方向的量 —— 低是壞、高是好 —— 所以用【發散配色】：
 *   兩個色相（success 綠 / destructive 紅）各出兩階，中間淺、兩端深。
 *   顏色不是唯一的區辨方式：圖例、tooltip 的百分比、右邊清單的圖示與
 *   文字標籤都各自把等第說清楚了。
 *
 *   四個色階都是從 CSS token 即時算出來的，不寫死 —— 寫死的話深色模式
 *   會整組壞掉，而 canvas 沒辦法直接吃 var()。
 */

ChartJS.register(ArcElement, Tooltip);

const BAND_ICON: Record<GrammarBand, typeof CheckCircle2> = {
  EXCELLENT: CheckCircle2,
  GOOD: CheckCircle2,
  NEEDS_WORK: AlertCircle,
  WEAK: XCircle,
};

const BANDS: GrammarBand[] = ["EXCELLENT", "GOOD", "NEEDS_WORK", "WEAK"];



/** "184 65% 42%" → [184, 65, 42]；讀不到就回傳 null，讓呼叫端自己給退路。 */
function readToken(name: string): [number, number, number] | null {
  if (typeof window === "undefined") return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** 以 token 為基準推一階顏色；alpha 用來做同一個顏色的淡底與描邊。 */
const step = (
  [h, s, l]: [number, number, number],
  ds: number,
  dl: number,
  alpha = 1,
): string =>
  alpha === 1
    ? `hsl(${h} ${clamp(s + ds)}% ${clamp(l + dl)}%)`
    : `hsl(${h} ${clamp(s + ds)}% ${clamp(l + dl)}% / ${alpha})`;

interface BandColor {
  /** 圓餅圖、長條、圖例小圓點 */
  solid: string;
  /** 徽章底色 */
  tint: string;
  /** 徽章描邊 */
  line: string;
}

interface ChartPalette {
  band: Record<GrammarBand, BandColor>;
  /** 圓餅圖切片之間的縫，用卡片底色才看得出是「隔開」而不是另一個顏色 */
  gap: string;
}

/**
 * 等第色階。
 *
 * 用的是站上既有的兩個色相 —— secondary（深青，代表學習）與 accent（赤陶，
 * 代表要處理的事）—— 不引進第三組配色。熟練度是有方向的量（低是壞、高是好），
 * 所以做成發散式：兩端深、中間淺，愈往青色愈好、愈往赤陶愈需要練。
 *
 * 深色模式下 token 會換一組值，因此監看 <html> 的 class，換了就重算。
 */
function useChartPalette(): ChartPalette {
  const compute = useCallback((): ChartPalette => {
    const good = readToken("--secondary") ?? [184, 65, 42];
    const weak = readToken("--accent") ?? [16, 75, 55];
    const card = readToken("--card") ?? [40, 40, 98];
    const band = (
      base: [number, number, number],
      ds: number,
      dl: number,
    ): BandColor => ({
      solid: step(base, ds, dl),
      tint: step(base, ds, dl, 0.14),
      line: step(base, ds, dl, 0.4),
    });
    return {
      band: {
        EXCELLENT: band(good, +10, -10),
        GOOD: band(good, -7, +11),
        NEEDS_WORK: band(weak, +5, +12),
        WEAK: band(weak, +3, -10),
      },
      gap: step(card, 0, 0),
    };
  }, []);

  const [palette, setPalette] = useState<ChartPalette>(compute);

  useEffect(() => {
    setPalette(compute());
    const observer = new MutationObserver(() => setPalette(compute()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [compute]);

  return palette;
}

/**
 * 圓餅圖包一層 memo。
 *
 * 展開／收合右邊的主題會讓這一區重繪，但圖的資料完全沒變 ——
 * memo 讓 react-chartjs-2 不必為此再跑一次 chart.update() 重畫 canvas。
 */
const Ring = memo(function Ring({
  data,
  options,
}: {
  data: React.ComponentProps<typeof Doughnut>["data"];
  options: React.ComponentProps<typeof Doughnut>["options"];
}) {
  return <Doughnut data={data} options={options} />;
});

const BandBar = ({
  value,
  band,
  color,
  className,
}: {
  value: number;
  band: GrammarBand;
  color: string;
  className?: string;
}) => (
  <div
    className={cn("h-1.5 w-full rounded-full bg-muted overflow-hidden", className)}
    role="img"
    aria-label={`熟練度 ${value}%，${BAND_LABEL[band]}`}
  >
    <div
      className="h-full rounded-full transition-all duration-300"
      style={{ width: `${value}%`, backgroundColor: color }}
    />
  </div>
);

export const GrammarSnapshot = () => {
  const data = useMemo(() => buildGrammarMock(), []);
  const palette = useChartPalette();
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /** 圖例上各等第有幾個大主題 —— 讓左邊那張卡不只是一張圖 */
  const counts = useMemo(() => {
    const empty: Record<GrammarBand, number> = {
      EXCELLENT: 0,
      GOOD: 0,
      NEEDS_WORK: 0,
      WEAK: 0,
    };
    return data.reduce((acc, main) => {
      acc[bandOf(main.accuracy ?? 0)] += 1;
      return acc;
    }, empty);
  }, [data]);

  /** 分數最低的三個大主題。整張圖看完之後，學生真正需要的是「那我先讀哪個」。 */
  const weakest = useMemo(
    () => [...data].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)).slice(0, 3),
    [data],
  );

  const opened = useMemo(
    () => data.find((main) => main.name === openTopic) ?? null,
    [data, openTopic],
  );

  const middles = useMemo(
    () => data.flatMap((main) => main.middleTopics.map((mid) => ({ ...mid, main: main.name }))),
    [data],
  );

  const select = useCallback((name: string) => {
    setOpenTopic((current) => (current === name ? null : name));
    // 從圓餅圖點過來時，右邊清單可能捲在畫面外
    setTimeout(() => rowRefs.current[name]?.scrollIntoView({ block: "nearest" }), 50);
  }, []);

  const chartData = useMemo(
    () => ({
      // labels 只用於內圈；外圈的名稱在 tooltip 裡自己查表，
      // 兩個 dataset 長度不同，共用一份 labels 會對錯名字。
      labels: middles.map((m) => m.name),
      datasets: [
        {
          label: "中主題",
          data: middles.map((m) => m.accuracy ?? 0),
          backgroundColor: middles.map((m) => palette.band[bandOf(m.accuracy ?? 0)].solid),
          borderColor: palette.gap,
          borderWidth: 2,
        },
        {
          label: "大主題",
          data: data.map((m) => m.accuracy ?? 0),
          backgroundColor: data.map((m) => palette.band[bandOf(m.accuracy ?? 0)].solid),
          borderColor: palette.gap,
          borderWidth: 2,
        },
      ],
    }),
    [data, middles, palette],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "38%",
      onClick: (_event: unknown, elements: { datasetIndex: number; index: number }[]) => {
        if (elements.length === 0) return;
        const { datasetIndex, index } = elements[0];
        const name =
          datasetIndex === 1 ? data[index]?.name : middles[index]?.main;
        if (name) select(name);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { datasetIndex: number; dataIndex: number; parsed: number }) => {
              const name =
                ctx.datasetIndex === 1
                  ? data[ctx.dataIndex]?.name
                  : middles[ctx.dataIndex]?.name;
              const band = bandOf(ctx.parsed);
              return `${name}：${ctx.parsed}% · ${BAND_LABEL[band]}`;
            },
          },
        },
      },
    }),
    [data, middles, select],
  );

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className={TYPE.sectionHeading}>文法分析</h2>
      </div>

      <Alert className="mb-4 border-warning/30 bg-warning/10">
        <FlaskConical className="h-4 w-4" />
        <AlertDescription className="text-foreground/85">
          此為模擬資料，文法系統上線後將提供真實資料。
        </AlertDescription>
      </Alert>

      {/* 5 欄切成 2 : 3 —— 右邊要排三張卡，對半分的話每張只剩約 170px，字會擠成一團 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* 左：雙層同心圓 */}
        <Card className={`lg:col-span-2 p-6 ${SURFACE.base}`}>
          <h3 className={TYPE.cardTitle}>文法分類總覽</h3>
          <p className={`${TYPE.micro} mt-1`}>
            外圈 {data.length} 個大主題，內圈 {middles.length} 個中主題；點一下可以看細節
            （下方數字是各等第的大主題數）
          </p>

          {/* maintainAspectRatio 關掉，改由外框決定尺寸：高度寫死，
              Chart.js 填滿它就好。用 aspect ratio 當高度並不可靠 ——
              重排當下量到的高度可能是 0。 */}
          <div className="mt-4 mx-auto w-full max-w-md h-64 sm:h-80">
            <Ring data={chartData} options={options} />
          </div>

          {/* 圖例：顏色不是唯一的區辨方式，每一級都有文字與範圍 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {BANDS.map((band) => {
              const Icon = BAND_ICON[band];
              return (
                <span key={band} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: palette.band[band].solid }}
                    aria-hidden="true"
                  />
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: palette.band[band].solid }}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-foreground">{BAND_LABEL[band]}</span>
                  <span className={TYPE.micro}>{BAND_RANGE[band]}</span>
                  <span className="text-xs font-semibold text-foreground tabular-nums">
                    {counts[band]}
                  </span>
                </span>
              );
            })}
          </div>

          {/* 看完圖之後真正要回答的問題：那我先讀哪個 */}
          <div className="mt-5 pt-4 border-t border-border/60">
            <p className={TYPE.micro}>先從這三個開始</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {weakest.map((main) => {
                const accuracy = main.accuracy ?? 0;
                const band = bandOf(accuracy);
                return (
                  <button
                    key={main.name}
                    type="button"
                    onClick={() => select(main.name)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: palette.band[band].solid }}
                      aria-hidden="true"
                    />
                    {main.name}
                    <span className="tabular-nums text-muted-foreground">{accuracy}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* 右：同一份資料的小卡 —— 也是圖表的替代讀法（顏色看不出來時照樣讀得到數字） */}
        <div className="lg:col-span-3">
          <h3 className={TYPE.cardTitle}>各大主題熟練度</h3>
          <p className={`${TYPE.micro} mt-1`}>點一張卡可以看它的中主題</p>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.map((main) => {
              const accuracy = main.accuracy ?? 0;
              const band = bandOf(accuracy);
              const Icon = BAND_ICON[band];
              const open = openTopic === main.name;

              return (
                <Card
                  key={main.name}
                  ref={(el) => (rowRefs.current[main.name] = el)}
                  className={cn(
                    "p-4 transition-all duration-200 hover:shadow-lg",
                    SURFACE.base,
                    open && "ring-2 ring-primary",
                  )}
                >
                  {/* 只有 button 綁 onClick。卡片外層也綁的話，點一下會觸發兩次，
                      展開又立刻收合。 */}
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => select(main.name)}
                    className="w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-sm font-semibold text-foreground min-w-0 truncate">
                        {main.name}
                      </span>
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className={TYPE.micro}>整體正確率</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Icon className="h-3.5 w-3.5" style={{ color: palette.band[band].solid }} />
                        {/* 數字穿文字色，顏色由旁邊的圖示與長條負責 ——
                            把數字染成等第色，在淺色階上會變成讀不清楚的低對比字 */}
                        <span className="text-lg font-bold tabular-nums text-foreground">
                          {accuracy}%
                        </span>
                      </span>
                    </div>

                    <BandBar
                      value={accuracy}
                      band={band}
                      color={palette.band[band].solid}
                      className="mt-1.5"
                    />

                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className={TYPE.micro}>{main.middleTopics.length} 個中主題</span>
                      <Badge
                        variant="outline"
                        className="text-[11px] font-normal shrink-0 text-foreground"
                        style={{
                          backgroundColor: palette.band[band].tint,
                          borderColor: palette.band[band].line,
                        }}
                      >
                        {BAND_LABEL[band]}
                      </Badge>
                    </div>
                  </button>
                </Card>
              );
            })}
          </div>

          {/* 細節放在網格【下方】，卡片才能維持一樣高、一樣寬 */}
          {opened ? (
            <Card className={`mt-3 p-4 ${SURFACE.base}`}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground truncate min-w-0">
                  {opened.name} · 中主題
                </h4>
                <button
                  type="button"
                  onClick={() => setOpenTopic(null)}
                  className={`${TYPE.micro} hover:text-foreground transition-colors shrink-0`}
                >
                  收合
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
                {opened.middleTopics.map((middle) => {
                  const midAccuracy = middle.accuracy ?? 0;
                  const midBand = bandOf(midAccuracy);
                  return (
                    <div key={middle.name} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground truncate min-w-0">
                        {middle.name}
                      </span>
                      <BandBar
                        value={midAccuracy}
                        band={midBand}
                        color={palette.band[midBand].solid}
                        className="h-1 w-16 ml-auto shrink-0"
                      />
                      <span
                        className="text-xs font-medium tabular-nums w-9 text-right shrink-0 text-foreground"
                      >
                        {midAccuracy}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
};
