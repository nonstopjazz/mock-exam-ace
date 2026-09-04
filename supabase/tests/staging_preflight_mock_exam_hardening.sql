-- =====================================================
-- STAGING 前置檢查：mock 模考 schema 硬化
--
-- 目標專案：cwymrzcovgobfqxtithn（gsat-staging）
--
-- ✅ 純唯讀。不建立、不修改、不刪除任何 schema 物件或資料。
-- ✅ 純 SQL，可直接貼進 Supabase SQL Editor（沒有 \ir、\echo、\set）。
-- ✅ 結果累積在暫存表，最後以 SELECT 呈現
--    —— SQL Editor 不會顯示 RAISE NOTICE，所以不能只靠 NOTICE。
--
-- 用法：整份貼進 SQL Editor 執行，看最後一張結果表。
--   最後一列 verdict = 'GO'   → 可以進行 migration
--   最後一列 verdict = 'STOP' → 不可進行，先看 STOP 的那幾列
--
-- 這份檢查不會執行 migration。套用 migration 是獨立的手動步驟。
-- =====================================================

DROP TABLE IF EXISTS pg_temp.preflight;
CREATE TEMP TABLE preflight (
  seq     serial,
  section text,
  item    text,
  value   text,
  verdict text          -- 'OK' | 'INFO' | 'STOP'
);

-- ─────────────────────────────────────────────
-- A. 零列前提
--
-- 本次硬化之所以免費，正是因為 mock 考試領域還是空的。
-- 第一筆真實作答寫入的那一刻，這個窗口就關閉了。
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_t text;
  v_n bigint;
  v_tables text[] := ARRAY[
    'exams','question_groups','group_questions','vocabulary_questions',
    'translation_questions','essay_questions','exam_attempts','exam_user_answers'];
  -- 這兩張表有任何一列，硬化就必須先做資料清理，不能直接套用
  v_blocking text[] := ARRAY['exam_attempts','exam_user_answers'];
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      INSERT INTO preflight (section, item, value, verdict)
        VALUES ('A 零列前提', v_t, '資料表不存在', 'STOP');
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
      INSERT INTO preflight (section, item, value, verdict)
        VALUES ('A 零列前提', v_t, v_n || ' 列',
                CASE
                  WHEN v_n = 0 THEN 'OK'
                  WHEN v_t = ANY (v_blocking) THEN 'STOP'
                  ELSE 'INFO'   -- 有考題內容不阻擋硬化，但要知道
                END);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- B. 應該已經存在的 mock 物件
-- ─────────────────────────────────────────────
INSERT INTO preflight (section, item, value, verdict)
SELECT 'B 既有物件', t, 
       CASE WHEN to_regclass('public.' || t) IS NULL THEN '缺少' ELSE '存在' END,
       CASE WHEN to_regclass('public.' || t) IS NULL THEN 'STOP' ELSE 'OK' END
FROM unnest(ARRAY['exam_user_answers','exam_attempts','vocabulary_questions',
                  'group_questions','translation_questions','essay_questions']) AS t;

INSERT INTO preflight (section, item, value, verdict)
SELECT 'B 既有物件', 'auto_grade_choice_answer()',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public' AND p.proname = 'auto_grade_choice_answer')
            THEN '存在' ELSE '缺少' END,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public' AND p.proname = 'auto_grade_choice_answer')
            THEN 'OK' ELSE 'STOP' END;

INSERT INTO preflight (section, item, value, verdict)
SELECT 'B 既有物件', 'trigger_auto_grade',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                         JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relname = 'exam_user_answers'
                           AND t.tgname = 'trigger_auto_grade')
            THEN '存在' ELSE '缺少' END,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                         JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relname = 'exam_user_answers'
                           AND t.tgname = 'trigger_auto_grade')
            THEN 'OK' ELSE 'STOP' END;

-- ─────────────────────────────────────────────
-- C. 硬化物件「還不存在」
--
-- migration 是一次性的。如果這裡有任何一項已經存在，
-- 代表它已經被套用過（或被套用了一半），重跑會在中途炸掉。
-- ─────────────────────────────────────────────
INSERT INTO preflight (section, item, value, verdict)
SELECT 'C 硬化物件尚未存在', 'exam_user_answers.' || c,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
                           AND column_name = c) THEN '已存在' ELSE '尚未存在' END,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
                           AND column_name = c) THEN 'STOP' ELSE 'OK' END
FROM unnest(ARRAY['grading_status','max_score','grading_method',
                  'question_id','question_kind']) AS c;

INSERT INTO preflight (section, item, value, verdict)
SELECT 'C 硬化物件尚未存在', 'generated column',
       count(*) || ' 個（預期 0）',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
  AND is_generated = 'ALWAYS';

INSERT INTO preflight (section, item, value, verdict)
SELECT 'C 硬化物件尚未存在', 'mock_exam_% 約束',
       coalesce(string_agg(c.conname, ', ' ORDER BY c.conname), '無') ,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND c.conname LIKE 'mock\_exam\_%';

INSERT INTO preflight (section, item, value, verdict)
SELECT 'C 硬化物件尚未存在', 'mock_exam_% 索引',
       coalesce(string_agg(indexname, ', ' ORDER BY indexname), '無'),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'mock\_exam\_%';

INSERT INTO preflight (section, item, value, verdict)
SELECT 'C 硬化物件尚未存在', 'mock_exam_% 函式',
       coalesce(string_agg(p.proname, ', ' ORDER BY p.proname), '無'),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'mock\_exam\_%';

INSERT INTO preflight (section, item, value, verdict)
SELECT 'C 硬化物件尚未存在', 'mock_exam_% trigger',
       coalesce(string_agg(t.tgname, ', ' ORDER BY t.tgname), '無'),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname LIKE 'mock\_exam\_%';

-- ─────────────────────────────────────────────
-- D. legacy iLearn 共存現況（唯讀報告，不得修改）
--
-- exam_records / exam_types 是 iLearn「老師手動輸入成績」的功能，
-- 完全不在本次範圍內。這裡只拍照，之後用共存測試比對。
-- ─────────────────────────────────────────────
DO $$
DECLARE v_t text; v_n bigint;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['exam_records','exam_types'] LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      -- staging 不一定有 iLearn 的資料表；沒有就沒有，不是錯誤
      INSERT INTO preflight (section, item, value, verdict)
        VALUES ('D legacy iLearn', v_t, '不存在（staging 可能沒有 iLearn 資料）', 'INFO');
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
      INSERT INTO preflight (section, item, value, verdict)
        VALUES ('D legacy iLearn', v_t, v_n || ' 列', 'INFO');
    END IF;
  END LOOP;
END $$;

INSERT INTO preflight (section, item, value, verdict)
SELECT 'D legacy iLearn', 'RLS 政策數（exam_records + exam_types）',
       count(*)::text, 'INFO'
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('exam_records','exam_types');

INSERT INTO preflight (section, item, value, verdict)
SELECT 'D legacy iLearn', 'trigger 數（exam_records + exam_types）',
       count(*)::text, 'INFO'
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('exam_records','exam_types');

-- ─────────────────────────────────────────────
-- E. 權限快照（migration 之前的狀態，供日後比對）
-- ─────────────────────────────────────────────
INSERT INTO preflight (section, item, value, verdict)
SELECT 'E 權限快照', '表級授權 ' || table_name || ' → ' || grantee,
       string_agg(privilege_type, ', ' ORDER BY privilege_type), 'INFO'
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('exam_user_answers','exam_attempts')
GROUP BY table_name, grantee;

-- 注意：information_schema.column_privileges 會把「表級」授權展開成每一欄，
-- 所以它的筆數看起來永遠不是 0。真正代表「有欄位級限制」的是 pg_attribute.attacl。
INSERT INTO preflight (section, item, value, verdict)
SELECT 'E 權限快照', '欄位級 ACL ' || c.relname,
       count(*) FILTER (WHERE a.attacl IS NOT NULL) || ' 欄有明確欄位級授權（硬化前預期 0）',
       CASE WHEN count(*) FILTER (WHERE a.attacl IS NOT NULL) = 0 THEN 'OK' ELSE 'STOP' END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relname IN ('exam_user_answers','exam_attempts')
GROUP BY c.relname;

INSERT INTO preflight (section, item, value, verdict)
SELECT 'E 權限快照', 'RLS 政策 ' || tablename || ' / ' || policyname,
       cmd || ' → ' || coalesce(array_to_string(roles, ','), ''), 'INFO'
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('exam_user_answers','exam_attempts');

INSERT INTO preflight (section, item, value, verdict)
SELECT 'E 權限快照', 'RLS 是否啟用 ' || c.relname,
       CASE WHEN c.relrowsecurity THEN '啟用' ELSE '未啟用' END,
       CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'STOP' END
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('exam_user_answers','exam_attempts');

-- ─────────────────────────────────────────────
-- F. schema 形狀是否與 fixture 假設一致
--
-- migration 是照著正式環境稽核出來的形狀寫的。
-- 少一欄或多一欄都可能讓它做出非預期的事。
-- ─────────────────────────────────────────────
INSERT INTO preflight (section, item, value, verdict)
SELECT 'F schema 形狀', 'exam_user_answers 缺少預期欄位',
       coalesce(string_agg(c, ', ' ORDER BY c), '無'),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM unnest(ARRAY['id','attempt_id','vocabulary_question_id','group_question_id',
                  'translation_question_id','essay_question_id','user_answer',
                  'is_correct','score_earned','grader_feedback','graded_by','graded_at',
                  'created_at','updated_at','time_spent_seconds']) AS c
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
                    AND column_name = c);

INSERT INTO preflight (section, item, value, verdict)
SELECT 'F schema 形狀', 'exam_attempts 缺少預期欄位',
       coalesce(string_agg(c, ', ' ORDER BY c), '無'),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'STOP' END
FROM unnest(ARRAY['id','user_id','exam_id','started_at','submitted_at','time_spent_seconds',
                  'status','vocabulary_score','cloze_score','contextual_score','structure_score',
                  'reading_score','mixed_score','translation_score','essay_score','total_score',
                  'created_at','updated_at']) AS c
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'exam_attempts'
                    AND column_name = c);

INSERT INTO preflight (section, item, value, verdict)
SELECT 'F schema 形狀', 'score_earned 的 DEFAULT（migration 要移除的那個）',
       coalesce(column_default, '無'),
       CASE WHEN column_default IS NOT NULL THEN 'OK'
            ELSE 'STOP' END   -- 已經沒有 DEFAULT，代表可能已被動過
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
  AND column_name = 'score_earned';

INSERT INTO preflight (section, item, value, verdict)
SELECT 'F schema 形狀', 'user_answer 目前是否可為 NULL（migration 會改成 NOT NULL）',
       is_nullable, CASE WHEN is_nullable = 'YES' THEN 'OK' ELSE 'INFO' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
  AND column_name = 'user_answer';

INSERT INTO preflight (section, item, value, verdict)
SELECT 'F schema 形狀', 'single_question_source 約束',
       CASE WHEN count(*) > 0 THEN '存在' ELSE '缺少' END,
       CASE WHEN count(*) > 0 THEN 'OK' ELSE 'STOP' END
FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'exam_user_answers'
  AND c.conname = 'single_question_source';

-- 硬化後的唯一鍵是 (attempt_id, question_id)。
-- 如果現在就已經有一個同欄位的唯一索引，代表 schema 被動過。
INSERT INTO preflight (section, item, value, verdict)
SELECT 'F schema 形狀', 'exam_user_answers 現有唯一索引',
       coalesce(string_agg(indexname || ' → ' || indexdef, ' / ' ORDER BY indexname), '無'),
       'INFO'
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'exam_user_answers'
  AND indexdef LIKE '%UNIQUE%';

-- ─────────────────────────────────────────────
-- 總結
-- ─────────────────────────────────────────────
INSERT INTO preflight (section, item, value, verdict)
SELECT 'Z 總結', 'STOP 項目數', count(*) FILTER (WHERE verdict = 'STOP')::text,
       CASE WHEN count(*) FILTER (WHERE verdict = 'STOP') = 0 THEN 'GO' ELSE 'STOP' END
FROM preflight;

SELECT seq, section, item, value, verdict
FROM preflight
ORDER BY seq;
