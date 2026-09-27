/**
 * 「下一篇練哪一篇」的規則測試。
 *
 * 用 tsx 直接跑：npx tsx scripts/verify-reading-next-passage.ts
 */
import {
  pickNext, progressOf, type PassageProgress,
} from "../src/lib/reading/nextPassage";

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const p = (
  id: string,
  sessionStatus: PassageProgress["sessionStatus"] = null,
  startedAt: string | null = null,
): PassageProgress => ({ passage_id: id, sessionStatus, startedAt });

console.log("");
console.log("════════ 下一篇的挑選 ════════");

// ── A. 基本 ─────────────────────────────────────────────────────────
{
  check(pickNext([]).kind === "empty", "A1 一篇都沒有時是 empty，不是 done");

  const r = pickNext([p("KR0001"), p("KR0002")]);
  check(r.kind === "next" && r.passageId === "KR0001", "A2 全新的話挑第一篇");

  const r2 = pickNext([
    p("KR0001", "SUBMITTED"), p("KR0002", "SUBMITTED"), p("KR0003"),
  ]);
  check(r2.kind === "next" && r2.passageId === "KR0003",
    "A3 跳過已完成的，挑下一篇沒練過的");

  check(pickNext([p("KR0001", "SUBMITTED")]).kind === "done",
    "A4 全部練完是 done");
}

// ── B. 未完成優先 ───────────────────────────────────────────────────
{
  const r = pickNext([
    p("KR0001", "SUBMITTED"),
    p("KR0002", "IN_PROGRESS", "2026-09-20T10:00:00Z"),
    p("KR0003"),
  ]);
  check(r.kind === "resume" && r.passageId === "KR0002",
    "🛑 B1 做到一半的優先於沒練過的——否則那筆紀錄永遠留在半路");

  const r2 = pickNext([
    p("KR0001", "IN_PROGRESS", "2026-09-20T10:00:00Z"),
    p("KR0005", "IN_PROGRESS", "2026-09-25T09:00:00Z"),
  ]);
  check(r2.kind === "resume" && r2.passageId === "KR0005",
    "B2 多筆未完成時挑最後開始的那一筆（那是他記得的那篇）");

  const r3 = pickNext([
    p("KR0001", "IN_PROGRESS", null),
    p("KR0005", "IN_PROGRESS", null),
  ]);
  check(r3.kind === "resume" && r3.passageId === "KR0001",
    "B3 都沒有 startedAt 時先到先贏，不是隨機");

  const r4 = pickNext([
    p("KR0001", "IN_PROGRESS", "2026-09-20T10:00:00Z"),
    p("KR0005", "IN_PROGRESS", null),
  ]);
  check(r4.kind === "resume" && r4.passageId === "KR0001",
    "🛑 B4 缺 startedAt 的不會插隊贏過有時間的那筆");
}

// ── C. 穩定性 ───────────────────────────────────────────────────────
{
  // 同一份輸入連按兩次要得到同一篇。做不到的話，學生中斷回來會換一篇。
  const items = [p("KR0001", "SUBMITTED"), p("KR0002"), p("KR0003")];
  const a = pickNext(items);
  const b = pickNext(items);
  check(a.kind === b.kind && (a as { passageId?: string }).passageId
        === (b as { passageId?: string }).passageId,
    "🛑 C1 同一份輸入永遠挑到同一篇");

  check(JSON.stringify(items) ===
        JSON.stringify([p("KR0001", "SUBMITTED"), p("KR0002"), p("KR0003")]),
    "C2 不會就地改動傳進來的陣列");
}

// ── D. 完成度 ───────────────────────────────────────────────────────
{
  const items = [
    p("KR0001", "SUBMITTED"), p("KR0002", "IN_PROGRESS"), p("KR0003"),
  ];
  const g = progressOf(items);
  check(g.done === 1 && g.total === 3,
    "🛑 D1 做到一半【不算完成】——算進去等於告訴學生他練過了");
  check(progressOf([]).total === 0, "D2 空的不會除以零");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
