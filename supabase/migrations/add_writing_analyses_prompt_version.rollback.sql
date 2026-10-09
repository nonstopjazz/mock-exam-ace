-- =====================================================
-- 回滾 add_writing_analyses_prompt_version.sql
--
-- 🛑 這會【永久刪掉】已經記錄的 prompt 版本標記。
--    那些值無法重建 —— 它們是「那次分析當時用的是哪一版 prompt」，
--    而那個資訊不存在於其他任何地方（這正是當初加這個欄位的原因）。
--    刪掉之後，那幾筆分析就回到「無法分辨新舊 prompt」的狀態。
--
--    刪之前先看一下會失去多少：
--
--      SELECT prompt_version, count(*) AS "筆數",
--             min(started_at)::date AS "最早", max(started_at)::date AS "最晚"
--        FROM public.writing_analyses
--       WHERE prompt_version IS NOT NULL
--       GROUP BY prompt_version ORDER BY 3;
--
-- 🛑 前端必須【一起】回滾。
--    analyze-writing.ts 的 update 會帶 prompt_version，而 PostgREST 對未知
--    欄位是回錯誤、不是靜默忽略 —— 只回滾 SQL 的話，整個批改功能會壞掉。
-- =====================================================

ALTER TABLE public.writing_analyses
  DROP COLUMN IF EXISTS prompt_version;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT '欄位已移除' AS "檢查項",
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'writing_analyses'
           AND column_name = 'prompt_version') = 0 AS "通過";
