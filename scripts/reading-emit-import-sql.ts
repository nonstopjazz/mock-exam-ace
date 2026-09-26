/**
 * 把來源 xlsx 轉成【可以直接貼進 Supabase SQL Editor】的匯入檔。
 *
 *   npm run reading:emit-sql -- <來源.xlsx> <輸出目錄> [每批篇數]
 *
 * 🛑 產出的 .sql【含題庫內容與正解】，絕對不可以 commit。
 *    預設輸出到 generated/，那個目錄在 .gitignore 裡。
 *
 * 🛑 這支是【權宜之計】，不是設計。
 *    正式的路徑是 /admin/reading/import 的上傳介面——瀏覽器讀檔、
 *    parser 轉 canonical payload、分批呼叫 reading_import_batch()。
 *    在那個介面做好之前，這支讓同一條 RPC 路徑先跑得起來。
 *
 * 分批的理由：SQL Editor 貼得進幾百 KB，貼不進幾 MB。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { parseRow } from "../src/lib/reading/parseSourceRow";
import { toCanonicalPayload, type CanonicalImportItem } from "../src/lib/reading/canonicalPayload";

const [file, outDir, sizeArg] = process.argv.slice(2);
if (!file || !outDir) {
  console.error("用法：npm run reading:emit-sql -- <來源.xlsx> <輸出目錄> [每批篇數]");
  process.exit(1);
}
const size = Number(sizeArg ?? 25);

const wb = XLSX.read(readFileSync(file), { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
const headers = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? [])
  .filter((h): h is string => typeof h === "string" && h.length > 0);

const payloads = rows
  .filter((r) => String(r["topic_id"] ?? "").trim())
  .map((r) => toCanonicalPayload(parseRow(r, headers)))
  .filter((x): x is CanonicalImportItem => x !== null);

mkdirSync(outDir, { recursive: true });

// 🛑 dollar quoting 的 tag 必須不出現在內容裡，否則字串會提早結束，
//    而 SQL 仍然可能「執行成功」——只是存進去的東西被截斷了。
const TAG = "zzjson";
const chunks: CanonicalImportItem[][] = [];
for (let i = 0; i < payloads.length; i += size) chunks.push(payloads.slice(i, i + size));

const files: string[] = [];
chunks.forEach((chunk, idx) => {
  const json = JSON.stringify(chunk);
  if (json.includes(`$${TAG}$`)) {
    throw new Error(`內容裡出現了 dollar-quote tag $${TAG}$，換一個 tag`);
  }
  const n = idx + 1;
  const isFinal = n === chunks.length;
  const name = `import-${String(n).padStart(2, "0")}-of-${chunks.length}.sql`;
  // 🛑 註解不可以跟參數放同一行——行尾註解會把後面的逗號一起吃掉，
  //    參數列就少一個逗號，整份 SQL 變成語法錯誤。
  const batchArg = n === 1
    ? "    -- 第 1 份：建立新批次\n    NULL,"
    : "    -- ⬅️ 把第 1 份回傳的 batch_id 貼在這裡\n    'PASTE_BATCH_ID_HERE'::uuid,";
  const finalArg = isFinal
    ? "    -- 最後一份，收尾\n    TRUE"
    : "    FALSE";
  const fixed = `-- =====================================================
-- Six-Way Reading 匯入 ${n} / ${chunks.length}（${chunk.length} 篇）
-- ✍️ 【會寫入】⚠️ 只在 staging 執行，確認無誤才輪到 production。
--
-- 🛑 依序執行，不要跳號。第 1 份建立批次並回傳 batch_id，
--    第 2 份開始要把那個 batch_id 貼進下面標了 ⬅️ 的那一行。
-- 🛑 這個檔案含題庫內容與正解，【不要 commit，不要外流】。
--
-- 判讀：imported + skipped + conflict + blocked + failed = ${chunk.length}
-- =====================================================

WITH r AS (
  SELECT reading_import_batch(
    $${TAG}$${json}$${TAG}$::jsonb,
    'Reading_Analysis_Senior.xlsx',
${batchArg}
${finalArg}
  ) AS j
)
SELECT j ->> 'batch_id'            AS batch_id,
       j -> 'chunk' ->> 'imported' AS imported,
       j -> 'chunk' ->> 'skipped'  AS skipped,
       j -> 'chunk' ->> 'conflict' AS conflict,
       j -> 'chunk' ->> 'blocked'  AS blocked,
       j -> 'chunk' ->> 'failed'   AS failed,
       j -> 'batch' ->> 'status'   AS "批次狀態",
       (SELECT count(*) FROM jsonb_array_elements(j -> 'results') e
         WHERE e ->> 'status' <> 'imported')      AS "非imported篇數",
       (SELECT string_agg(e ->> 'passage_id' || '：' || (e ->> 'reason'), E'\\n')
          FROM jsonb_array_elements(j -> 'results') e
         WHERE e ->> 'status' <> 'imported')      AS "需要看的篇"
  FROM r;
`;
  writeFileSync(join(outDir, name), fixed);
  files.push(`${name}  ${chunk.length} 篇  ${(fixed.length / 1024).toFixed(0)} KB`);
});

console.log(`payload ${payloads.length} 篇 → ${chunks.length} 份 SQL（每份 ${size} 篇）`);
for (const f of files) console.log(`  ${f}`);
console.log(`\n🛑 輸出目錄 ${outDir} 含題庫內容，不要 commit。`);
