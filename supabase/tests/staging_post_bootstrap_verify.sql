-- =====================================================
-- STAGING 驗證 C：基礎 schema bootstrap「之後」
--
-- 目標專案：cwymrzcovgobfqxtithn（gsat-staging）
--
-- ✅ 完全唯讀。✅ 純 SQL，可直接貼進 Supabase SQL Editor。
-- ✅ 結果累積在暫存表，最後以 SELECT 呈現。
--
-- 這一份做結構斷言。逐行的完整比對請另外執行
-- supabase/tests/mock_exam_schema_fingerprint.sql，
-- 與正式環境的輸出（或 mock_exam_base_schema.expected.txt）diff。
-- 兩者互補：斷言抓「明顯缺件」，指紋抓「細微不同」。
--
-- 這份會確認 bootstrap「只做了基礎 schema」：
--   · 八張表、索引、RLS、政策、trigger、函式、ENUM 都在
--   · 沒有任何一列資料
--   · 硬化物件一個都還沒出現（階段 2 尚未執行）
--   · iLearn 沒有被建立、參照或修改
-- =====================================================

DROP TABLE IF EXISTS pg_temp.pv;
CREATE TEMP TABLE pv (seq serial, id text, result text, detail text);

-- ── 1. 八張表 ──
INSERT INTO pv (id, result, detail)
SELECT 'TAB ' || t,
       CASE WHEN to_regclass('public.' || t) IS NULL THEN 'FAIL' ELSE 'PASS' END,
       CASE WHEN to_regclass('public.' || t) IS NULL THEN '資料表不存在' ELSE '存在' END
FROM unnest(ARRAY['exams','question_groups','group_questions','vocabulary_questions',
                  'translation_questions','essay_questions','exam_attempts',
                  'exam_user_answers']) AS t;

-- ── 2. 欄位數 ──
INSERT INTO pv (id, result, detail)
SELECT 'COLCOUNT ' || e.t,
       CASE WHEN coalesce(a.n, 0) = e.n THEN 'PASS' ELSE 'FAIL' END,
       '欄位數 ' || coalesce(a.n, 0) || '（預期 ' || e.n || '）'
FROM (VALUES ('exams', 12), ('question_groups', 20), ('group_questions', 22),
             ('vocabulary_questions', 15), ('translation_questions', 14),
             ('essay_questions', 15), ('exam_attempts', 18), ('exam_user_answers', 15)
     ) AS e(t, n)
LEFT JOIN (
  SELECT table_name, count(*) AS n FROM information_schema.columns
   WHERE table_schema = 'public' GROUP BY table_name
) a ON a.table_name = e.t;

-- ── 3. 主鍵 / 外鍵 / 唯一鍵 / CHECK ──
INSERT INTO pv (id, result, detail)
SELECT 'CON ' || e.t || ' ' || e.ct,
       CASE WHEN coalesce(a.n, 0) = e.n THEN 'PASS' ELSE 'FAIL' END,
       e.label || ' ' || coalesce(a.n, 0) || '（預期 ' || e.n || '）'
-- 數字全部取自正式環境指紋，不是估計值。
FROM (VALUES
        ('exams','p',1,'主鍵'), ('exams','f',1,'外鍵'),
        ('question_groups','p',1,'主鍵'), ('question_groups','f',1,'外鍵'), ('question_groups','u',1,'唯一鍵'),
        ('group_questions','p',1,'主鍵'), ('group_questions','f',1,'外鍵'), ('group_questions','u',1,'唯一鍵'),
        ('group_questions','c',1,'CHECK'),
        ('vocabulary_questions','p',1,'主鍵'), ('vocabulary_questions','f',1,'外鍵'),
        ('vocabulary_questions','u',1,'唯一鍵'), ('vocabulary_questions','c',2,'CHECK'),
        ('translation_questions','p',1,'主鍵'), ('translation_questions','f',1,'外鍵'),
        ('translation_questions','u',1,'唯一鍵'), ('translation_questions','c',1,'CHECK'),
        ('essay_questions','p',1,'主鍵'), ('essay_questions','f',1,'外鍵'), ('essay_questions','u',1,'唯一鍵'),
        ('exam_attempts','p',1,'主鍵'), ('exam_attempts','f',2,'外鍵'), ('exam_attempts','c',1,'CHECK'),
        ('exam_user_answers','p',1,'主鍵'), ('exam_user_answers','f',6,'外鍵'), ('exam_user_answers','c',1,'CHECK')
     ) AS e(t, ct, n, label)
LEFT JOIN (
  SELECT c.relname AS t, con.contype::text AS ct, count(*) AS n
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
   GROUP BY c.relname, con.contype
) a ON a.t = e.t AND a.ct = e.ct;

INSERT INTO pv (id, result, detail)
SELECT 'CON single_question_source',
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END,
       '四選一的互斥 CHECK（找到 ' || count(*) || '）'
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname = 'public' AND c.relname = 'exam_user_answers'
  AND con.conname = 'single_question_source';

-- ── 4. 索引 ──
INSERT INTO pv (id, result, detail)
SELECT 'IDX ' || i,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname = 'public' AND indexname = i) THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname = 'public' AND indexname = i) THEN '存在' ELSE '缺少' END
FROM unnest(ARRAY[
  'idx_exams_status','idx_exams_year',
  'idx_groups_exam','idx_groups_type',
  'idx_group_questions_group','idx_group_questions_number',
  'idx_vocab_exam','idx_vocab_level',
  'idx_translation_exam','idx_essay_exam',
  'idx_attempts_user','idx_attempts_exam','idx_attempts_status',
  'idx_answers_attempt']) AS i;

-- 索引總數（含主鍵與唯一鍵自動產生的那些）
INSERT INTO pv (id, result, detail)
SELECT 'IDX 總數',
       CASE WHEN count(*) = 27 THEN 'PASS' ELSE 'FAIL' END,
       '八張表上共 ' || count(*) || ' 個索引（正式環境為 27）'
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('exams','question_groups','group_questions','vocabulary_questions',
                    'translation_questions','essay_questions','exam_attempts','exam_user_answers');

-- ── 5. RLS 啟用狀態 ──
INSERT INTO pv (id, result, detail)
SELECT 'RLS ' || t,
       CASE WHEN coalesce((SELECT c.relrowsecurity FROM pg_class c
                           JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'public' AND c.relname = t), false)
            THEN 'PASS' ELSE 'FAIL' END,
       'RLS 已啟用'
FROM unnest(ARRAY['exams','question_groups','group_questions','vocabulary_questions',
                  'translation_questions','essay_questions','exam_attempts',
                  'exam_user_answers']) AS t;

-- ── 6. RLS 政策（12 條，逐一點名）──
INSERT INTO pv (id, result, detail)
SELECT 'POL ' || e.t || ' / ' || e.p,
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname = 'public' AND tablename = e.t AND policyname = e.p)
            THEN 'PASS' ELSE 'FAIL' END,
       coalesce((SELECT cmd FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = e.t AND policyname = e.p), '缺少')
FROM (VALUES
        ('exams','Published exams viewable by all'),
        ('question_groups','Question groups viewable for published exams'),
        ('group_questions','Group questions viewable for published exams'),
        ('vocabulary_questions','Vocab questions viewable for published exams'),
        ('translation_questions','Translation questions viewable for published exams'),
        ('essay_questions','Essay questions viewable for published exams'),
        ('exam_attempts','Users view own attempts'),
        ('exam_attempts','Users create own attempts'),
        ('exam_attempts','Users update own attempts'),
        ('exam_user_answers','Users view own answers'),
        ('exam_user_answers','Users create own answers'),
        ('exam_user_answers','Users update own answers')
     ) AS e(t, p);

INSERT INTO pv (id, result, detail)
SELECT 'POL 總數',
       CASE WHEN count(*) = 12 THEN 'PASS' ELSE 'FAIL' END,
       '八張表上的政策共 ' || count(*) || ' 條（預期 12；多出來的請確認來源）'
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('exams','question_groups','group_questions','vocabulary_questions',
                    'translation_questions','essay_questions','exam_attempts','exam_user_answers');

-- ── 7. trigger 與函式 ──
INSERT INTO pv (id, result, detail)
SELECT 'TRG trigger_auto_grade',
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END,
       coalesce(max(pg_get_triggerdef(t.oid)), '缺少')
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname = 'exam_user_answers' AND t.tgname = 'trigger_auto_grade';

INSERT INTO pv (id, result, detail)
SELECT 'FUN auto_grade_choice_answer()',
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END,
       coalesce(max('returns=' || pg_get_function_result(p.oid)
                    || ' security_definer=' || p.prosecdef::text
                    || ' config=' || coalesce(array_to_string(p.proconfig, ','), '-')), '缺少')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'auto_grade_choice_answer';

-- ── 8. ENUM ──
-- 正式環境有五個 ENUM，其中三個使用中文標籤。
INSERT INTO pv (id, result, detail)
SELECT 'ENU ' || e.t,
       CASE WHEN coalesce(a.labels, '') = e.labels THEN 'PASS' ELSE 'FAIL' END,
       coalesce(a.labels, '缺少') || '（預期 ' || e.labels || '）'
FROM (VALUES
        ('exam_status',         'draft,published,archived'),
        ('difficulty_level',    '簡單,中等,困難'),
        ('question_group_type', 'cloze,contextual,structure,reading,mixed'),
        ('mixed_question_type', '選擇,填空,配對,排序'),
        ('essay_type',          '記敘文,議論文,說明文')
     ) AS e(t, labels)
LEFT JOIN (
  SELECT t.typname, string_agg(en.enumlabel, ',' ORDER BY en.enumsortorder) AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum en ON en.enumtypid = t.oid
   WHERE n.nspname = 'public'
   GROUP BY t.typname
) a ON a.typname = e.t;

-- ── 9. 零資料 ──
DO $$
DECLARE v_t text; v_n bigint; v_total bigint := 0;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'exams','question_groups','group_questions','vocabulary_questions',
    'translation_questions','essay_questions','exam_attempts','exam_user_answers'] LOOP
    IF to_regclass('public.' || v_t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
      v_total := v_total + v_n;
    END IF;
  END LOOP;
  INSERT INTO pv (id, result, detail)
    VALUES ('DATA 零資料',
            CASE WHEN v_total = 0 THEN 'PASS' ELSE 'FAIL' END,
            '八張表合計 ' || v_total || ' 列（bootstrap 只建 schema，預期 0）');
END $$;

-- ── 10. 階段順序：硬化物件還不該存在 ──
INSERT INTO pv (id, result, detail)
SELECT 'STAGE 尚未硬化',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'mock_exam_% 物件 ' || count(*) || ' 個（此時預期 0；階段 2 之後才會出現）'
FROM (
  SELECT conname AS n FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
   WHERE ns.nspname = 'public' AND conname LIKE 'mock\_exam\_%'
  UNION ALL
  SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'mock\_exam\_%'
  UNION ALL
  SELECT proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND proname LIKE 'mock\_exam\_%'
  UNION ALL
  SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND NOT t.tgisinternal AND tgname LIKE 'mock\_exam\_%'
) x;

-- 最容易被誤以為「應該是 uuid」而改掉的地方，明確釘住。
INSERT INTO pv (id, result, detail)
SELECT 'TYPE ' || e.t || '.' || e.c,
       CASE WHEN coalesce(a.ty, '') = e.ty THEN 'PASS' ELSE 'FAIL' END,
       coalesce(a.ty, '缺少') || '（預期 ' || e.ty || '）'
FROM (VALUES
        ('exams','id','text'),
        ('question_groups','id','text'),
        ('question_groups','exam_id','text'),
        ('group_questions','group_id','text'),
        ('exam_attempts','exam_id','text'),
        ('vocabulary_questions','question_number','integer'),
        ('group_questions','question_number','integer'),
        ('translation_questions','question_number','text'),
        ('essay_questions','question_number','text'),
        ('vocabulary_questions','correct_answer','character(1)'),
        ('exam_user_answers','score_earned','numeric(4,2)'),
        ('exam_attempts','total_score','numeric(5,2)'),
        ('exams','total_score','numeric(5,2)')
     ) AS e(t, c, ty)
LEFT JOIN (
  SELECT c.relname AS t, a.attname AS c, format_type(a.atttypid, a.atttypmod) AS ty
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
   WHERE n.nspname = 'public'
) a ON a.t = e.t AND a.c = e.c;

INSERT INTO pv (id, result, detail)
SELECT 'STAGE score_earned DEFAULT',
       CASE WHEN column_default = '0' THEN 'PASS' ELSE 'FAIL' END,
       'DEFAULT = ' || coalesce(column_default, '無')
       || '（基礎 schema 階段應為 0；階段 2 會移除它）'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
  AND column_name = 'score_earned';

INSERT INTO pv (id, result, detail)
SELECT 'STAGE user_answer 可為 NULL',
       CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END,
       'is_nullable = ' || is_nullable || '（基礎 schema 階段應為 YES）'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exam_user_answers'
  AND column_name = 'user_answer';

-- ── 11. iLearn 邊界 ──
INSERT INTO pv (id, result, detail)
SELECT 'ILN 未建立 legacy 表',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INFO' END,
       CASE WHEN count(*) = 0
            THEN 'exam_records / exam_types 不存在 —— bootstrap 沒有、也不該建立它們'
            ELSE '偵測到 ' || count(*) || ' 張 legacy 表。bootstrap 不會碰它們，'
                 || '但請確認它們不是本次執行造成的' END
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('exam_records','exam_types');

INSERT INTO pv (id, result, detail)
SELECT 'ILN 無外鍵指向 legacy',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       '八張表對 exam_records / exam_types 的外鍵數 = ' || count(*) || '（預期 0）'
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_class rc ON rc.oid = con.confrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f'
  AND c.relname IN ('exams','question_groups','group_questions','vocabulary_questions',
                    'translation_questions','essay_questions','exam_attempts','exam_user_answers')
  AND rc.relname IN ('exam_records','exam_types');

INSERT INTO pv (id, result, detail)
SELECT 'ILN legacy 上無本次物件',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'legacy 表上出現 trigger_auto_grade 的數量 = ' || count(*) || '（預期 0）'
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('exam_records','exam_types')
  AND t.tgname = 'trigger_auto_grade';

-- ── 總結 ──
INSERT INTO pv (id, result, detail)
SELECT 'TOTAL',
       CASE WHEN count(*) FILTER (WHERE result = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*) FILTER (WHERE result = 'PASS') || ' 項通過、'
       || count(*) FILTER (WHERE result = 'FAIL') || ' 項失敗'
       || '。逐行比對請另跑 mock_exam_schema_fingerprint.sql 並與正式環境輸出 diff。'
FROM pv;

SELECT seq, id, result, detail FROM pv ORDER BY seq;
