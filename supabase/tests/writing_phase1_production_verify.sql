-- =====================================================
-- Phase 1 正式環境套用後驗證 —— 完全唯讀
-- 純 SQL，可直接整段貼進 Supabase SQL Editor
--
-- 為什麼正式環境不跑完整的 writing_phase1_staging_smoke.sql：
--   那支會實際建立一篇作文（掛在某個真實使用者的 id 底下）再刪除。
--   它自我清理過、也驗證過冪等，但那畢竟是對正式資料庫的寫入。
--   而 D–H（送出流程、RLS 隔離、不可變性、append-only）已經在 staging 上
--   用一模一樣的 DDL 驗證過了，沒有必要在正式環境重跑。
--
--   正式環境真正需要確認的是別的事：**iLearn 有沒有被碰到**。
--   staging 上沒有 iLearn 的表，那些檢查是空過的；這裡才是真的驗證。
--   而這件事純粹讀 catalog 就能回答，一個位元組都不用寫。
--
-- 執行對象：ytzspnjmkvrkbztnaomm（正式環境，與 iLearn 共用）
-- 執行時機：套用 create_writing_submissions.sql 與 create_writing_texts.sql 之後
--
-- 判讀：八列的「結果」全部都要是 true。
--
-- ── 套用前實測到的正式環境基準（2026-09，由 preflight 取得）──
--   public.essay_submissions            存在
--   storage bucket 'essays'             存在
--   essay_submissions 上的 RLS 政策      3 條，全部是學生政策：
--       Students can view own essays    (SELECT)
--       Students can insert own essays  (INSERT)
--       Students can update own essays  (UPDATE)
--   writing_ / "Writing:" / submit_writing_ 命名   0 個
--
--   注意 iLearn 的 016 migration 定義了 6 條政策，正式環境只有 3 條 ——
--   三條管理員政策並不存在。iLearn 的後台是用 service-role client
--   繞過 RLS、在應用程式碼裡自行判斷管理員，所以那三條從未被用到。
--   C3 把這個基準值釘住：政策數一旦變動就會被抓出來。
-- =====================================================

SELECT 'A1 writing_submissions 存在' AS 檢查,
       (to_regclass('public.writing_submissions') IS NOT NULL)::text AS 結果,
       '' AS 備註

UNION ALL SELECT 'A2 writing_texts 存在',
       (to_regclass('public.writing_texts') IS NOT NULL)::text, ''

UNION ALL SELECT 'A3 submit_writing_essay() 存在',
       (to_regprocedure('public.submit_writing_essay(text,text,text,date,text)') IS NOT NULL)::text, ''

UNION ALL SELECT 'B1 essay_submissions 上沒有 Writing: 政策',
       (NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = 'essay_submissions'
                      AND policyname LIKE 'Writing:%'))::text, ''

-- 用 catalog join 比對名稱，不用 ::regclass —— 該轉型在表不存在時
-- 會在規劃階段就報錯，OR 的短路救不了它。
UNION ALL SELECT 'C1 essay_submissions 上沒有寫作系統的 trigger',
       (NOT EXISTS (SELECT 1 FROM pg_trigger t
                    JOIN pg_class c ON c.oid = t.tgrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = 'essay_submissions'
                      AND NOT t.tgisinternal AND t.tgname LIKE '%writing%'))::text, ''

UNION ALL SELECT 'C2 essay_submissions 上沒有寫作系統的索引',
       (NOT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public' AND tablename = 'essay_submissions'
                      AND indexname LIKE 'idx_writing%'))::text, ''

UNION ALL SELECT 'C3 iLearn 政策數仍為套用前的基準值',
       ((SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'essay_submissions') = 3)::text,
       '目前 ' || (SELECT count(*) FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'essay_submissions')
       || ' 條，基準 3 條'

UNION ALL SELECT 'O1 寫作系統的 8 條政策都在自己的表上',
       ((SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('writing_submissions','writing_texts')) = 8)::text,
       '目前 ' || (SELECT count(*) FROM pg_policies
                  WHERE schemaname = 'public'
                    AND tablename IN ('writing_submissions','writing_texts')) || ' 條';
