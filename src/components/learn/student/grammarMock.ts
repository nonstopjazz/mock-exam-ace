import { GRAMMAR_TOPICS, type GrammarMainTopic } from "@/data/grammar-topics";

/**
 * 文法分析的模擬資料。
 *
 * 🛑 這是【假資料】，UI 上一律明講。文法系統上線後，這一支會換成真實的
 *    答題統計，元件不需要改。
 *
 * 為什麼不用 data/grammar-topics.ts 裡的 generateMockGrammarData()：
 * 那一支每次呼叫都重新 Math.random()，而且是在 render 裡呼叫的 ——
 * 每次重繪數字就會跳一次。學生看到自己的「熟練度」每秒變一次，
 * 就算標明是模擬資料也只會覺得系統壞了。
 *
 * 這裡改用「由名稱推導」的穩定亂數：同一個主題永遠得到同一個數字，
 * 重新整理、換裝置、換帳號都一樣。
 */

/** FNV-1a：小、無相依、雪崩效果足夠讓相鄰主題不會拿到相近的數字。 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (n: number) => Math.max(45, Math.min(97, n));

/**
 * 每個大主題先有自己的「底子」（58–93），子主題再在上下 12 分內浮動。
 *
 * 為什麼不是每個子主題各自 50–95 亂數：那樣一平均，13 個大主題會全部
 * 擠在 72 上下，圓餅圖看起來整片同一個顏色，四個等第等於白做。
 * 真實的學生本來就是有的主題強、有的主題弱。
 */
const baseOf = (mainName: string) => 58 + (hash(mainName) % 36);
const accuracyOf = (mainName: string, path: string) =>
  clamp(baseOf(mainName) + (hash(path) % 25) - 12);

const avg = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);

/**
 * 一次算出整棵樹：子主題是亂數，中主題與大主題是它們的平均。
 * 大主題的數字因此和它底下的中主題對得起來 —— 圓餅圖與右邊的清單
 * 讀的是同一份資料，不會互相打架。
 */
export function buildGrammarMock(): GrammarMainTopic[] {
  return GRAMMAR_TOPICS.map((main) => {
    const middleTopics = main.middleTopics.map((middle) => {
      const subTopics = middle.subTopics.map((sub) => ({
        ...sub,
        accuracy: accuracyOf(main.name, `${main.name}/${middle.name}/${sub.name}`),
      }));
      return { ...middle, subTopics, accuracy: avg(subTopics.map((s) => s.accuracy)) };
    });
    return {
      ...main,
      middleTopics,
      accuracy: avg(middleTopics.map((m) => m.accuracy)),
    };
  });
}

/* ---------- 熟練度分級 ---------- */

export type GrammarBand = "EXCELLENT" | "GOOD" | "NEEDS_WORK" | "WEAK";

export const bandOf = (accuracy: number): GrammarBand =>
  accuracy >= 85 ? "EXCELLENT" : accuracy >= 70 ? "GOOD" : accuracy >= 60 ? "NEEDS_WORK" : "WEAK";

export const BAND_LABEL: Record<GrammarBand, string> = {
  EXCELLENT: "優秀",
  GOOD: "良好",
  NEEDS_WORK: "需加強",
  WEAK: "待改善",
};

export const BAND_RANGE: Record<GrammarBand, string> = {
  EXCELLENT: "≥ 85%",
  GOOD: "70–84%",
  NEEDS_WORK: "60–69%",
  WEAK: "< 60%",
};

/*
 * 顏色不放在這裡：等第的色階是從 CSS token 即時算出來的（見 GrammarSnapshot 的
 * useChartPalette），深色模式才不會壞掉。這一支只負責資料與分級。
 */
