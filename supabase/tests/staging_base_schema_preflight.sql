-- =====================================================
-- STAGING 前置檢查 A：基礎 schema bootstrap 之前
--
-- 目標專案：cwymrzcovgobfqxtithn（gsat-staging）
--
-- ✅ 完全唯讀。✅ 純 SQL，可直接貼進 Supabase SQL Editor。
-- ✅ 結果累積在暫存表，最後以 SELECT 呈現（SQL Editor 不顯示 RAISE NOTICE）。
--
-- 最後一列 verdict = 'GO'   → 可以執行 bootstrap_mock_exam_base_schema.sql
-- 最後一列 verdict = 'STOP' → 不可執行，先看標 STOP 的那幾列
--
-- 本檔不建立任何東西，也完全不碰 iLearn 的 exam_records / exam_types。
-- =====================================================

DROP TABLE IF EXISTS pg_temp.pf2;
CREATE TEMP TABLE pf2 (seq serial, section text, item text, value text, verdict text);

-- ─────────────────────────────────────────────
-- A. 八張表都還不存在（存在就代表 staging 已經有東西，不能直接建）
-- ─────────────────────────────────────────────
INSERT INTO pf2 (section, item, value, verdict)
SELECT 'A 目標資料表', t,
       CASE WHEN to_regclass('public.' || t) IS NULL THEN '不存在（正確）' ELSE '已存在' END,
       CASE WHEN to_regclass('public.' || t) IS NULL THEN 'OK' ELSE 'STOP' END
FROM unnest(ARRAY['exams','question_groups','group_questions','vocabulary_questions',
                  'translation_questions','essay_questions','exam_attempts',
                  'exam_user_answers']) AS t;

-- ─────────────────────────────────────────────
-- B. 其他名稱也沒被占用
--
-- 共用資料庫的教訓：型別、函式、索引、政策的名稱都是 schema 全域的。
-- 名稱撞到別人的物件時，最糟的情況不是失敗，是「成功但作用在別人的表上」。
-- ─────────────────────────────────────────────
INSERT INTO pf2 (section, item, value, verdict)
SELECT 'B 名稱占用', 'type exam_status',
       CASE WHEN count(*) = 0 THEN '未占用' ELSE '已被占用' END,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typname = 'exam_status';

INSERT INTO pf2 (section, item, value, verdict)
SELECT 'B 名稱占用', 'function auto_grade_choice_answer()',
       CASE WHEN count(*) = 0 THEN '未占用' ELSE '已被占用' END,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'auto_grade_choice_answer';

INSERT INTO pf2 (section, item, value, verdict)
SELECT 'B 名稱占用', 'index ' || i,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname = 'public' AND indexname = i)
            THEN '已被占用' ELSE '未占用' END,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname = 'public' AND indexname = i)
            THEN 'STOP' ELSE 'OK' END
FROM unnest(ARRAY['idx_group_questions_group','idx_attempts_user','idx_attempts_exam',
                  'idx_attempts_status','idx_answers_attempt']) AS i;

-- 政策名稱只在「同一張表」內唯一，所以撞名不會出錯；
-- 但既然目標表都不存在，出現同名政策就代表有意料之外的東西。
INSERT INTO pf2 (section, item, value, verdict)
SELECT 'B 名稱占用', '同名 RLS 政策（其他表上）',
       coalesce(string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename), '無'),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'INFO' END
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('Published exams viewable by all',
                     'Question groups viewable for published exams',
                     'Group questions viewable for published exams',
                     'Vocab questions viewable for published exams',
                     'Translation questions viewable for published exams',
                     'Essay questions viewable for published exams',
                     'Users view own attempts','Users create own attempts','Users update own attempts',
                     'Users view own answers','Users create own answers','Users update own answers');

INSERT INTO pf2 (section, item, value, verdict)
SELECT 'B 名稱占用', 'trigger_auto_grade（任何表上）',
       CASE WHEN count(*) = 0 THEN '未占用' ELSE '已被占用' END,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname = 'trigger_auto_grade';

-- ─────────────────────────────────────────────
-- C. 平台前置條件
-- ─────────────────────────────────────────────
INSERT INTO pf2 (section, item, value, verdict)
SELECT 'C 平台前置', 'auth.users',
       CASE WHEN to_regclass('auth.users') IS NULL THEN '缺少' ELSE '存在' END,
       CASE WHEN to_regclass('auth.users') IS NULL THEN 'STOP' ELSE 'OK' END;

INSERT INTO pf2 (section, item, value, verdict)
SELECT 'C 平台前置', 'auth.uid()',
       CASE WHEN count(*) = 0 THEN '缺少' ELSE '存在' END,
       CASE WHEN count(*) = 0 THEN 'STOP' ELSE 'OK' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'auth' AND p.proname = 'uid';

INSERT INTO pf2 (section, item, value, verdict)
SELECT 'C 平台前置', 'role ' || r,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN '存在' ELSE '缺少' END,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN 'OK' ELSE 'STOP' END
FROM unnest(ARRAY['authenticated','anon']) AS r;

-- ─────────────────────────────────────────────
-- D. iLearn legacy 現況（唯讀報告；bootstrap 完全不碰它們）
-- ─────────────────────────────────────────────
DO $$
DECLARE v_t text; v_n bigint;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['exam_records','exam_types'] LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      INSERT INTO pf2 (section, item, value, verdict)
        VALUES ('D legacy iLearn', v_t, '不存在（staging 沒有 iLearn 資料）', 'INFO');
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
      INSERT INTO pf2 (section, item, value, verdict)
        VALUES ('D legacy iLearn', v_t, v_n || ' 列（bootstrap 不會碰）', 'INFO');
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- E. 順序保護：硬化物件不該先於基礎 schema 出現
-- ─────────────────────────────────────────────
INSERT INTO pf2 (section, item, value, verdict)
SELECT 'E 階段順序', 'mock_exam_% 物件（約束／索引／函式／trigger）',
       count(*) || ' 個（預期 0）',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM (
  SELECT conname AS n FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
   WHERE ns.nspname = 'public' AND conname LIKE 'mock\_exam\_%'
  UNION ALL
  SELECT indexname FROM pg_indexes
   WHERE schemaname = 'public' AND indexname LIKE 'mock\_exam\_%'
  UNION ALL
  SELECT proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND proname LIKE 'mock\_exam\_%'
  UNION ALL
  SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND NOT t.tgisinternal AND tgname LIKE 'mock\_exam\_%'
) x;

-- ─────────────────────────────────────────────
-- 總結
-- ─────────────────────────────────────────────
INSERT INTO pf2 (section, item, value, verdict)
SELECT 'Z 總結', 'STOP 項目數', count(*) FILTER (WHERE verdict = 'STOP')::text,
       CASE WHEN count(*) FILTER (WHERE verdict = 'STOP') = 0 THEN 'GO' ELSE 'STOP' END
FROM pf2;

SELECT seq, section, item, value, verdict FROM pf2 ORDER BY seq;
