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
 * 🛑 所有數字都來自 src/lib/reading/importAnalysis.ts，
 *    跟 /admin/reading/import 的預覽畫面是【同一次計算】。
 *    這支只負責把它印成文字。
 */

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { CONSTRUCT_LABEL_ZH } from "../src/lib/reading/constructs";
import { analyzeSource, orderedConstructs } from "../src/lib/reading/importAnalysis";
import type { ColumnCategory, ColumnFate } from "../src/lib/reading/columnClassification";

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

const a = analyzeSource(rows, headers);

const line = (s = "") => console.log(s);
const rule = (t: string) => { line(); line(`━━━ ${t} ${"━".repeat(Math.max(0, 58 - t.length))}`); };

rule("來源");
line(`檔案      ${file}`);
line(`工作表    ${sheetName}（共 ${wb.SheetNames.length} 個）`);
line(`欄位      ${headers.length}`);
line(`資料列    ${a.rowCount}`);

rule("Construct 推導（從實際欄位名，非硬編碼）");
line(`找到      ${a.constructs.found.map((f) => `${f.prefix}→${f.construct}`).join("  ")}`);
if (a.constructs.unknownPrefixes.length) line(`⚠️ 不認得  ${a.constructs.unknownPrefixes.join(", ")}`);
if (a.constructs.missingConstructs.length) line(`⚠️ 缺少    ${a.constructs.missingConstructs.join(", ")}`);
else line(`✅ 六個 construct 全部存在`);

rule("欄位相容性");
if (a.missingColumns.length === 0) line("✅ schema 會用到的欄位全部都在");
else {
  line(`⚠️ 缺少 ${a.missingColumns.length} 個 schema 會用到的欄位（會靜默變成 null）：`);
  for (const m of a.missingColumns) line(`   ${m.column.padEnd(30)} ${m.effect}`);
}

// ── 全欄位盤點 ──────────────────────────────────────
// 🛑 分兩層看：結構分類只看欄位【名稱】；健康狀態看欄位【值】。
//    `passage_final_text` 是 CORE 欄位【而且】整欄壞掉——兩件事同時為真。
rule("A. 全欄位分類");
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
  const group = a.columnAudits.filter((x) => x.category === cat);
  if (group.length === 0) continue;
  line(`${CAT_ZH[cat]}  共 ${group.length} 欄`);
  const show = cat === "PIPELINE" ? group.filter((x) => x.nonEmpty > 0) : group;
  for (const x of show) {
    const mark = x.health === "PLACEHOLDER" ? "🛑" : x.health === "PARTIAL" ? "⚠️"
               : x.health === "EMPTY" ? "·" : "✅";
    line(`  ${mark} ${x.column.padEnd(30)} ${String(x.nonEmpty).padStart(4)}/${x.total}  ${FATE_ZH[x.fate]}`);
  }
  if (show.length < group.length) {
    line(`     …另外 ${group.length - show.length} 欄整欄空白（管線只匯出最終結果，這是正常的）`);
  }
  line();
}

const byFate = (f: ColumnFate) => a.columnAudits.filter((x) => x.fate === f);
rule("B. 保留進 canonical payload 的欄位");
for (const x of byFate("CANONICAL")) {
  line(`  ${x.health === "PLACEHOLDER" ? "🛑" : x.nonEmpty === 0 ? "·" : "  "} ${x.column.padEnd(30)} ${x.note}`);
}
line(`共 ${byFate("CANONICAL").length} 欄（🛑 = 這一批壞掉，· = 這一批整欄空白）`);

rule("C. 可以安全忽略的欄位");
line(`共 ${byFate("IGNORED").length} 欄`);
for (const x of byFate("IGNORED").filter((y) => y.nonEmpty > 0)) {
  line(`  ${x.column.padEnd(30)} ${String(x.nonEmpty).padStart(4)}/${x.total}  ${x.note}`);
}
line(`  （其餘 ${byFate("IGNORED").filter((y) => y.nonEmpty === 0).length} 欄在這一批整欄空白）`);

rule("D. 有價值，但目前 schema 沒有承接的欄位");
for (const x of byFate("DEFERRED")) {
  line(`  ${x.column.padEnd(30)} ${String(x.nonEmpty).padStart(4)}/${x.total}  ${x.note}`);
}

rule("E. 壞掉／不可信的欄位");
if (a.brokenColumns.length === 0) line("✅ 應該有內容的欄位全部正常");
for (const x of a.brokenColumns) {
  const why = x.health === "PLACEHOLDER"
      ? `🛑 整欄都是未解析的欄位參照（值 = 另一個欄位名稱），${x.placeholder}/${x.nonEmpty} 列`
    : x.health === "PARTIAL"
      ? `⚠️ 有 ${x.placeholder}/${x.nonEmpty} 列的值等於欄位名稱`
      : `· 這份檔案裡整欄空白`;
  line(`  ${x.column.padEnd(30)} ${why}`);
}
if (a.unknownColumns.length > 0) {
  line();
  line(`⚠️ 分類表不認得 ${a.unknownColumns.length} 欄——來源格式可能改了，請補進 columnClassification.ts：`);
  for (const x of a.unknownColumns) line(`   ${x.column}`);
}

// 🛑 「還沒輪到的題目」與「產出來但壞掉的文章」都會落在 BLOCKED。
//    算成同一個數字，就會把正常的產製佇列講成一批壞資料。
rule("來源列的分層");
line(`有 topic_id 的列            ${a.withId}`);
line(`  還沒產出文章（只有選題）  ${a.noPassage}  ← 不是壞資料，是管線還沒跑到`);
line(`  已產出文章                ${a.withPassage}  ← 下面所有品質數字都以這個為分母`);

rule("總量（產品規則：0 題 blocked ／ 1–5 題 DRAFT ／ 6 題可上架）");
line(`分母：已產出文章 ${a.withPassage} 篇`);
line(`PUBLISH_READY  六題完整 ${a.publishReady}`);
line(`DRAFT          1–5 題   ${a.draft}`);
line(`BLOCKED        不匯入   ${a.blocked}  ← 有文章但沒有任何可用題目`);
line(`重複的 passage_id        ${a.duplicateIds.length}${a.duplicateIds.length ? "  " + a.duplicateIds.map((d) => `${d.passageId}×${d.count}`).join(", ") : ""}`);
line();
line(`實際產出 canonical payload  ${a.payloads.length} 篇`);
line(a.payloadMatchesStatus
  ? "✅ 與 PUBLISH_READY + DRAFT 相符"
  : `🛑 與三態不符（應為 ${a.publishReady + a.draft}）——parser 與 payload 的規則分岔了`);
line(`payload 帶進去的題目總數    ${a.payloadQuestions}`);
line(`payload 帶進去的段落總數    ${a.payloadParagraphs}`);
line(`payload 帶進去的詞彙總數    ${a.payloadVocabulary}`);
line(`payload 帶進去的 micro-skill ${a.payloadSkills}`);

rule("內文來源（final → revised → writer 取第一個有效的）");
for (const s of ["FINAL", "REVISED", "WRITER"] as const) {
  line(`${s.padEnd(9)} ${a.contentSource[s]} 篇`);
}
line();
line(`⚠️ 值等於欄位名稱（未解析的參照，不可當內容）：`);
for (const p of a.placeholderCounts) {
  line(`   ${p.column.padEnd(26)}${p.count}/${a.withId}`);
}

rule("CEFR");
for (const c of [...a.cefr].sort((x, y) => x.level.localeCompare(y.level))) {
  line(`${c.level.padEnd(14)} ${c.count}`);
}

// 🛑 這兩欄沒有 CHECK 約束（新批次會帶新值，鎖白名單會大量誤殺），
//    代價是打錯字的分類值不會被擋下。所以列出來用眼睛看一遍。
rule("分類值（沒有白名單，請目視檢查有無錯字或重複）");
for (const [label, list, limit] of [
  ["contentFamily", a.contentFamily, 0],
  ["subdomain", a.subdomain, 8],
] as const) {
  line(`${label}：${list.length} 種`);
  const show = limit > 0 ? list.slice(0, limit) : list;
  for (const v of show) line(`   ${String(v.count).padStart(4)}  ${v.value}`);
  if (show.length < list.length) line(`   …另外 ${list.length - show.length} 種`);
  line();
}

rule(`每個 Construct 的完整度（分母 ${a.withPassage} 篇已產出文章）`);
line(`${"".padEnd(4)} ${"完整".padStart(5)} ${"缺題幹".padStart(6)} ${"選項不足".padStart(8)} ${"缺正解".padStart(6)} ${"正解無對應".padStart(10)} ${"缺解說".padStart(6)}`);
for (const c of orderedConstructs()) {
  const h = a.perConstruct.find((x) => x.construct === c)!;
  line(
    `${c.padEnd(4)} ${String(h.ok).padStart(5)} ${String(h.missingQuestion).padStart(6)} ` +
    `${String(h.badOptions).padStart(8)} ${String(h.missingAnswer).padStart(6)} ` +
    `${String(h.answerNotInOptions).padStart(10)} ${String(h.missingExplanation).padStart(6)}` +
    `   ${CONSTRUCT_LABEL_ZH[c]}`
  );
}

rule("Micro-skill（v1 只存不分析）");
line(`skill 種類 ${a.skillKinds}  總筆數 ${a.skillRows}  emphasis 為空 ${a.skillNullEmphasis}（${((a.skillNullEmphasis / Math.max(a.skillRows, 1)) * 100).toFixed(1)}%）`);
line(`🛑 空值存成 NULL，不是 0。NULL = 沒有這個資訊。`);
if (a.skillDriftCells > 0) {
  line(`⚠️ 有內容卻解析出 0 個 skill 的儲存格：${a.skillDriftCells} 個 —— 格式可能換了，請看一筆原始值`);
} else {
  line(`✅ 沒有「有內容卻解析不出來」的儲存格`);
}

rule("段落地圖與詞彙");
line(`有段落地圖的文章  ${a.withParagraphs}／${a.withPassage}`);
line(`段落總數          ${a.paragraphRows}`);
line(`有詞彙的文章      ${a.withVocab}／${a.withPassage}`);
for (const t of a.vocabByTier) line(`  ${t.tier.padEnd(10)} ${t.count} 筆`);
line(`🛑 lexical_items 自動比對：v1 不做（VC 題考的字只有少數出現在 CANDIDATE 清單裡）`);

rule("不可上架的文章（只列已產出文章的那些）");
if (a.problems.length === 0) line("（無）");
for (const p of a.problems) {
  line(`${p.passageId.padEnd(10)} ${p.importStatus.padEnd(13)} ${p.reasons.join(" ; ")}`);
}

rule("結論");
line(`已產出文章 ${a.withPassage} 篇 → 可上架 ${a.publishReady}  ·  DRAFT ${a.draft}  ·  BLOCKED ${a.blocked}`);
line(`另有 ${a.noPassage} 列只有選題、還沒產出文章——那是管線的待辦，不是這次要修的資料`);
line(`🛑 這支只做體檢，沒有產生任何 SQL，也沒有連線任何環境。`);
line();
