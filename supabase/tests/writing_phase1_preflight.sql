-- =====================================================
-- Phase 1 部署前檢查（PREFLIGHT）—— 完全唯讀
--
-- 用途：在對任何 Supabase 專案套用寫作系統的 migration 之前，先確認
--   (a) 前置條件具備、
--   (b) 寫作系統的物件尚未存在、
--   (c) iLearn 的既有物件不會被碰到。
--
-- 這個腳本只讀 system catalog，不建立、不修改、不刪除任何東西。
--
-- 執行方式：整段貼進 Supabase SQL Editor 執行（先 staging，後正式）。
--   staging    cwymrzcovgobfqxtithn（gsat-staging）
--   production ytzspnjmkvrkbztnaomm（與 iLearn 共用，不可先套用）
--
-- 判讀：
--   任何一列 verdict = 'STOP' 就不要套用 migration。
--   is_admin() 不存在時，必須先套用 supabase/migrations/create_user_profiles_table.sql
--   —— 寫作系統的 RLS 政策會呼叫它，缺了會在第一個 CREATE POLICY 失敗。
-- =====================================================

WITH facts AS (
  SELECT
    to_regprocedure('public.is_admin()')                        IS NOT NULL AS has_is_admin,
    to_regclass('public.user_profiles')                         IS NOT NULL AS has_user_profiles,
    to_regclass('public.writing_submissions')                   IS NOT NULL AS has_writing_submissions,
    to_regclass('public.writing_texts')                         IS NOT NULL AS has_writing_texts,
    to_regclass('public.essay_submissions')                     IS NOT NULL AS has_essay_submissions,
    to_regprocedure('public.submit_writing_essay(text,text,text,date,text)')
                                                                IS NOT NULL AS has_submit_fn,
    COALESCE((SELECT true FROM storage.buckets WHERE id = 'essays'),         false) AS has_bucket_essays,
    COALESCE((SELECT true FROM storage.buckets WHERE id = 'writing-assets'), false) AS has_bucket_writing
),
rows AS (
  -- ── 前置條件：必須已經存在 ──
  SELECT 1 AS ord, '前置條件' AS section,
         '1. public.is_admin() 存在' AS item, has_is_admin::text AS result,
         'true' AS expected,
         CASE WHEN has_is_admin THEN 'OK'
              ELSE 'STOP —— 先套用 create_user_profiles_table.sql' END AS verdict
  FROM facts
  UNION ALL
  SELECT 2, '前置條件', '2. public.user_profiles 存在', has_user_profiles::text, 'true',
         CASE WHEN has_user_profiles THEN 'OK'
              ELSE 'STOP —— 先套用 create_user_profiles_table.sql' END
  FROM facts

  -- ── 寫作系統：套用前應該都還不存在 ──
  UNION ALL
  SELECT 3, '寫作系統（應尚未存在）', '3. public.writing_submissions 存在', has_writing_submissions::text, 'false',
         CASE WHEN has_writing_submissions THEN 'STOP —— 已存在，先確認是誰建立的' ELSE 'OK' END
  FROM facts
  UNION ALL
  SELECT 4, '寫作系統（應尚未存在）', '4. public.writing_texts 存在', has_writing_texts::text, 'false',
         CASE WHEN has_writing_texts THEN 'STOP —— 已存在，先確認是誰建立的' ELSE 'OK' END
  FROM facts
  UNION ALL
  SELECT 5, '寫作系統（應尚未存在）', '9a. submit_writing_essay() 存在', has_submit_fn::text, 'false',
         CASE WHEN has_submit_fn THEN 'STOP —— 已存在' ELSE 'OK' END
  FROM facts
  UNION ALL
  SELECT 6, '寫作系統（應尚未存在）', '8. storage bucket writing-assets 存在', has_bucket_writing::text, 'false',
         CASE WHEN has_bucket_writing THEN '注意 —— Phase 2 才需要它' ELSE 'OK' END
  FROM facts

  -- ── iLearn 既有物件：只記錄，不動它 ──
  UNION ALL
  SELECT 7, 'iLearn 既有（只記錄）', '5. public.essay_submissions 存在', has_essay_submissions::text, '兩者皆可',
         CASE WHEN has_essay_submissions
              THEN '存在 —— 此專案與 iLearn 共用，migration 不得碰它'
              ELSE '不存在 —— 此專案沒有 iLearn 的作文資料' END
  FROM facts
  UNION ALL
  SELECT 8, 'iLearn 既有（只記錄）', '7. storage bucket essays 存在', has_bucket_essays::text, '兩者皆可',
         CASE WHEN has_bucket_essays
              THEN '存在 —— Phase 2 必須改用 writing-assets，不可共用'
              ELSE '不存在' END
  FROM facts

  -- ── 6. iLearn 在 essay_submissions 上的政策名稱（只列出）──
  UNION ALL
  SELECT 20, 'iLearn 既有（只記錄）',
         '6. essay_submissions 政策：' || policyname, cmd, '不得被更動', '只記錄'
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'essay_submissions'

  -- ── 9. 掃描所有 writing_ / Writing: / submit_writing_ 命名 ──
  UNION ALL
  SELECT 30, '9. 既有命名掃描',
         '政策 ' || policyname || ' on ' || tablename, cmd, '套用前應為 0 列', '已存在'
  FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE 'Writing:%'
  UNION ALL
  SELECT 31, '9. 既有命名掃描',
         CASE c.relkind WHEN 'r' THEN '資料表 ' WHEN 'i' THEN '索引 ' WHEN 'v' THEN '檢視 ' ELSE '關聯 ' END
           || c.relname, c.relkind::text, '套用前應為 0 列', '已存在'
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'writing\_%'
  UNION ALL
  SELECT 32, '9. 既有命名掃描', '函式 ' || p.proname, '', '套用前應為 0 列', '已存在'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.proname LIKE 'writing\_%' OR p.proname LIKE 'submit\_writing\_%')
  UNION ALL
  SELECT 33, '9. 既有命名掃描', 'Trigger ' || t.tgname, '', '套用前應為 0 列', '已存在'
  FROM pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgname LIKE '%writing%'

  -- ── 10. migration 目標確認（靜態事實，供對照）──
  UNION ALL
  SELECT 40, '10. migration 目標', 'migration 只會建立 writing_submissions / writing_texts', '', '',
         '兩支 migration 中不含 essay_submissions、essay_text、essays bucket 或任何 iLearn 政策名稱'
  UNION ALL
  SELECT 41, '10. migration 目標', '對應的回歸測試', '', '',
         'supabase/tests/writing_coexistence_test.sql 已在本機驗證此性質'
)
SELECT section, item, result, expected, verdict
FROM rows
ORDER BY ord, item;
