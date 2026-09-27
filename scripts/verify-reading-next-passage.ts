/**
 * 「下一篇練哪一篇」的規則測試。
 *
 * 用 tsx 直接跑：npx tsx scripts/verify-reading-next-passage.ts
 */
import {
  pickNext, progressByPassage, progressOf,
  type PassageProgress, type SessionRow,
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

// ── E. session → 每篇的狀態 ─────────────────────────────────────────
{
  const sess = (id: string, passage: string,
                status: SessionRow["status"], started: string): SessionRow =>
    ({ id, passage_id: passage, status, started_at: started });

  // 🛑 這一條是實際踩到的 bug：點進文章看一眼就會留下一筆 IN_PROGRESS，
  //    而首頁對著一個從來沒作答過的人說「繼續上次練習」。
  const opened = progressByPassage(
    [sess("s1", "KR0001", "IN_PROGRESS", "2026-09-26T10:00:00Z")], new Set());
  check(opened.size === 0,
    "🛑 E1 一題都沒答的 IN_PROGRESS 不算進度——點進去看一眼不是做到一半");

  const answered = progressByPassage(
    [sess("s1", "KR0001", "IN_PROGRESS", "2026-09-26T10:00:00Z")], new Set(["s1"]));
  check(answered.get("KR0001")?.status === "IN_PROGRESS",
    "E2 答過至少一題就算做到一半");

  // 交過之後重做：新開的 IN_PROGRESS 不能蓋掉「這篇練過了」
  const redo = progressByPassage([
    sess("s2", "KR0001", "IN_PROGRESS", "2026-09-26T12:00:00Z"),
    sess("s1", "KR0001", "SUBMITTED",   "2026-09-25T10:00:00Z"),
  ], new Set(["s1", "s2"]));
  check(redo.get("KR0001")?.status === "SUBMITTED",
    "🛑 E3 交過就是交過，重做開的新 session 不會把它蓋回未完成");

  check(progressByPassage(
    [sess("s1", "KR0001", "ABANDONED", "2026-09-26T10:00:00Z")], new Set(["s1"])).size === 0,
    "E4 放棄的不算");

  // 同一篇多筆未完成 → 留最後開始的時間（sessions 依 started_at 遞減）
  const many = progressByPassage([
    sess("s2", "KR0001", "IN_PROGRESS", "2026-09-26T12:00:00Z"),
    sess("s1", "KR0001", "IN_PROGRESS", "2026-09-25T10:00:00Z"),
  ], new Set(["s1", "s2"]));
  check(many.get("KR0001")?.startedAt === "2026-09-26T12:00:00Z",
    "E5 同一篇多筆未完成時記住最後開始的時間");

  // 串起來：看過但沒答的那一篇，應該還是「下一篇」而不是「繼續」
  const map = progressByPassage(
    [sess("s1", "KR0001", "IN_PROGRESS", "2026-09-26T10:00:00Z")], new Set());
  const items: PassageProgress[] = ["KR0001", "KR0002"].map((id) => ({
    passage_id: id,
    sessionStatus: map.get(id)?.status ?? null,
    startedAt: map.get(id)?.startedAt ?? null,
  }));
  const r = pickNext(items);
  check(r.kind === "next" && r.passageId === "KR0001",
    "🛑 E6 只點開過沒作答的那一篇，首頁是【開始練習】而且就從它開始");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
