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
-- ⚠️ 若這一整段回報「function public.is_admin() does not exist」，
--    那個錯誤【本身就是檢查結果】—— 代表第 5 項不成立，四支 RPC 不可能運作。
--    （CASE 包不住這件事：PostgreSQL 在【解析】階段就要解析函式名稱，
--      不會等到執行時才判斷分支。to_regprocedure 在這裡救不了。）
UNION ALL SELECT '7. 你是管理員（否則四支都會回 42501）',
       coalesce(public.is_admin(), false)::text,
       coalesce(public.is_admin(), false)
ORDER BY 1;
