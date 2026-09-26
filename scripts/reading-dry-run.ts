/**
 * Six-Way Reading 題庫的匯入前體檢（唯讀，不碰資料庫）
 *
 *   npm run reading:dry-run -- <來源.xlsx>
 *
 * 只讀檔、只印報告。不產生 SQL、不連任何環境。
 *
 * 🛑 這支【不會】把題庫內容印出來，也不會寫進 repo。
 *    報告只有統計與 passage_id —— 題幹、選項、正解、解說一律不外流。
 *    要看內容請直接開來源檔。
 *
 * 🛑 六個 construct 一律從實際欄位名推導。任何硬編碼的前綴猜測
 *    都會在資料換版時悄悄給出錯的答案——2026-09-26 就發生過一次。
 */

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { CONSTRUCTS, CONSTRUCT_LABEL_ZH } from "../src/lib/reading/constructs";
import { detectConstructs, isPlaceholder, parseRow, type ParsedPassage } from "../src/lib/reading/parseSourceRow";

const file = process.argv[2];
if (!file) {
  console.error("用法：npm run reading:dry-run -- <來源.xlsx>");
  process.exit(1);
}

// xlsx 的 ESM 進入點是瀏覽器版，沒有 readFile（它需要 fs）。自己讀進來就好。
const wb = XLSX.read(readFileSync(file), { type: "buffer" });
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
const headers = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? [])
  .filter((h): h is string => typeof h === "string" && h.length > 0);
const headerSet = new Set(headers);

const line = (s = "") => console.log(s);
const rule = (t: string) => { line(); line(`━━━ ${t} ${"━".repeat(Math.max(0, 58 - t.length))}`); };

rule("來源");
line(`檔案      ${file}`);
line(`工作表    ${sheetName}（共 ${wb.SheetNames.length} 個）`);
line(`欄位      ${headers.length}`);
line(`資料列    ${rows.length}`);

// ── construct 推導 ──────────────────────────────────
rule("Construct 推導（從實際欄位名，非硬編碼）");
const det = detectConstructs(headers);
line(`找到      ${det.found.map((f) => `${f.prefix}→${f.construct}`).join("  ")}`);
if (det.unknownPrefixes.length) line(`⚠️ 不認得  ${det.unknownPrefixes.join(", ")}`);
if (det.missingConstructs.length) line(`⚠️ 缺少    ${det.missingConstructs.join(", ")}`);
else line(`✅ 六個 construct 全部存在`);

// ── 解析 ────────────────────────────────────────────
const withId = rows.filter((r) => {
  const v = r["topic_id"];
  return v !== null && v !== undefined && String(v).trim().length > 0;
});
const parsed: ParsedPassage[] = withId.map((r) => parseRow(r, headers));

// 重複的 passage_id
const idCount = new Map<string, number>();
for (const p of parsed) idCount.set(p.passageId, (idCount.get(p.passageId) ?? 0) + 1);
const dupIds = [...idCount.entries()].filter(([, n]) => n > 1);

rule("總量");
line(`有 topic_id 的列        ${parsed.length}（${rows.length - parsed.length} 列空白）`);
line(`可上架（六題全完整）     ${parsed.filter((p) => p.publishReady).length}`);
line(`可入庫但不可上架         ${parsed.filter((p) => !p.publishReady && p.passageText).length}`);
line(`連入庫都不行（無內文）   ${parsed.filter((p) => !p.passageText).length}`);
line(`重複的 passage_id        ${dupIds.length}${dupIds.length ? "  " + dupIds.map(([id, n]) => `${id}×${n}`).join(", ") : ""}`);

// ── 內文來源 ────────────────────────────────────────
rule("內文來源（final → revised → writer 取第一個有效的）");
for (const s of ["FINAL", "REVISED", "WRITER"] as const) {
  line(`${s.padEnd(9)} ${parsed.filter((p) => p.contentSource === s).length} 篇`);
}
const phTitle = withId.filter((r) => isPlaceholder(r["passage_final_title"], headerSet)).length;
const phText  = withId.filter((r) => isPlaceholder(r["passage_final_text"],  headerSet)).length;
const phRev   = withId.filter((r) => isPlaceholder(r["passage_revised_text"], headerSet)).length;
line();
line(`⚠️ 值等於欄位名稱（未解析的參照，不可當內容）：`);
line(`   passage_final_title   ${phTitle}/${parsed.length}`);
line(`   passage_final_text    ${phText}/${parsed.length}`);
line(`   passage_revised_text  ${phRev}/${parsed.length}`);

// ── CEFR ────────────────────────────────────────────
rule("CEFR");
const cefr = new Map<string, number>();
for (const p of parsed) cefr.set(p.cefrLevel ?? "（無效或空白）", (cefr.get(p.cefrLevel ?? "（無效或空白）") ?? 0) + 1);
for (const [k, v] of [...cefr].sort()) line(`${k.padEnd(14)} ${v}`);

// ── 每個 construct 的完整度 ─────────────────────────
rule("每個 Construct 的完整度");
line(`${"".padEnd(4)} ${"完整".padStart(5)} ${"缺題幹".padStart(6)} ${"選項不足".padStart(8)} ${"缺正解".padStart(6)} ${"正解無對應".padStart(10)} ${"缺解說".padStart(6)}`);
for (const c of CONSTRUCTS) {
  const qs = parsed.map((p) => p.questions.find((q) => q.construct === c)).filter(Boolean);
  const count = (pred: (s: string) => boolean) =>
    qs.filter((q) => q!.problems.some(pred)).length;
  const ok = qs.filter((q) => q!.problems.length === 0).length;
  line(
    `${c.padEnd(4)} ${String(ok).padStart(5)} ${String(count((s) => s === "缺題幹")).padStart(6)} ` +
    `${String(count((s) => s.startsWith("選項只有"))).padStart(8)} ${String(count((s) => s === "缺正解")).padStart(6)} ` +
    `${String(count((s) => s.includes("沒有對應"))).padStart(10)} ${String(count((s) => s === "缺解說")).padStart(6)}` +
    `   ${CONSTRUCT_LABEL_ZH[c]}`
  );
}

// ── micro-skill ─────────────────────────────────────
rule("Micro-skill（v1 只存不分析）");
const skillNames = new Map<string, number>();
let skillTotal = 0, skillNull = 0;
for (const p of parsed) for (const q of p.questions) for (const s of q.skills) {
  skillTotal++;
  if (s.emphasis === null) skillNull++;
  skillNames.set(s.skillCode, (skillNames.get(s.skillCode) ?? 0) + 1);
}
line(`skill 種類 ${skillNames.size}  總筆數 ${skillTotal}  emphasis 為空 ${skillNull}（${((skillNull / Math.max(skillTotal, 1)) * 100).toFixed(1)}%）`);
line(`🛑 空值存成 NULL，不是 0。NULL = 沒有這個資訊。`);

// ── 段落與詞彙 ──────────────────────────────────────
rule("段落地圖與詞彙");
line(`有段落地圖的文章  ${parsed.filter((p) => p.paragraphs.length > 0).length}／${parsed.length}`);
line(`段落總數          ${parsed.reduce((n, p) => n + p.paragraphs.length, 0)}`);
line(`有詞彙的文章      ${parsed.filter((p) => p.vocab.length > 0).length}／${parsed.length}`);
for (const t of ["CANDIDATE", "ACADEMIC", "KNOWLEDGE"] as const) {
  line(`  ${t.padEnd(10)} ${parsed.reduce((n, p) => n + p.vocab.filter((v) => v.tier === t).length, 0)} 筆`);
}
line(`🛑 lexical_items 自動比對：v1 不做（VC 題考的字只有少數出現在 CANDIDATE 清單裡）`);

// ── 被擋下的文章 ────────────────────────────────────
rule("被擋下的文章（不可上架）");
const blocked = parsed.filter((p) => !p.publishReady);
if (blocked.length === 0) line("（無）");
for (const p of blocked) {
  const reasons: string[] = [...p.problems];
  for (const q of p.questions) {
    if (q.problems.length) reasons.push(`${q.construct}: ${q.problems.join("、")}`);
  }
  const missing = CONSTRUCTS.filter((c) => !p.questions.some((q) => q.construct === c));
  if (missing.length) reasons.push(`完全沒有 ${missing.join("/")}`);
  line(`${p.passageId.padEnd(10)} ${reasons.join(" ; ")}`);
}

rule("結論");
line(`可上架 ${parsed.filter((p) => p.publishReady).length} 篇  ·  需修正 ${blocked.length} 篇`);
line(`🛑 這支只做體檢，沒有產生任何 SQL，也沒有連線任何環境。`);
line();
