/**
 * 逐詞比對的自我檢查（不需要網路、不需要瀏覽器）
 *
 *   npm run verify:correction-diff
 *
 * 這支工具唯一的職責是【把差異指出來】，所以要證明的也只有幾件事：
 *
 *   D1 沒改到的字不能被標成改過（誤報會讓學生去改本來就對的地方）
 *   D2 改過的字一定要標出來（漏報等於這個功能不存在）
 *   D3 重組回去的文字必須與原字串【完全相同】——標色不能吃掉或重排任何字元
 *   D4 兩段完全無關時回 worthShowing: false（整段標色等於沒標）
 *   D5 極端輸入不能爆（空字串、超長、只有空白）
 *
 * 🛑 D3 最容易被忽略。一個會掉空格的實作在短句上看起來完全正常，
 *    到了長句才會讓學生看到黏在一起的英文——而那時已經上線了。
 */

import { diffCorrection, type DiffSegment } from "../src/lib/writing/correctionDiff";

let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

const join = (segs: DiffSegment[]): string => segs.map((s) => s.text).join("");
const textOf = (segs: DiffSegment[], kind: DiffSegment["kind"]): string =>
  segs.filter((s) => s.kind === kind).map((s) => s.text.trim()).join(" ");

// ── D1 + D2 + D3：最小修正 ───────────────────────────────
{
  const q = "Many student thinks that it is good.";
  const c = "Many students think that it is good.";
  const d = diffCorrection(q, c);

  check(d.worthShowing, "D2 最小修正被認為值得標示");
  check(textOf(d.quote, "removed") === "student thinks", "D2 原文標出 student thinks");
  check(textOf(d.correction, "added") === "students think", "D2 修正標出 students think");
  check(
    !textOf(d.quote, "removed").includes("Many") &&
      !textOf(d.quote, "removed").includes("good"),
    "D1 沒改到的字沒有被標成改過",
  );
  check(join(d.quote) === q, "D3 原文重組後與輸入完全相同");
  check(join(d.correction) === c, "D3 修正重組後與輸入完全相同");
}

// ── D3：多重空白與換行不能被吃掉 ─────────────────────────
{
  const q = "He  go   to\nschool.";
  const c = "He  goes   to\nschool.";
  const d = diffCorrection(q, c);
  check(join(d.quote) === q, "D3 多重空白與換行原樣保留（原文）");
  check(join(d.correction) === c, "D3 多重空白與換行原樣保留（修正）");
  check(textOf(d.quote, "removed") === "go", "D2 只標出 go");
}

// ── 整句改寫仍然標得出差異 ───────────────────────────────
{
  const q = "Although the weather was bad, but we still decided to going outside yesterday.";
  const c = "Although the weather was bad, we still decided to go outside yesterday.";
  const d = diffCorrection(q, c);
  check(d.worthShowing, "整句改寫仍然值得標示");
  check(textOf(d.quote, "removed") === "but going", "整句改寫也只標出真正動到的字");
  check(textOf(d.correction, "added") === "go", "整句改寫的新字被標出");
  check(join(d.quote) === q && join(d.correction) === c, "D3 整句改寫重組正確");
}

// ── 只加字 / 只刪字 ──────────────────────────────────────
{
  const d = diffCorrection("I go school.", "I go to school.");
  check(textOf(d.correction, "added") === "to", "只加字：標出 to");
  check(textOf(d.quote, "removed") === "", "只加字：原文沒有東西被標成刪除");
}
{
  const d = diffCorrection("I did not went there.", "I did not go there.");
  check(textOf(d.quote, "removed") === "went", "只改一個字：標出 went");
  check(textOf(d.correction, "added") === "go", "只改一個字：標出 go");
}

// ── D4：完全無關 ─────────────────────────────────────────
{
  const d = diffCorrection("apple banana cherry", "xxx yyy zzz");
  check(!d.worthShowing, "D4 一個字都沒共用 → worthShowing false");
  check(
    join(d.quote) === "apple banana cherry" && join(d.correction) === "xxx yyy zzz",
    "D4 不值得標示時文字仍然完整",
  );
}

// ── D5：極端輸入 ─────────────────────────────────────────
{
  const empty = diffCorrection("", "something");
  check(!empty.worthShowing && join(empty.correction) === "something", "D5 空的原文不會爆");

  const blank = diffCorrection("   ", "   ");
  check(!blank.worthShowing, "D5 只有空白 → 不值得標示");

  const long = "word ".repeat(500);
  const d = diffCorrection(long, long + "extra");
  check(!d.worthShowing, "D5 超過上限 → 不比對，回 worthShowing false");
  check(join(d.quote) === long, "D5 超過上限時文字仍然完整");
}

// ── 大小寫是真的差異，不可忽略 ───────────────────────────
{
  const d = diffCorrection("he is tired.", "He is tired.");
  check(textOf(d.quote, "removed") === "he", "大小寫差異有被視為差異");
}

console.log("");
if (failures > 0) {
  console.error(`${failures} 項未通過`);
  process.exit(1);
}
console.log("全部通過");
