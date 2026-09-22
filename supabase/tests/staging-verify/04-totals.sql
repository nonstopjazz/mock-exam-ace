-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🟢 【唯讀】—— 不會改變任何資料。staging 與 production 都可以安全執行。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
-- =====================================================
-- V4 總量統計（唯讀）
-- =====================================================
SELECT '物化的 findings 總數'        AS "項目", count(*)::text AS "值"
  FROM public.writing_error_findings
UNION ALL SELECT '涵蓋的作文數', count(DISTINCT essay_id)::text
  FROM public.writing_error_findings
UNION ALL SELECT '涵蓋的學生數', count(DISTINCT student_id)::text
  FROM public.writing_error_findings
UNION ALL SELECT '有 COMPLETED 的作文數（分母）',
       (SELECT count(DISTINCT essay_id) FROM public.writing_analyses WHERE status='COMPLETED')::text
UNION ALL SELECT '零錯誤作文數（有分析但 0 findings）',
       ((SELECT count(DISTINCT essay_id) FROM public.writing_analyses WHERE status='COMPLETED')
        - (SELECT count(DISTINCT essay_id) FROM public.writing_error_findings))::text
UNION ALL SELECT 'GRAMMAR_OTHER 筆數（is_fallback_code）',
       (SELECT count(*) FROM public.writing_error_findings WHERE is_fallback_code)::text
UNION ALL SELECT 'essay_word_count 是 NULL 的筆數（應為 0）',
       (SELECT count(*) FROM public.writing_error_findings WHERE essay_word_count IS NULL)::text
UNION ALL SELECT 'essay_topic 是 NULL 的筆數（可能 > 0，題目是選填）',
       (SELECT count(*) FROM public.writing_error_findings WHERE essay_topic IS NULL)::text
UNION ALL SELECT 'taxonomy_version 種類',
       (SELECT string_agg(DISTINCT taxonomy_version, ', ') FROM public.writing_error_findings)
ORDER BY 1;


-- =====================================================
