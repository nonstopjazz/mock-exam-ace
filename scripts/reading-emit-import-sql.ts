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
  const fixed = `-- =====================================================
-- Six-Way Reading 匯入 ${n} / ${chunks.length}（${chunk.length} 篇）
-- ✍️ 【會寫入】⚠️ 只在 staging 執行，確認無誤才輪到 production。
--    Supabase SQL Editor 請選【Run without RLS】。
--
-- 🛑 依序執行，不要跳號。batch_id 【不用手動貼】——
--    腳本會自己找出同一個檔名、同一位管理員、還在進行中的批次接續下去。
-- 🛑 這個檔案含題庫內容與正解，【不要 commit，不要外流】。
--
-- 判讀：imported + skipped + conflict + blocked + failed = ${chunk.length}
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS zz_import_result(j JSONB);
DELETE FROM zz_import_result;

DO $zzdo$
DECLARE v_admin UUID; v_row RECORD; v_batch UUID;
BEGIN
  -- 🛑 SQL Editor 在【Run without RLS】下 auth.uid() 是 NULL，
  --    而匯入 RPC 第一行就擋未登入。所以這裡要先借用管理員的身分。
  --    【不猜】誰是管理員——逐一切換身分去問 is_admin() 本人，
  --    各環境的判準不同（production 與 staging 用不同 email）。
  FOR v_row IN SELECT id FROM auth.users ORDER BY created_at LIMIT 200 LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_row.id)::text, true);
    IF coalesce(public.is_admin(), false) THEN v_admin := v_row.id; EXIT; END IF;
  END LOOP;

  IF v_admin IS NULL THEN
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '找不到管理員帳號（is_admin() 對前 200 位使用者都回 false）';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- 🛑 自動接續批次，不要人工複製 batch_id 貼 ${chunks.length} 次——
  --    那是 ${chunks.length} 次貼錯的機會，而貼錯的後果是帳本分岔、
  --    統計對不起來，卻不會有任何錯誤訊息。
  SELECT id INTO v_batch FROM public.reading_import_batches
   WHERE filename = 'Reading_Analysis_Senior.xlsx'
     AND admin_id = v_admin AND status = 'IN_PROGRESS'
   ORDER BY started_at DESC LIMIT 1;

  INSERT INTO zz_import_result
  SELECT public.reading_import_batch(
    $${TAG}$${json}$${TAG}$::jsonb,
    'Reading_Analysis_Senior.xlsx',
    v_batch,
    ${isFinal ? "TRUE" : "FALSE"}${isFinal ? "   -- 最後一份，收尾" : ""}
  );

  PERFORM set_config('request.jwt.claims', '', true);
END
$zzdo$;

SELECT j ->> 'batch_id'            AS batch_id,
       j -> 'chunk' ->> 'imported' AS imported,
       j -> 'chunk' ->> 'skipped'  AS skipped,
       j -> 'chunk' ->> 'conflict' AS conflict,
       j -> 'chunk' ->> 'blocked'  AS blocked,
       j -> 'chunk' ->> 'failed'   AS failed,
       j -> 'batch' ->> 'status'   AS "批次狀態",
       j -> 'batch' ->> 'total'    AS "批次累計已處理",
       (SELECT count(*) FROM jsonb_array_elements(j -> 'results') e
         WHERE e ->> 'status' <> 'imported')      AS "非imported篇數",
       (SELECT string_agg(e ->> 'passage_id' || '：' || (e ->> 'reason'), E'\\n')
          FROM jsonb_array_elements(j -> 'results') e
         WHERE e ->> 'status' <> 'imported')      AS "需要看的篇"
  FROM zz_import_result;
`;
  writeFileSync(join(outDir, name), fixed);
  files.push(`${name}  ${chunk.length} 篇  ${(fixed.length / 1024).toFixed(0)} KB`);
});

console.log(`payload ${payloads.length} 篇 → ${chunks.length} 份 SQL（每份 ${size} 篇）`);
for (const f of files) console.log(`  ${f}`);
console.log(`\n🛑 輸出目錄 ${outDir} 含題庫內容，不要 commit。`);
