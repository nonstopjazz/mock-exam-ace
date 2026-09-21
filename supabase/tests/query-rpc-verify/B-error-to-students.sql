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

-- 🛑 特別看清單尾端 —— 1 篇 / 1 finding 的學生必須在裡面
SELECT (r ->> 'student_name')            AS "學生",
       (r ->> 'essay_count')::int        AS "幾篇作文",
       (r ->> 'occurrence_count')::int   AS "findings數",
       (r ->> 'first_seen_at')::date     AS "最早",
       (r ->> 'last_seen_at')::date      AS "最近",
       (r -> 'matched_codes')            AS "中的code"
  FROM jsonb_array_elements(
         public.writing_admin_error_students(
           NULL, NULL, NULL, NULL, ARRAY['WRITE_ERR_ARTICLE'], 200) -> 'rows'
       ) WITH ORDINALITY AS x(r, ord)
 ORDER BY x.ord;
