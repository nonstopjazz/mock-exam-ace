-- 🟢 【唯讀】staging 與 production 都可以安全執行。
-- 第 2 批（A4–A7）的前置檢查。「通過」全部是 true 才往下走。
SELECT '1. writing_error_findings 表存在' AS "檢查項",
       (to_regclass('public.writing_error_findings') IS NOT NULL)::text AS "結果",
       (to_regclass('public.writing_error_findings') IS NOT NULL)       AS "通過"
UNION ALL SELECT '2. 表裡有資料（第 1 批已回填）',
       coalesce((SELECT count(*) FROM public.writing_error_findings), 0)::text || ' 筆',
       coalesce((SELECT count(*) FROM public.writing_error_findings), 0) > 0
UNION ALL SELECT '3. learn_class_members 存在（class filter 要用）',
       (to_regclass('public.learn_class_members') IS NOT NULL)::text,
       (to_regclass('public.learn_class_members') IS NOT NULL)
UNION ALL SELECT '4. learn_display_name() 存在',
       (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='learn_display_name'))::text,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='learn_display_name')
UNION ALL SELECT '5. is_admin() 存在',
       (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_admin'))::text,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='is_admin')
UNION ALL SELECT '6. 五支新函式尚未存在（預期 0 支）',
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public'
           AND p.proname IN ('writing_error_scoped_findings','writing_admin_error_overview',
                             'writing_admin_error_students','writing_admin_student_errors',
                             'writing_admin_error_findings'))::text || ' 支',
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public'
           AND p.proname IN ('writing_error_scoped_findings','writing_admin_error_overview',
                             'writing_admin_error_students','writing_admin_student_errors',
                             'writing_admin_error_findings')) = 0
-- ⚠️ 第 7 項用 to_regprocedure 先確認函式存在才呼叫。
--    直接呼叫的話，函式不存在會讓【整個 preflight】報錯，
--    連第 5 項「is_admin() 存在 = false」都看不到 —— 那正是最該看到的訊息。
UNION ALL SELECT '7. 你是管理員（否則四支都會回 42501）',
       CASE WHEN to_regprocedure('public.is_admin()') IS NULL
            THEN '（is_admin() 不存在，見第 5 項）'
            ELSE coalesce(public.is_admin(), false)::text END,
       CASE WHEN to_regprocedure('public.is_admin()') IS NULL
            THEN false
            ELSE coalesce(public.is_admin(), false) END
ORDER BY 1;
