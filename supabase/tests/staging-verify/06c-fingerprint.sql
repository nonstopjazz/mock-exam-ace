-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🛑 只在 gsat-staging 執行，不要在 production。
--
-- =====================================================
-- V6c 冪等性：內容指紋（唯讀）
--
-- 這一支要【跑兩次】，中間夾一次回填：
--
--   1. 跑本檔 → 記下「總筆數」與「內容指紋」
--   2. 跑 03-backfill.sql （再回填一次）
--   3. 再跑本檔一次
--
-- 判讀：兩次的「總筆數」與「內容指紋」必須【完全相同】。
--       不同就代表回填不是冪等的——重跑會製造重複或弄丟資料。
-- =====================================================
SELECT count(*)::int AS "總筆數",
       md5(string_agg(essay_id::text || ':' || finding_index::text || ':' || error_code,
                      '|' ORDER BY essay_id, finding_index)) AS "內容指紋"
  FROM public.writing_error_findings;
