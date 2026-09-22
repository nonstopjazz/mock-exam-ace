-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- ⚠️ 開頭這一段是【在 SQL Editor 裡取得管理員身分】。
--
--    SQL Editor 沒有 JWT，所以 auth.uid() 是 NULL、is_admin() 回 NULL，
--    四支 RPC 會全部回 42501「僅限管理員」—— 看起來像 migration 壞了，其實沒有。
--
--    這一行只是把 auth.uid() 讀的那個 GUC 設成你的 user id。
--    · 不改任何資料、不改任何權限
--    · 只在這一次提交的連線內有效
--    · 你在 SQL Editor 本來就是 postgres，這【不會給你任何原本沒有的權限】，
--      只是讓 is_admin() 這個應用層判斷能通過
--
--    （auth.uid() 同時吃 request.jwt.claim.sub 與 request.jwt.claims，這裡用前者。
--      2026-09-21 以與 production 逐字相同的定義實測過。）
SELECT set_config('request.jwt.claim.sub',
                  (SELECT id::text FROM auth.users WHERE email = 'nonstopjazz@gmail.com'),
                  false) AS "已取得管理員身分";

-- A4 驗收：前 10 個 code（依學生數排序）
SELECT (r ->> 'error_code')                 AS "error_code",
       (r ->> 'student_count')::int         AS "學生數",
       (r ->> 'essay_count')::int           AS "作文數",
       (r ->> 'occurrence_count')::int      AS "findings數",
       (r ->> 'is_fallback_code')::boolean  AS "低訊號",
       (r ->> 'last_seen_at')::date         AS "最近一次"
  FROM jsonb_array_elements(
         public.writing_admin_error_overview(NULL, NULL, NULL, NULL, NULL, 10) -> 'rows'
       ) WITH ORDINALITY AS x(r, ord)
 ORDER BY x.ord;
