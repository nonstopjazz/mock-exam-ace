-- 🟢 【唯讀】staging 與 production 都可以安全執行。
-- 連點重複紀錄稽核的前置檢查。「通過」全部是 true 才往下跑 01～05。
SELECT '1. lexical_attempts 表存在' AS "檢查項",
       (to_regclass('public.lexical_attempts') IS NOT NULL)::text AS "結果",
       (to_regclass('public.lexical_attempts') IS NOT NULL)       AS "通過"
UNION ALL SELECT '2. 表裡有資料',
       coalesce((SELECT count(*) FROM public.lexical_attempts), 0)::text || ' 筆',
       coalesce((SELECT count(*) FROM public.lexical_attempts), 0) > 0
UNION ALL SELECT '3. occurred_at 有毫秒精度（時間窗要靠它）',
       coalesce((SELECT count(*) FROM public.lexical_attempts
                  WHERE date_part('milliseconds', occurred_at) <> 0), 0)::text || ' 筆非整秒',
       coalesce((SELECT count(*) FROM public.lexical_attempts
                  WHERE date_part('milliseconds', occurred_at) <> 0), 0) > 0
UNION ALL SELECT '4. session_id 大致有填（分組要靠它收緊）',
       coalesce((SELECT round(100.0 * count(*) FILTER (WHERE session_id IS NOT NULL)
                              / nullif(count(*), 0), 1)
                   FROM public.lexical_attempts), 0)::text || '% 有值',
       coalesce((SELECT count(*) FILTER (WHERE session_id IS NOT NULL)
                   FROM public.lexical_attempts), 0) > 0
UNION ALL SELECT '5. 資料時間範圍（判讀 02 的趨勢要對照修正上線日）',
       coalesce((SELECT min(occurred_at)::date::text || ' ～ ' || max(occurred_at)::date::text
                   FROM public.lexical_attempts), '（無資料）'),
       true;
