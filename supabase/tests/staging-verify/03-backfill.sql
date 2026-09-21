-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- ✍️ 【會寫入】—— 這一支會重建 writing_error_findings 的內容。
--    它是冪等的（交易內 DELETE → INSERT），重跑不會產生重複，
--    但請確認你連到的是正確的環境。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V3 回填（會寫入）
-- 44 篇一批跑得完。若 remaining > 0，帶 last_essay_id 再跑一次。
-- =====================================================
SELECT jsonb_pretty(public.writing_backfill_error_findings(200)) AS "回填結果";


-- =====================================================
