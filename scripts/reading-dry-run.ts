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
import {
  detectConstructs, isPlaceholder, missingColumns, parseRow,
  skillsUnparseable, unusedColumns,
  type ParsedPassage,
} from "../src/lib/reading/parseSourceRow";

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

// ── 欄位相容性 ──────────────────────────────────────
// 🛑 少一欄不會讓解析失敗，它會靜默變成 null。所以要分得出
//    「檔案沒有這一欄」與「有但值是空的」——前者是格式差異，後者是資料缺漏。
rule("欄位相容性");
const missing = missingColumns(headers);
const unused = unusedColumns(headers);
if (missing.length === 0) line("✅ schema 會用到的欄位全部都在");
else {
  line(`⚠️ 缺少 ${missing.length} 個 schema 會用到的欄位（會靜默變成 null）：`);
  for (const m of missing) line(`   ${m.column.padEnd(30)} ${m.effect}`);
}
if (unused.length > 0) {
  line();
  line(`ℹ️ 這份檔案有、但匯入不使用的欄位 ${unused.length} 個`);
  if (unused.length <= 12) for (const u of unused) line(`   ${u}`);
  else line(`   （前 12 個）${unused.slice(0, 12).join(", ")} …`);
}

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

// ── 分類值 ──────────────────────────────────────────
// 🛑 這兩欄沒有 CHECK 約束（新批次會帶新值，鎖白名單會大量誤殺），
//    代價是【打錯字的分類值不會被擋下】。所以這裡把值列出來，
//    讓人用眼睛看一遍——「Plants & Fungi」與「Plants and Fungi」
//    在資料庫裡是兩個不同的分類，但在畫面上看起來幾乎一樣。
rule("分類值（沒有白名單，請目視檢查有無錯字或重複）");
for (const field of ["contentFamily", "subdomain"] as const) {
  const c = new Map<string, number>();
  for (const p of parsed) {
    const v = p[field] ?? "（空白）";
    c.set(v, (c.get(v) ?? 0) + 1);
  }
  const sorted = [...c].sort((a, b) => b[1] - a[1]);
  line(`${field}：${sorted.length} 種`);
  const show = field === "subdomain" ? sorted.slice(0, 8) : sorted;
  for (const [v, n] of show) line(`   ${String(n).padStart(4)}  ${v}`);
  if (show.length < sorted.length) line(`   …另外 ${sorted.length - show.length} 種`);
  line();
}

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

// 🛑 格式漂移偵測：儲存格有內容、卻一個 skill 都解析不出來。
//    那跟「本來就沒有 skill」在結果上長得一樣，所以要單獨數。
let drift = 0;
for (const r of withId) {
  for (const { prefix } of det.found) {
    if (skillsUnparseable(r[`${prefix}_micro_skill_profile_json`])) drift++;
  }
}
if (drift > 0) {
  line(`⚠️ 有內容卻解析出 0 個 skill 的儲存格：${drift} 個 —— 格式可能換了，請看一筆原始值`);
} else {
  line(`✅ 沒有「有內容卻解析不出來」的儲存格`);
}

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
  const bad = p.questions.filter((q) => q.problems.length > 0);
  const absent = CONSTRUCTS.filter((c) => !p.questions.some((q) => q.construct === c));
  // 多數情況是「同一個原因壞在好幾個 construct」，逐題展開會刷滿畫面。
  const kinds = [...new Set(bad.flatMap((q) => q.problems))];
  const parts: string[] = [];
  if (p.problems.length) parts.push(p.problems.join("、"));
  if (absent.length) parts.push(`完全沒有 ${absent.join("/")}`);
  if (bad.length) parts.push(`${bad.map((q) => q.construct).join("/")} → ${kinds.join("、")}`);
  line(`${p.passageId.padEnd(10)} ${parts.join(" ; ")}`);
}

rule("結論");
line(`可上架 ${parsed.filter((p) => p.publishReady).length} 篇  ·  需修正 ${blocked.length} 篇`);
line(`🛑 這支只做體檢，沒有產生任何 SQL，也沒有連線任何環境。`);
line();
