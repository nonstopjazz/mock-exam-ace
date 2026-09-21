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

-- 取 A6 選出的那位學生，看他 findings 最多的那個 code 的完整紀錄。
-- 🛑 correction 原樣回傳，不截斷 —— 約 15% 是整句改寫，這裡看得到。
WITH picked AS (
  SELECT (r ->> 'student_id')::uuid AS sid, r ->> 'error_code' AS code
    FROM jsonb_array_elements(
           public.writing_admin_student_errors(
             NULL,NULL,NULL,NULL, ARRAY['WRITE_ERR_ARTICLE'], 1) -> 'rows') r
   ORDER BY (r ->> 'occurrence_count')::int DESC
   LIMIT 1)
SELECT (r ->> 'essay_submitted_at')::date AS "日期",
       (r ->> 'essay_topic')              AS "題目",
       (r ->> 'error_code')               AS "code",
       (r ->> 'quote')                    AS "原文",
       (r ->> 'correction')               AS "修正",
       left(r ->> 'reason', 60)           AS "說明",
       length(r ->> 'correction')         AS "修正長度"
  FROM picked p,
       jsonb_array_elements(
         public.writing_admin_error_findings(p.sid, p.code, NULL,NULL,NULL,NULL, 20) -> 'rows'
       ) WITH ORDINALITY AS x(r, ord)
 ORDER BY x.ord;
