-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🟢 【唯讀】—— 不會改變任何資料。staging 與 production 都可以安全執行。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V5b 抽查 5 篇的實際內容（唯讀）
-- V5 已經全量比對過，這一段是給人眼看的
-- =====================================================
WITH pick AS (
  SELECT DISTINCT essay_id FROM public.writing_error_findings
   ORDER BY essay_id LIMIT 5)
SELECT f.essay_id,
       f.finding_index                    AS "序",
       f.error_code                       AS "code",
       left(f.quote, 40)                  AS "原文",
       left(f.correction, 40)             AS "修正",
       left(f.reason, 30)                 AS "說明",
       f.essay_word_count                 AS "字數",
       f.analysis_version                 AS "版次"
  FROM public.writing_error_findings f
  JOIN pick p ON p.essay_id = f.essay_id
 ORDER BY f.essay_id, f.finding_index;


-- =====================================================
