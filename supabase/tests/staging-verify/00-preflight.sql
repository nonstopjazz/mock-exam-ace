-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🟢 【唯讀】—— 不會改變任何資料。staging 與 production 都可以安全執行。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V0 前置檢查（唯讀）
--
-- 判讀：「通過」欄全部是 true 才往下走。
--       特別注意 findings表已存在 —— 若是 true，代表之前已經跑過，
--       要先確認是不是同一版，不要盲目重跑。
-- =====================================================
SELECT '1. writing_analyses 存在'  AS "檢查項",
       (to_regclass('public.writing_analyses') IS NOT NULL)::text AS "結果",
       (to_regclass('public.writing_analyses') IS NOT NULL)       AS "通過"
UNION ALL SELECT '2. writing_submissions 存在',
       (to_regclass('public.writing_submissions') IS NOT NULL)::text,
       (to_regclass('public.writing_submissions') IS NOT NULL)
UNION ALL SELECT '3. writing_texts 存在',
       (to_regclass('public.writing_texts') IS NOT NULL)::text,
       (to_regclass('public.writing_texts') IS NOT NULL)
UNION ALL SELECT '4. writing_texts.word_count 欄位存在',
       (EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='writing_texts'
                   AND column_name='word_count'))::text,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='writing_texts'
                  AND column_name='word_count')
UNION ALL SELECT '5. findings表已存在（預期 false＝還沒跑過）',
       (to_regclass('public.writing_error_findings') IS NOT NULL)::text,
       (to_regclass('public.writing_error_findings') IS NULL)
UNION ALL SELECT '5b. sync 函式已存在（預期 false）',
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public'
           AND p.proname IN ('writing_sync_error_findings',
                             'writing_sync_error_findings_for_essay',
                             'writing_backfill_error_findings'))::text || ' 支',
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public'
           AND p.proname IN ('writing_sync_error_findings',
                             'writing_sync_error_findings_for_essay',
                             'writing_backfill_error_findings')) = 0
UNION ALL SELECT '5c. 沒有同名但不同定義的既有物件',
       coalesce((SELECT string_agg(c.relname || '(' || c.relkind::text || ')', ', ')
                   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relname = 'writing_error_findings'),
                '（沒有）'),
       NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='public' AND c.relname='writing_error_findings'
                      AND c.relkind <> 'r')
UNION ALL SELECT '6. COMPLETED 分析數',
       (SELECT count(*) FROM public.writing_analyses WHERE status='COMPLETED')::text,
       (SELECT count(*) FROM public.writing_analyses WHERE status='COMPLETED') > 0
UNION ALL SELECT '7. 有 COMPLETED 的作文數',
       (SELECT count(DISTINCT essay_id) FROM public.writing_analyses WHERE status='COMPLETED')::text,
       true
UNION ALL SELECT '8. 這些作文的 findings 形狀全部正確',
       (SELECT count(*) FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
         WHERE jsonb_typeof(t.error_analysis -> 'findings') IS DISTINCT FROM 'array')::text
         || ' 篇形狀異常',
       (SELECT count(*) FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
         WHERE jsonb_typeof(t.error_analysis -> 'findings') IS DISTINCT FROM 'array') = 0
UNION ALL SELECT '9. 沒有超出 17 個 code 的錯誤碼',
       (SELECT count(DISTINCT f ->> 'code') FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.error_analysis -> 'findings')='array'
               THEN t.error_analysis -> 'findings' ELSE '[]'::jsonb END) f
        WHERE f ->> 'code' NOT IN (
          'WRITE_ERR_ARTICLE','WRITE_ERR_CHINGLISH','WRITE_ERR_COUNTABILITY',
          'WRITE_ERR_DISCOURSE_STRUCTURE','WRITE_ERR_FRAGMENT','WRITE_ERR_GRAMMAR_OTHER',
          'WRITE_ERR_NUMBER','WRITE_ERR_PREP_CLAUSE','WRITE_ERR_PRONOUN',
          'WRITE_ERR_PUNCTUATION','WRITE_ERR_RUN_ON','WRITE_ERR_SPELLING',
          'WRITE_ERR_SV_AGREEMENT','WRITE_ERR_THAT','WRITE_ERR_TRANSITIVITY',
          'WRITE_ERR_WORD_BOUNDARY','WRITE_ERR_WORD_CLASS'))::text || ' 個未知 code',
       (SELECT count(DISTINCT f ->> 'code') FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.error_analysis -> 'findings')='array'
               THEN t.error_analysis -> 'findings' ELSE '[]'::jsonb END) f
        WHERE f ->> 'code' NOT IN (
          'WRITE_ERR_ARTICLE','WRITE_ERR_CHINGLISH','WRITE_ERR_COUNTABILITY',
          'WRITE_ERR_DISCOURSE_STRUCTURE','WRITE_ERR_FRAGMENT','WRITE_ERR_GRAMMAR_OTHER',
          'WRITE_ERR_NUMBER','WRITE_ERR_PREP_CLAUSE','WRITE_ERR_PRONOUN',
          'WRITE_ERR_PUNCTUATION','WRITE_ERR_RUN_ON','WRITE_ERR_SPELLING',
          'WRITE_ERR_SV_AGREEMENT','WRITE_ERR_THAT','WRITE_ERR_TRANSITIVITY',
          'WRITE_ERR_WORD_BOUNDARY','WRITE_ERR_WORD_CLASS')) = 0
ORDER BY 1;


-- =====================================================
