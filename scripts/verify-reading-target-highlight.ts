/**
 * 「標第幾次出現」的規則測試。
 *
 * 用 tsx 直接跑：npx tsx scripts/verify-reading-target-highlight.ts
 */
import {
  hasMark, highlightParagraphs, paragraphsOf, type Segment,
} from "../src/lib/reading/targetHighlight";

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

/** 被標起來的那一段（沒有就是 null） */
const markedOf = (paras: Segment[][]): string | null => {
  for (const segs of paras) for (const s of segs) if (s.marked) return s.text;
  return null;
};
/** 還原成純文字，用來確認一個字都沒有多也沒有少 */
const flatten = (paras: Segment[][]): string =>
  paras.map((segs) => segs.map((s) => s.text).join("")).join("\n\n");

const TEXT = [
  "The map looked settled, and everyone believed it.",
  "But the matter was not settled at all.",
  "Years later the mountain settled back into place.",
].join("\n\n");

console.log("");
console.log("════════ 標第幾次出現 ════════");

// ── A. 基本 ─────────────────────────────────────────────────────────
{
  check(paragraphsOf(TEXT).length === 3, "A1 空行分段");

  const first = highlightParagraphs(TEXT, "settled", 1);
  check(markedOf(first) === "settled", "A2 標得到第一次");
  check(first[0].some((s) => s.marked) && !first[1].some((s) => s.marked),
    "A3 而且標在第一段，不是別段");

  const second = highlightParagraphs(TEXT, "settled", 2);
  check(second[1].some((s) => s.marked) && !second[0].some((s) => s.marked),
    "🛑 A4 第 2 次在第二段——次序是【跨整篇】數的，不是每段各數各的");

  const third = highlightParagraphs(TEXT, "settled", 3);
  check(third[2].some((s) => s.marked), "A5 第 3 次在第三段");
}

// ── B. 只標一個 ─────────────────────────────────────────────────────
{
  const r = highlightParagraphs(TEXT, "settled", 2);
  const count = r.flat().filter((s) => s.marked).length;
  check(count === 1, "🛑 B1 只標【一個】——看到同一個字就全部標粗是這次要修掉的毛病");
}

// ── C. 一個字都不能多也不能少 ───────────────────────────────────────
{
  for (const n of [1, 2, 3, 9]) {
    const r = highlightParagraphs(TEXT, "settled", n);
    if (flatten(r) !== TEXT) { check(false, `C1 第 ${n} 次：文字被改動了`); break; }
  }
  check(flatten(highlightParagraphs(TEXT, "settled", 2)) === TEXT,
    "🛑 C1 切片之後合回來要跟原文一模一樣");
}

// ── D. 詞界（與 SQL 同一套規則）─────────────────────────────────────
{
  const t = "They unsettled the settlement, then settled it.";
  const r = highlightParagraphs(t, "settled", 1);
  const marked = r[0].findIndex((s) => s.marked);
  const before = r[0].slice(0, marked).map((s) => s.text).join("");
  check(before.includes("unsettled") && before.includes("settlement"),
    "🛑 D1 unsettled 與 settlement 都不算——詞界規則要跟 SQL 一致");

  check(markedOf(highlightParagraphs("The Settled map.", "settled", 1)) === "Settled",
    "D2 大小寫不分，但標出來的是【原文的寫法】");

  check(markedOf(highlightParagraphs("a well-known fact", "well-known", 1)) === "well-known",
    "D3 含連字號的片語標得到");

  check(markedOf(highlightParagraphs("cost $5 (net) today", "$5 (net)", 1)) === "$5 (net)",
    "D4 正規表示式的特殊字元會被跳脫，不會當成語法");
}

// ── E. 找不到就不標 ─────────────────────────────────────────────────
{
  check(markedOf(highlightParagraphs(TEXT, "settled", 4)) === null,
    "🛑 E1 要第 4 次但只有 3 次 → 什麼都不標，【不會退回第一個】");
  check(markedOf(highlightParagraphs(TEXT, "humble", 1)) === null,
    "🛑 E2 文章裡沒有那個字 → 什麼都不標");
  check(markedOf(highlightParagraphs(TEXT, null, null)) === null, "E3 沒有 anchor 就不標");
  check(markedOf(highlightParagraphs(TEXT, "settled", null)) === null,
    "🛑 E4 只有文字沒有次數 → 不標（資料庫的 CHECK 也擋這種組合）");
  check(markedOf(highlightParagraphs(TEXT, "settled", 0)) === null, "E5 次數 0 不合法，不標");
  check(markedOf(highlightParagraphs(TEXT, "   ", 1)) === null, "E6 空白字串不標");

  check(hasMark(highlightParagraphs(TEXT, "settled", 2)), "E7 hasMark 認得標到了");
  check(!hasMark(highlightParagraphs(TEXT, "settled", 9)), "E8 沒標到就是 false");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
