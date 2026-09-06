-- =====================================================
-- 上線前的資料隔離檢查 —— 只涵蓋這次上線真的會用到的資料表
--
-- ✅ 唯讀。可以安全地在 staging 或正式環境的 SQL Editor 直接貼上執行。
--    不寫入、不切換身分、不呼叫任何會改狀態的函式。
--
-- 🛑 刻意【不】檢查 PRODUCTION_SCHEMA_AUDIT.md §9.1 那 11 張 legacy 表
--    （assignments / student_tasks / users / courses / exam_records …）。
--    它們屬於另一個應用程式，不在這次上線的資料路徑上，
--    未經呼叫端分析就動它們會弄壞別的東西。
--
-- 判讀方式：
--   rls              必須是 t（learn_* 與 writing_analyses / writing_teacher_feedback
--                    是零授權 + RLS，兩層都要成立）
--   anon_grants      對存放個人資料的表必須是 0
--   policies         RLS 開著卻 0 條政策 = deny-all（零授權表的預期狀態）
--                    RLS 開著且有政策 = 靠政策隔離，要看政策內容
-- =====================================================

WITH surface(tbl, section) AS (
  VALUES
    ('user_profiles',           '1 身分'),
    ('packs',                   '2 字卡'),
    ('pack_items',              '2 字卡'),
    ('pack_item_progress',      '2 字卡'),
    ('user_pack_claims',        '2 字卡'),
    ('user_stats',              '3 學習紀錄'),
    ('exam_attempts',           '4 成績'),
    ('exams',                   '4 成績'),
    ('writing_submissions',     '5 作文'),
    ('writing_texts',           '5 作文'),
    ('writing_analyses',        '5 作文'),
    ('writing_teacher_feedback','5 作文'),
    ('learn_classes',           '6 班級/任務'),
    ('learn_class_members',     '6 班級/任務'),
    ('learn_tasks',             '6 班級/任務'),
    ('learn_task_assignees',    '6 班級/任務'),
    ('learn_task_logs',         '6 班級/任務')
)
SELECT
  s.section                                      AS "區塊",
  s.tbl                                          AS "資料表",
  CASE WHEN c.oid IS NULL THEN '不存在'
       WHEN c.relrowsecurity THEN 'ON' ELSE '🔴 OFF' END AS "RLS",
  coalesce((SELECT count(*) FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = s.tbl), 0) AS "政策數",
  coalesce((SELECT count(*) FROM information_schema.role_table_grants g
             WHERE g.table_schema = 'public' AND g.table_name = s.tbl
               AND g.grantee = 'anon'), 0)       AS "anon授權",
  coalesce((SELECT count(*) FROM information_schema.role_table_grants g
             WHERE g.table_schema = 'public' AND g.table_name = s.tbl
               AND g.grantee = 'authenticated'), 0) AS "authenticated授權",
  CASE
    WHEN c.oid IS NULL                                   THEN '⚠️ 這個環境沒有這張表'
    WHEN NOT c.relrowsecurity                            THEN '🔴 RLS 關閉——必須處理'
    WHEN (SELECT count(*) FROM information_schema.role_table_grants g
           WHERE g.table_schema='public' AND g.table_name=s.tbl
             AND g.grantee IN ('anon','authenticated')) = 0
                                                         THEN '✅ 零授權 + RLS（只能走 RPC）'
    WHEN (SELECT count(*) FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename=s.tbl) = 0
                                                         THEN '🔴 有授權但 0 條政策 = 全開'
    ELSE '✅ RLS + 政策（請確認政策內容為 owner-scoped）'
  END                                            AS "判讀"
FROM surface s
LEFT JOIN pg_class c
  ON c.relname = s.tbl
 AND c.relnamespace = 'public'::regnamespace
ORDER BY s.section, s.tbl;
