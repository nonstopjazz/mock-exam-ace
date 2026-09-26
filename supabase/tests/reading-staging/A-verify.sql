-- =====================================================
-- Group A 驗證：Core data model
-- 🟢 【唯讀】不改任何資料。staging 與 production 都安全。
--
-- 執行時機：跑完這四支之後
--   create_reading_passages / _questions / _passage_aux / _sessions
--
-- 判讀：最後一張表的「結果」欄【全部】要是 ✅。
--       Supabase SQL Editor 只顯示最後一個查詢的結果，所以整份貼進去就好。
-- =====================================================

WITH
tables_expected(t) AS (VALUES
  ('reading_passages'), ('reading_questions'), ('reading_question_keys'),
  ('reading_question_skills'), ('reading_passage_paragraphs'),
  ('reading_passage_vocab'), ('reading_sessions'), ('reading_attempts')),

-- ① 八張表都在
chk_tables AS (
  SELECT 'A1 表' AS 區塊, t AS 檢查, '存在' AS 期望,
         CASE WHEN to_regclass('public.' || t) IS NULL THEN '不存在' ELSE '存在' END AS 實際
    FROM tables_expected),

-- ② RLS 全部開著
chk_rls AS (
  SELECT 'A2 RLS', t, 'RLS 開啟',
         CASE WHEN c.relrowsecurity THEN 'RLS 開啟' ELSE '🛑 沒開' END
    FROM tables_expected
    JOIN pg_class c ON c.oid = to_regclass('public.' || t)),

-- ③ authenticated 讀得到什麼
--    🛑 答案表與 micro-skill 表【完全不給】。答案的安全性靠這一層，
--       不是靠學生端 RPC 的回傳形狀——RPC 是可以被繞過的。
chk_read(區塊, 檢查, 期望, 實際) AS (
  SELECT 'A3 讀取', x.t, CASE WHEN x.want THEN '可讀' ELSE '🛑 不可讀' END,
         CASE WHEN has_table_privilege('authenticated','public.'||x.t,'SELECT')
              THEN '可讀' ELSE '🛑 不可讀' END
    FROM (VALUES
      ('reading_passages', true), ('reading_questions', true),
      ('reading_passage_paragraphs', true), ('reading_passage_vocab', true),
      ('reading_sessions', true), ('reading_attempts', true),
      ('reading_question_keys', false), ('reading_question_skills', false)
    ) AS x(t, want)),

-- ④ authenticated 一律不可寫。寫入只能走 SECURITY DEFINER RPC。
chk_write AS (
  SELECT 'A4 寫入', t || ' 不可寫', '不可寫',
         CASE WHEN has_table_privilege('authenticated','public.'||t,'INSERT')
                OR has_table_privilege('authenticated','public.'||t,'UPDATE')
                OR has_table_privilege('authenticated','public.'||t,'DELETE')
              THEN '🛑 可寫' ELSE '不可寫' END
    FROM tables_expected),

-- ⑤ 答案表沒有任何給 authenticated 的 policy
--    🛑 兩道獨立的鎖：沒有 grant，而且沒有 policy。
--       其中一道將來被誰不小心打開，另一道還在。
chk_key_policy AS (
  SELECT 'A5 答案表', 'reading_question_keys 沒有 authenticated policy', '0 條',
         (SELECT count(*) FROM pg_policies
           WHERE schemaname='public' AND tablename='reading_question_keys'
             AND 'authenticated' = ANY(roles))::text || ' 條'),

-- ⑥ 關鍵的唯一性與外鍵
chk_con(區塊, 檢查, 期望, 實際) AS (
  SELECT 'A6 約束', x.label, '存在',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conrelid = to_regclass('public.'||x.tbl)
              AND contype = x.kind
              AND pg_get_constraintdef(oid) ILIKE x.pat)
         THEN '存在' ELSE '🛑 缺少' END
    FROM (VALUES
      ('reading_questions','一篇每個 construct 最多一題','u','UNIQUE (passage_id, construct)'),
      ('reading_attempts','一個 session 每題只能一筆','u','UNIQUE (session_id, question_id)'),
      ('reading_passage_vocab','同篇同層同詞只有一筆','u','UNIQUE (passage_id, tier, term)'),
      ('reading_questions','questions → passages 外鍵','f','%reading_passages%'),
      ('reading_question_keys','keys → questions 外鍵','f','%reading_questions%'),
      ('reading_attempts','attempts → sessions 外鍵','f','%reading_sessions%'),
      ('reading_sessions','sessions → auth.users 外鍵','f','%users%')
    ) AS x(tbl, label, kind, pat)),

-- ⑦ 同一位學生同一篇只能有一個進行中的 session（partial unique index）
chk_one_active AS (
  SELECT 'A6 約束', '同一學生同一篇只有一個進行中 session', '存在',
         CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                            WHERE schemaname='public'
                              AND indexname='reading_sessions_one_active')
              THEN '存在' ELSE '🛑 缺少' END),

-- ⑧ CHECK 白名單
chk_checks(區塊, 檢查, 期望, 實際) AS (
  SELECT 'A7 值域', x.label, '有 CHECK',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conrelid = to_regclass('public.'||x.tbl)
              AND contype='c' AND pg_get_constraintdef(oid) ILIKE x.pat)
         THEN '有 CHECK' ELSE '🛑 沒有' END
    FROM (VALUES
      ('reading_questions','construct 只能是六個短碼','%SM%MI%SD%CO%CD%VC%'),
      ('reading_passages','cefr_level 白名單','%A1%B2%C2%'),
      ('reading_passages','status 白名單','%DRAFT%PUBLISHED%ARCHIVED%'),
      ('reading_question_skills','emphasis 0–100','%emphasis%0%100%'),
      ('reading_attempts','selected_answer 只能 A/B/C/D','%selected_answer%'),
      ('reading_passage_vocab','tier 白名單','%CANDIDATE%ACADEMIC%KNOWLEDGE%')
    ) AS x(tbl, label, pat)),

-- ⑨ emphasis 必須允許 NULL（NULL = 沒有這個資訊，不是 0）
chk_emphasis_null AS (
  SELECT 'A7 值域', 'emphasis 允許 NULL（NULL ≠ 0）', '允許',
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema='public' AND table_name='reading_question_skills'
                              AND column_name='emphasis' AND is_nullable='YES')
              THEN '允許' ELSE '🛑 NOT NULL' END),

-- ⑩ 🛑 與模考系統零耦合
--    reading_* 的外鍵只能指向 reading_* / auth.users / lexical_items。
--    指到任何模考的表就是邊界破了。
chk_boundary AS (
  SELECT 'A8 邊界', '外鍵沒有指向模考系統', '0 條',
         (SELECT count(*) FROM pg_constraint con
            JOIN pg_class src ON src.oid = con.conrelid
            JOIN pg_class tgt ON tgt.oid = con.confrelid
           WHERE con.contype='f' AND src.relname LIKE 'reading\_%'
             AND tgt.relname NOT LIKE 'reading\_%'
             AND tgt.relname NOT IN ('users','lexical_items'))::text || ' 條'),
chk_boundary2 AS (
  SELECT 'A8 邊界', '模考系統沒有外鍵指過來', '0 條',
         (SELECT count(*) FROM pg_constraint con
            JOIN pg_class src ON src.oid = con.conrelid
            JOIN pg_class tgt ON tgt.oid = con.confrelid
           WHERE con.contype='f' AND src.relname NOT LIKE 'reading\_%'
             AND tgt.relname LIKE 'reading\_%')::text || ' 條'),

-- ⑪ 這時候還不該有任何資料
chk_empty AS (
  SELECT 'A9 資料', 'reading_passages 目前是空的', '0 列',
         (SELECT count(*) FROM reading_passages)::text || ' 列'),

all_checks AS (
  SELECT * FROM chk_tables UNION ALL SELECT * FROM chk_rls
  UNION ALL SELECT * FROM chk_read UNION ALL SELECT * FROM chk_write
  UNION ALL SELECT * FROM chk_key_policy UNION ALL SELECT * FROM chk_con
  UNION ALL SELECT * FROM chk_one_active UNION ALL SELECT * FROM chk_checks
  UNION ALL SELECT * FROM chk_emphasis_null
  UNION ALL SELECT * FROM chk_boundary UNION ALL SELECT * FROM chk_boundary2
  UNION ALL SELECT * FROM chk_empty)

SELECT 區塊, 檢查, 期望, 實際,
       CASE WHEN 期望 = 實際 THEN '✅' ELSE '🛑 FAIL' END AS 結果
  FROM all_checks
 ORDER BY (CASE WHEN 期望 = 實際 THEN 1 ELSE 0 END), 區塊, 檢查;
