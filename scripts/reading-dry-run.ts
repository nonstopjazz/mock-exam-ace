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
import {
  auditColumns, brokenColumns,
  type ColumnAudit, type ColumnCategory, type ColumnFate,
} from "../src/lib/reading/columnClassification";
import { toCanonicalPayload } from "../src/lib/reading/canonicalPayload";

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

// ── 全欄位盤點 ──────────────────────────────────────
// 🛑 分兩層看，不要混在一起：
//    結構分類只看欄位【名稱】（靜態、可預期）；
//    健康狀態看欄位【值】（只有拿到這一批資料才知道）。
//    `passage_final_text` 是 CORE 欄位【而且】整欄壞掉——
//    這兩件事同時為真，混在一起講就會失去其中一件。
rule("A. 全欄位分類");
const audits = auditColumns(headers, withId, det.found.map((f) => f.prefix));
const CAT_ZH: Record<ColumnCategory, string> = {
  CORE: "1 Core content", ENRICHMENT: "2 High-value enrichment",
  METADATA: "3 Useful metadata", PROVENANCE: "4 Provenance",
  PIPELINE: "5 Pipeline-only", UNKNOWN: "⚠️ 分類表不認得",
};
const FATE_ZH: Record<ColumnFate, string> = {
  CANONICAL: "進 payload", DERIVED: "解析後使用",
  IGNORED: "安全忽略", DEFERRED: "有價值，schema 未承接",
};
for (const cat of Object.keys(CAT_ZH) as ColumnCategory[]) {
  const group = audits.filter((a) => a.category === cat);
  if (group.length === 0) continue;
  line(`${CAT_ZH[cat]}  共 ${group.length} 欄`);
  // PIPELINE 有 96 欄，逐欄列出只會把真正要看的東西淹掉。
  const show = cat === "PIPELINE" ? group.filter((a) => a.nonEmpty > 0) : group;
  for (const a of show) {
    const mark = a.health === "PLACEHOLDER" ? "🛑" : a.health === "PARTIAL" ? "⚠️"
               : a.health === "EMPTY" ? "·" : "✅";
    line(`  ${mark} ${a.column.padEnd(30)} ${String(a.nonEmpty).padStart(4)}/${a.total}  ${FATE_ZH[a.fate]}`);
  }
  if (show.length < group.length) {
    line(`     …另外 ${group.length - show.length} 欄整欄空白（管線只匯出最終結果，這是正常的）`);
  }
  line();
}

const byFate = (f: ColumnFate) => audits.filter((a) => a.fate === f);
rule("B. 保留進 canonical payload 的欄位");
for (const a of byFate("CANONICAL")) {
  line(`  ${a.health === "PLACEHOLDER" ? "🛑" : a.nonEmpty === 0 ? "·" : "  "} ${a.column.padEnd(30)} ${a.note}`);
}
line(`共 ${byFate("CANONICAL").length} 欄（🛑 = 這一批壞掉，· = 這一批整欄空白）`);

rule("C. 可以安全忽略的欄位");
line(`共 ${byFate("IGNORED").length} 欄`);
for (const a of byFate("IGNORED").filter((x) => x.nonEmpty > 0)) {
  line(`  ${a.column.padEnd(30)} ${String(a.nonEmpty).padStart(4)}/${a.total}  ${a.note}`);
}
line(`  （其餘 ${byFate("IGNORED").filter((x) => x.nonEmpty === 0).length} 欄在這一批整欄空白）`);

rule("D. 有價值，但目前 schema 沒有承接的欄位");
for (const a of byFate("DEFERRED")) {
  line(`  ${a.column.padEnd(30)} ${String(a.nonEmpty).padStart(4)}/${a.total}  ${a.note}`);
}

rule("E. 壞掉／不可信的欄位");
const broken = brokenColumns(audits);
if (broken.length === 0) line("✅ 應該有內容的欄位全部正常");
for (const a of broken) {
  const why = a.health === "PLACEHOLDER"
      ? `🛑 整欄都是未解析的欄位參照（值 = 另一個欄位名稱），${a.placeholder}/${a.nonEmpty} 列`
    : a.health === "PARTIAL"
      ? `⚠️ 有 ${a.placeholder}/${a.nonEmpty} 列的值等於欄位名稱`
      : `· 這份檔案裡整欄空白`;
  line(`  ${a.column.padEnd(30)} ${why}`);
}

const unknown = audits.filter((a) => a.category === "UNKNOWN");
if (unknown.length > 0) {
  line();
  line(`⚠️ 分類表不認得 ${unknown.length} 欄——來源格式可能改了，請補進 columnClassification.ts：`);
  for (const a of unknown) line(`   ${a.column}`);
}

// 重複的 passage_id
const idCount = new Map<string, number>();
for (const p of parsed) idCount.set(p.passageId, (idCount.get(p.passageId) ?? 0) + 1);
const dupIds = [...idCount.entries()].filter(([, n]) => n > 1);

// 🛑 一份管線匯出檔裡，「還沒輪到的題目」與「產出來但壞掉的文章」
//    都會落在 BLOCKED。把它們算成同一個數字，報告就會把一個正常的
//    產製佇列講成一批壞資料。先分層，再談品質。
rule("來源列的分層");
const noPassage = parsed.filter((p) => p.passageText === null);
const withPassage = parsed.filter((p) => p.passageText !== null);
line(`有 topic_id 的列            ${parsed.length}`);
line(`  還沒產出文章（只有選題）  ${noPassage.length}  ← 不是壞資料，是管線還沒跑到`);
line(`  已產出文章                ${withPassage.length}  ← 下面所有品質數字都以這個為分母`);

rule("總量（產品規則：0 題 blocked ／ 1–5 題 DRAFT ／ 6 題可上架）");
const nStatus = (st: ParsedPassage["importStatus"]) =>
  withPassage.filter((p) => p.importStatus === st).length;
line(`分母：已產出文章 ${withPassage.length} 篇`);
line(`PUBLISH_READY  六題完整 ${nStatus("PUBLISH_READY")}`);
line(`DRAFT          1–5 題   ${nStatus("DRAFT")}`);
line(`BLOCKED        不匯入   ${nStatus("BLOCKED")}  ← 有文章但沒有任何可用題目`);
line(`重複的 passage_id        ${dupIds.length}${dupIds.length ? "  " + dupIds.map(([id, n]) => `${id}×${n}`).join(", ") : ""}`);

// 🛑 canonical payload 才是真正會送進資料庫的東西。
//    在這裡實際跑一遍，報告的數字就不是「parser 認為會匯入幾篇」，
//    而是「真的產得出 payload 的有幾篇」——兩者不一致代表我有 bug。
const payloads = parsed.map(toCanonicalPayload);
const built = payloads.filter((x) => x !== null).length;
line();
line(`實際產出 canonical payload  ${built} 篇`);
line(built === nStatus("PUBLISH_READY") + nStatus("DRAFT")
  ? "✅ 與 PUBLISH_READY + DRAFT 相符"
  : `🛑 與三態不符（應為 ${nStatus("PUBLISH_READY") + nStatus("DRAFT")}）——parser 與 payload 的規則分岔了`);
line(`payload 帶進去的題目總數    ${payloads.reduce((n, x) => n + (x?.questions.length ?? 0), 0)}`);
line(`payload 帶進去的段落總數    ${payloads.reduce((n, x) => n + (x?.paragraphs.length ?? 0), 0)}`);
line(`payload 帶進去的詞彙總數    ${payloads.reduce((n, x) => n + (x?.vocabulary.length ?? 0), 0)}`);

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
rule(`每個 Construct 的完整度（分母 ${withPassage.length} 篇已產出文章）`);
line(`${"".padEnd(4)} ${"完整".padStart(5)} ${"缺題幹".padStart(6)} ${"選項不足".padStart(8)} ${"缺正解".padStart(6)} ${"正解無對應".padStart(10)} ${"缺解說".padStart(6)}`);
for (const c of CONSTRUCTS) {
  const qs = withPassage.map((p) => p.questions.find((q) => q.construct === c)).filter(Boolean);
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
for (const p of withPassage) for (const q of p.questions) for (const s of q.skills) {
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
line(`有段落地圖的文章  ${withPassage.filter((p) => p.paragraphs.length > 0).length}／${withPassage.length}`);
line(`段落總數          ${withPassage.reduce((n, p) => n + p.paragraphs.length, 0)}`);
line(`有詞彙的文章      ${withPassage.filter((p) => p.vocab.length > 0).length}／${withPassage.length}`);
for (const t of ["CANDIDATE", "ACADEMIC", "KNOWLEDGE"] as const) {
  line(`  ${t.padEnd(10)} ${withPassage.reduce((n, p) => n + p.vocab.filter((v) => v.tier === t).length, 0)} 筆`);
}
line(`🛑 lexical_items 自動比對：v1 不做（VC 題考的字只有少數出現在 CANDIDATE 清單裡）`);

// ── 被擋下的文章 ────────────────────────────────────
rule("不可上架的文章（只列已產出文章的那些）");
const blocked = withPassage.filter((p) => !p.publishReady);
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
  line(`${p.passageId.padEnd(10)} ${p.importStatus.padEnd(13)} ${parts.join(" ; ")}`);
}

rule("結論");
line(`已產出文章 ${withPassage.length} 篇 → 可上架 ${nStatus("PUBLISH_READY")}  ·  DRAFT ${nStatus("DRAFT")}  ·  BLOCKED ${nStatus("BLOCKED")}`);
line(`另有 ${noPassage.length} 列只有選題、還沒產出文章——那是管線的待辦，不是這次要修的資料`);
line(`🛑 這支只做體檢，沒有產生任何 SQL，也沒有連線任何環境。`);
line();
