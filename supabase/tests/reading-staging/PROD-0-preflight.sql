-- =====================================================
-- Production 上線前檢查
-- 🟢 【唯讀】不建立、不修改任何東西。跑幾次都一樣。
--
-- ⚠️ 目錄名稱寫 staging 是歷史遺留的，這一整套 staging 與 production 都適用。
--
-- 這支要回答的是【production 跟 staging 有什麼不一樣】。
-- 「staging 過了」不等於 production 會過——同一份 migration 在兩個環境
-- 可能走不同的分支（lexical_items 就是），而沒走過的分支等於沒測過。
--
-- 判讀：最後一張表的「結果」欄【全部】要是 ✅ 才開始跑 migration。
-- =====================================================

WITH
objects(kind, name) AS (VALUES
  ('table','reading_passages'), ('table','reading_questions'),
  ('table','reading_question_keys'), ('table','reading_question_skills'),
  ('table','reading_passage_paragraphs'), ('table','reading_passage_vocab'),
  ('table','reading_sessions'), ('table','reading_attempts'),
  ('table','reading_import_batches'),
  ('func','reading_publish_readiness'), ('func','reading_guard_publish'),
  ('func','reading_get_passage'), ('func','reading_submit_answer'),
  ('func','reading_start_session'), ('func','reading_finish_session'),
  ('func','reading_canonical_hash'), ('func','reading_import_one_passage'),
  ('func','reading_import_batch')),

-- ① 這 18 個名字現在都不該存在。存在代表有人先跑過了，
--    或撞名——兩種情況都要先搞清楚再動手。
chk_clean(排序, 區塊, 檢查, 期望, 實際) AS (
  SELECT 1, '① 乾淨', '還沒有任何 reading_* 物件', '0 個',
         (SELECT count(*) FROM objects o
           WHERE (o.kind='table' AND to_regclass('public.'||o.name) IS NOT NULL)
              OR (o.kind='func' AND EXISTS (
                    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname=o.name)))::text || ' 個'),

-- ② 🛑 這是 staging 沒有走過的分支。
--    production 有 lexical_items，所以 create_reading_passage_aux.sql
--    會【真的去加】那條外鍵；staging 當時是略過的。
chk_lexical(排序, 區塊, 檢查, 期望, 實際) AS (
  SELECT 2, '② 分支差異', 'lexical_items 存在 → 外鍵這次會真的加上', '存在',
         CASE WHEN to_regclass('public.lexical_items') IS NULL
              THEN '不存在（外鍵會略過，跟 staging 一樣）' ELSE '存在' END),

-- ③ 前置：is_admin() 必須存在，否則匯入 RPC 建不起來也叫不動
chk_is_admin(排序, 區塊, 檢查, 期望, 實際) AS (
  SELECT 3, '③ 前置', 'is_admin() 存在', '存在',
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                            WHERE n.nspname='public' AND p.proname='is_admin')
              THEN '存在' ELSE '🛑 不存在' END),
chk_authusers(排序, 區塊, 檢查, 期望, 實際) AS (
  SELECT 4, '③ 前置', 'auth.users 可讀', '可讀',
         CASE WHEN to_regclass('auth.users') IS NULL THEN '🛑 讀不到' ELSE '可讀' END),

-- ④ 🛑 管理員必須在掃描範圍內。
--    驗證腳本與匯入檔都是「逐一切換身分去問 is_admin()」，
--    掃最早的 1000 位。production 的使用者比 staging 多很多，
--    管理員如果不在這 1000 位裡，那些腳本會直接失敗。
chk_admin_found(排序, 區塊, 檢查, 期望, 實際) AS (
  SELECT 5, '④ 管理員', '在最早的 1000 位使用者裡找得到管理員', '找得到',
         (SELECT CASE WHEN a.email IS NULL THEN '🛑 找不到' ELSE '找得到' END
            FROM (SELECT (SELECT email FROM auth.users WHERE id = x.id) AS email
                    FROM (SELECT id FROM auth.users ORDER BY created_at LIMIT 1000) x
                   WHERE (SELECT coalesce(public.is_admin(), false)
                            FROM (SELECT set_config('request.jwt.claims',
                                    json_build_object('sub', x.id)::text, true)) s)
                   LIMIT 1) a)),
chk_user_count(排序, 區塊, 檢查, 期望, 實際) AS (
  SELECT 6, '④ 管理員', '使用者總數（超過 1000 要告訴我）', '1000 以內',
         CASE WHEN (SELECT count(*) FROM auth.users) > 1000
              THEN '⚠️ ' || (SELECT count(*) FROM auth.users)::text || ' 位'
              ELSE '1000 以內' END),

-- ⑤ 邊界：現在就不該有任何 reading 相關的外鍵
chk_boundary(排序, 區塊, 檢查, 期望, 實際) AS (
  SELECT 7, '⑤ 邊界', '目前沒有任何 reading_* 外鍵', '0 條',
         (SELECT count(*) FROM pg_constraint con
            JOIN pg_class src ON src.oid = con.conrelid
            JOIN pg_class tgt ON tgt.oid = con.confrelid
           WHERE con.contype='f'
             AND (src.relname LIKE 'reading\_%' OR tgt.relname LIKE 'reading\_%'))::text || ' 條'),

all_checks AS (
  SELECT * FROM chk_clean UNION ALL SELECT * FROM chk_lexical
  UNION ALL SELECT * FROM chk_is_admin UNION ALL SELECT * FROM chk_authusers
  UNION ALL SELECT * FROM chk_admin_found UNION ALL SELECT * FROM chk_user_count
  UNION ALL SELECT * FROM chk_boundary)

SELECT 區塊, 檢查, 期望, 實際,
       CASE WHEN 期望 = 實際 THEN '✅' ELSE '🛑 先停下來' END AS 結果
  FROM all_checks
 ORDER BY (CASE WHEN 期望 = 實際 THEN 1 ELSE 0 END), 排序;
