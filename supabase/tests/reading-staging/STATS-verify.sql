-- =====================================================
-- reading_my_stats() 的實機驗證（唯讀）
--
-- 🟢 只要在 production 執行一次。執行模式：Run without RLS。
--
-- 這支只做一件事：借用一個真實帳號的身分，把 reading_my_stats() 叫起來，
-- 看它對【真實資料】回傳什麼。不寫入任何東西。
--
-- 🛑 為什麼要借身分：reading_my_stats() 沒有 student_id 參數，對象永遠是
--    auth.uid()。而 "Run without RLS" 之下 auth.uid() 是 NULL，
--    直接呼叫只會得到「請先登入」。set_config 只在這一個 statement 內有效
--    （is_local = true），statement 結束就沒了。
--
-- 🛑 MATERIALIZED 不是裝飾。沒有它，Postgres 可能把 me 內聯進來，
--    set_config 就不保證在 reading_my_stats() 之前跑——那會變成
--    「有時候會過」的驗證，比不驗證更糟。
--
-- 🛑 不要用 \set：Supabase SQL Editor 不吃 psql 的 meta-command。
--    要換帳號就直接改下面 WHERE u.email 那一行。
-- =====================================================

WITH me AS MATERIALIZED (
  SELECT set_config(
           'request.jwt.claims',
           json_build_object('sub', u.id)::text,
           true
         ) AS jwt
    FROM auth.users u
   WHERE u.email = 'nonstopjazz@gmail.com'
),
s AS MATERIALIZED (
  SELECT public.reading_my_stats() AS j FROM me
)
SELECT 0 AS "排序", '（合計）' AS "能力",
       (j -> 'overall' ->> 'answered')::int AS "題數",
       (j -> 'overall' ->> 'correct')::int  AS "答對",
       round(100.0 * (j -> 'overall' ->> 'correct')::int
                   / nullif((j -> 'overall' ->> 'answered')::int, 0)) AS "正確率%",
       format('%s 篇 / %s 次練習 · by_skill %s 筆 · recent %s 筆',
              j -> 'overall' ->> 'passages',
              j -> 'overall' ->> 'sessions',
              jsonb_array_length(j -> 'by_skill'),
              jsonb_array_length(j -> 'recent')) AS "備註"
  FROM s
UNION ALL
SELECT 1 + array_position(ARRAY['SM','MI','SD','CO','CD','VC'], c ->> 'construct'),
       c ->> 'construct',
       (c ->> 'answered')::int,
       (c ->> 'correct')::int,
       round(100.0 * (c ->> 'correct')::int
                   / nullif((c ->> 'answered')::int, 0)),
       coalesce(round((c ->> 'median_ms')::numeric / 1000) || ' 秒（中位數）', '—')
  FROM s, jsonb_array_elements(s.j -> 'by_construct') c
 ORDER BY 1;
