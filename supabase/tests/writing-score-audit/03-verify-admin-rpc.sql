-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- 管理員批改頁看不到分數時，先跑這支。
--
-- 🛑 為什麼需要它：
--    `REVOKE` / `GRANT` 對【舊版】函式也會成功，所以用權限表去確認
--    migration 有沒有生效是無效的驗證 —— 那是 2026-10-08 實際踩到的坑。
--    要看的是函式的【內容】。
WITH f AS (
  SELECT p.proname, p.prosrc, pg_get_function_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('writing_admin_analysis', 'writing_score_20')
)
SELECT '1. writing_admin_analysis 存在'            AS "檢查項",
       (SELECT count(*)::text FROM f WHERE proname = 'writing_admin_analysis') AS "結果",
       (SELECT count(*) FROM f WHERE proname = 'writing_admin_analysis') = 1   AS "通過"

UNION ALL SELECT '2. 🛑 它的內容有帶分數（add_writing_admin_analysis_score 生效了）',
       (SELECT (prosrc LIKE '%writing_score_20%')::text FROM f WHERE proname = 'writing_admin_analysis'),
       (SELECT prosrc LIKE '%writing_score_20%' FROM f WHERE proname = 'writing_admin_analysis')

UNION ALL SELECT '3. 只有 COMPLETED 才給分數（沒有硬算未完成的）',
       (SELECT (prosrc LIKE '%COMPLETED%')::text FROM f WHERE proname = 'writing_admin_analysis'),
       (SELECT prosrc LIKE '%COMPLETED%' FROM f WHERE proname = 'writing_admin_analysis')

UNION ALL SELECT '4. writing_score_20 是等距版（DEVELOPING = 1）',
       (SELECT (prosrc LIKE '%''DEVELOPING'' THEN 1%')::text FROM f WHERE proname = 'writing_score_20'),
       (SELECT prosrc LIKE '%''DEVELOPING'' THEN 1%' FROM f WHERE proname = 'writing_score_20')

UNION ALL SELECT '5. 🛑 類別內的 round 沒有回來（那個偏差是單向的）',
       (SELECT (prosrc NOT LIKE '%round(avg_points)%')::text FROM f WHERE proname = 'writing_score_20'),
       (SELECT prosrc NOT LIKE '%round(avg_points)%' FROM f WHERE proname = 'writing_score_20')

UNION ALL SELECT '6. 三個端點（應為 20 / 13 / 7）',
       (SELECT string_agg(s, ' / ' ORDER BY ord) FROM (
          SELECT 1 AS ord, (public.writing_score_20(jsonb_build_object('categories',
            (SELECT jsonb_agg(jsonb_build_object('code','W'||i,'skills',
               jsonb_build_array(jsonb_build_object('code','x','state','STRONG'))))
               FROM generate_series(1,5) i))) ->> 'score') AS s
          UNION ALL SELECT 2, (public.writing_score_20(jsonb_build_object('categories',
            (SELECT jsonb_agg(jsonb_build_object('code','W'||i,'skills',
               jsonb_build_array(jsonb_build_object('code','x','state','ADEQUATE'))))
               FROM generate_series(1,5) i))) ->> 'score')
          UNION ALL SELECT 3, (public.writing_score_20(jsonb_build_object('categories',
            (SELECT jsonb_agg(jsonb_build_object('code','W'||i,'skills',
               jsonb_build_array(jsonb_build_object('code','x','state','DEVELOPING'))))
               FROM generate_series(1,5) i))) ->> 'score')
        ) t),
       (SELECT (public.writing_score_20(jsonb_build_object('categories',
          (SELECT jsonb_agg(jsonb_build_object('code','W'||i,'skills',
             jsonb_build_array(jsonb_build_object('code','x','state','DEVELOPING'))))
             FROM generate_series(1,5) i))) ->> 'score')::int = 7)

UNION ALL SELECT '7. 🛑 MINIMAL = 0 已部署（add_writing_state_minimal 生效了）',
       (SELECT (prosrc LIKE '%''MINIMAL''%THEN 0%')::text FROM f WHERE proname = 'writing_score_20'),
       (SELECT prosrc LIKE '%''MINIMAL''%THEN 0%' FROM f WHERE proname = 'writing_score_20')

UNION ALL SELECT '8. 🛑 不認得的 state 會 fail loud（不是靜默排除）',
       (SELECT (prosrc LIKE '%NOT IN%')::text FROM f WHERE proname = 'writing_score_20'),
       (SELECT prosrc LIKE '%NOT IN%' FROM f WHERE proname = 'writing_score_20')

UNION ALL SELECT '9. 🛑 全 MINIMAL 換算出 0 分（量表下限真的是 0）',
       coalesce((public.writing_score_20(jsonb_build_object('categories',
          (SELECT jsonb_agg(jsonb_build_object('code','W'||i,'skills',
             jsonb_build_array(jsonb_build_object('code','x','state','MINIMAL'))))
             FROM generate_series(1,5) i))) ->> 'score'), '(沒有分數)'),
       (public.writing_score_20(jsonb_build_object('categories',
          (SELECT jsonb_agg(jsonb_build_object('code','W'||i,'skills',
             jsonb_build_array(jsonb_build_object('code','x','state','MINIMAL'))))
             FROM generate_series(1,5) i))) ->> 'score')::int = 0;

-- 判讀：
--   第 2 項 false → add_writing_admin_analysis_score.sql 要重跑
--   第 7 / 9 項 false → add_writing_state_minimal.sql 還沒跑
--   🛑 第 8 項 false 而第 7 項 true 幾乎不可能同時發生；真的出現就是有人
--      手動改過函式，而且把 fail-loud 拿掉了 —— 那會讓分數在部署錯序時偏高
--   全部 true 但畫面還是沒有分數卡 → 是前端沒部署或瀏覽器拿到舊 bundle
--     （強制重新載入；批改頁現在會明說「分數讀不到」而不是靜默）
