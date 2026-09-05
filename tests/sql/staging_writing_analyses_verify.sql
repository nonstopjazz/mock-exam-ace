-- =====================================================
-- writing_analyses —— staging 套用後的驗證（唯讀）
--
-- 在 Supabase SQL Editor 執行。純 SQL，沒有 \ir / \echo / \set。
--
-- ⚠️ SQL Editor 只顯示【最後一個 SELECT】的結果，所以這份腳本從頭到尾
--    只有一個 SELECT：所有檢查、總結、對照數字全部先累積進暫存表。
--    多寫一個 SELECT 就會把前面的結果蓋掉。
--
-- ⚠️ 這份腳本【不寫入任何資料】。它只讀系統目錄，加上兩次刻意觸發的
--    授權例外（那兩個函式在把關失敗前就 RAISE，碰不到任何資料表）。
--
-- 為什麼不是用 writing_analyses_security_test.sql：
--   那一份是【本機專用】。它會 INSERT 進 auth.users，並且依賴本機測試替身
--   把 is_admin() 換成讀 GUC 的版本。兩者在真正的 Supabase 專案上都不成立
--   （auth.users.id 沒有 DEFAULT；is_admin() 是真的那一個）。
--   在 staging 跑它只會得到一堆看不懂的錯誤。
--
--   行為面的驗證（排入佇列、狀態機、綜合層重試）改由 Preview 上
--   /admin/writing-debug 用真實管理員 JWT 走一次完成——那才是這些
--   保護真正要生效的地方。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS v_result (
  seq SERIAL,
  section TEXT,
  name TEXT,
  verdict TEXT,
  detail TEXT
);
TRUNCATE v_result;

DO $outer$
DECLARE
  v_int INTEGER;
  v_txt TEXT;
BEGIN
  -- ==========================================================
  -- A. 結構
  -- ==========================================================

  -- 表不存在就直接停在這裡並說清楚。
  -- 後面的檢查會用到 'public.writing_analyses'::regclass，那個轉型在表不存在時
  -- 會直接丟 42P01，錯誤訊息看起來像腳本壞掉，其實只是 migration 還沒套。
  IF to_regclass('public.writing_analyses') IS NULL THEN
    INSERT INTO v_result (section, name, verdict, detail) VALUES
      ('A 結構', 'writing_analyses 存在', 'FAIL', '不存在'),
      ('A 結構', '——', 'INFO',
       '這份是【套用後】的驗證腳本。表還不存在，代表步驟 1 尚未成功執行。'),
      ('A 結構', '下一步', 'INFO',
       '請先整份執行 supabase/migrations/create_writing_analyses.sql，成功後再跑這一份。');
    RETURN;
  END IF;

  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('A 結構', 'writing_analyses 存在', 'PASS', 'public.writing_analyses');

  SELECT count(*) INTO v_int
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'writing_analyses';
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('A 結構', '欄位數 = 33',
          CASE WHEN v_int = 33 THEN 'PASS' ELSE 'FAIL' END,
          v_int || ' 欄' ||
          CASE WHEN v_int = 32 THEN '（少了 analyzed_at，請先跑 add_writing_analyses_analyzed_at.sql）' ELSE '' END);

  -- 四個 jsonb 分析欄位
  SELECT count(*) INTO v_int
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'writing_analyses'
     AND column_name IN ('competency_analysis', 'error_analysis',
                         'high_score_feature_analysis', 'validation_issues')
     AND data_type = 'jsonb';
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('A 結構', '三軸 + validation_issues 皆為 jsonb',
          CASE WHEN v_int = 4 THEN 'PASS' ELSE 'FAIL' END, v_int || '/4');

  -- status 必須含 ANALYZED（兩階段狀態模型的關鍵）
  SELECT string_agg(pg_get_constraintdef(c.oid), ' ') INTO v_txt
    FROM pg_constraint c
   WHERE c.conrelid = 'public.writing_analyses'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%status%';
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('A 結構', 'status CHECK 含 ANALYZED',
          CASE WHEN v_txt LIKE '%ANALYZED%' THEN 'PASS' ELSE 'FAIL' END,
          CASE WHEN v_txt LIKE '%ANALYZED%' THEN '有' ELSE coalesce(left(v_txt, 60), 'NULL') END);

  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('A 結構', 'synthesis_status CHECK 含 PENDING/RUNNING/COMPLETED/FAILED',
          CASE WHEN v_txt LIKE '%PENDING%' AND v_txt LIKE '%RUNNING%' THEN 'PASS' ELSE 'FAIL' END,
          CASE WHEN v_txt LIKE '%PENDING%' THEN '有' ELSE '缺' END);

  -- ==========================================================
  -- B. 索引與 trigger
  -- ==========================================================

  SELECT indexdef INTO v_txt
    FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'writing_analyses_one_active_per_essay';
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('B 索引', '同一篇只能有一次分析在飛行中（含 ANALYZED）',
          CASE WHEN v_txt LIKE '%UNIQUE%' AND v_txt LIKE '%ANALYZED%' THEN 'PASS' ELSE 'FAIL' END,
          coalesce(left(v_txt, 80), '不存在'));

  SELECT count(*) INTO v_int
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('idx_writing_analyses_latest', 'idx_writing_analyses_pending');
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('B 索引', '另外兩個查詢索引存在',
          CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END, v_int || '/2');

  SELECT count(*) INTO v_int
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.writing_analyses'::regclass
     AND t.tgname = 'writing_analyses_guard_immutable_trigger'
     AND NOT t.tgisinternal;
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('B 索引', '不可修改保護 trigger 已掛上',
          CASE WHEN v_int = 1 THEN 'PASS' ELSE 'FAIL' END, v_int || ' 個');

  -- ==========================================================
  -- C. 權限：一般使用者對這張表沒有任何直接管道
  -- ==========================================================

  INSERT INTO v_result (section, name, verdict, detail)
  SELECT 'C 權限', 'anon 對 writing_analyses 無任何權限',
         CASE WHEN bool_or(has_table_privilege('anon', 'public.writing_analyses', p))
              THEN 'FAIL' ELSE 'PASS' END,
         coalesce(string_agg(p, ',') FILTER (
           WHERE has_table_privilege('anon', 'public.writing_analyses', p)), '（無）')
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;

  INSERT INTO v_result (section, name, verdict, detail)
  SELECT 'C 權限', 'authenticated 對 writing_analyses 無任何權限',
         CASE WHEN bool_or(has_table_privilege('authenticated', 'public.writing_analyses', p))
              THEN 'FAIL' ELSE 'PASS' END,
         coalesce(string_agg(p, ',') FILTER (
           WHERE has_table_privilege('authenticated', 'public.writing_analyses', p)), '（無）')
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;

  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('C 權限', 'service_role 有 SELECT/INSERT/UPDATE，且無 DELETE/TRUNCATE',
          CASE WHEN has_table_privilege('service_role', 'public.writing_analyses', 'SELECT')
                AND has_table_privilege('service_role', 'public.writing_analyses', 'INSERT')
                AND has_table_privilege('service_role', 'public.writing_analyses', 'UPDATE')
                AND NOT has_table_privilege('service_role', 'public.writing_analyses', 'DELETE')
                AND NOT has_table_privilege('service_role', 'public.writing_analyses', 'TRUNCATE')
               THEN 'PASS' ELSE 'FAIL' END,
          '（Supabase 的預設權限已被 REVOKE 收回）');

  INSERT INTO v_result (section, name, verdict, detail)
  SELECT 'C 權限', 'RLS 已啟用',
         CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END,
         'relrowsecurity = ' || c.relrowsecurity
    FROM pg_class c WHERE c.oid = 'public.writing_analyses'::regclass;

  SELECT count(*) INTO v_int
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'writing_analyses'
     AND 'authenticated' = ANY(roles);
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('C 權限', '沒有任何政策開放給 authenticated',
          CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, v_int || ' 個');

  SELECT count(*) INTO v_int
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'writing_analyses';
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('C 權限', '政策總數 = 1（只給 service_role）',
          CASE WHEN v_int = 1 THEN 'PASS' ELSE 'FAIL' END, v_int || ' 個');

  -- ==========================================================
  -- D. 五個函式
  -- ==========================================================

  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('writing_student_analysis', 'writing_admin_queue',
                       'writing_admin_analysis', 'writing_enqueue_analysis',
                       'writing_retry_synthesis');
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('D 函式', '五個函式都存在',
          CASE WHEN v_int = 5 THEN 'PASS' ELSE 'FAIL' END, v_int || '/5');

  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('writing_student_analysis', 'writing_admin_queue',
                       'writing_admin_analysis', 'writing_enqueue_analysis',
                       'writing_retry_synthesis', 'writing_analyses_guard_immutable')
     AND p.prosecdef
     -- proconfig 存的是 search_path=""（含跳脫的雙引號），不是 search_path=
     AND p.proconfig @> ARRAY['search_path=""'];
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('D 函式', '六個函式皆 SECURITY DEFINER 且鎖定 search_path',
          CASE WHEN v_int = 6 THEN 'PASS' ELSE 'FAIL' END, v_int || '/6');

  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('writing_student_analysis', 'writing_admin_queue',
                       'writing_admin_analysis', 'writing_enqueue_analysis',
                       'writing_retry_synthesis')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR p.proacl IS NULL);
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('D 函式', 'anon 不能執行任何一支（且 PUBLIC 已被 REVOKE）',
          CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, v_int || ' 支可執行');

  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('writing_student_analysis', 'writing_admin_queue',
                       'writing_admin_analysis', 'writing_enqueue_analysis',
                       'writing_retry_synthesis')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('D 函式', 'authenticated 可執行五支（授權在函式內部做）',
          CASE WHEN v_int = 5 THEN 'PASS' ELSE 'FAIL' END, v_int || '/5');

  -- ==========================================================
  -- E. 授權守門在真實環境中確實生效
  --
  -- SQL Editor 的 auth.uid() 是 NULL，所以真正的 is_admin() 會回傳 NULL
  -- 而不是 false。這正是 coalesce(is_admin(), false) IS NOT TRUE 存在的理由。
  -- 這兩次呼叫在把關失敗時就 RAISE，不會碰到任何資料表。
  -- ==========================================================

  BEGIN
    PERFORM public.writing_admin_queue();
    INSERT INTO v_result (section, name, verdict, detail)
    VALUES ('E 守門', 'SQL Editor 身分讀不到批改佇列', 'FAIL',
            '竟然成功了——請檢查 is_admin() 是否對未登入者回傳 true');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO v_result (section, name, verdict, detail)
    VALUES ('E 守門', 'SQL Editor 身分讀不到批改佇列', 'PASS', SQLERRM);
  WHEN OTHERS THEN
    INSERT INTO v_result (section, name, verdict, detail)
    VALUES ('E 守門', 'SQL Editor 身分讀不到批改佇列', 'FAIL', '非預期錯誤：' || SQLERRM);
  END;

  BEGIN
    PERFORM public.writing_enqueue_analysis(NULL::uuid);
    INSERT INTO v_result (section, name, verdict, detail)
    VALUES ('E 守門', 'SQL Editor 身分無法排入分析', 'FAIL', '竟然成功了');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO v_result (section, name, verdict, detail)
    VALUES ('E 守門', 'SQL Editor 身分無法排入分析', 'PASS', SQLERRM);
  WHEN OTHERS THEN
    INSERT INTO v_result (section, name, verdict, detail)
    VALUES ('E 守門', 'SQL Editor 身分無法排入分析', 'FAIL', '非預期錯誤：' || SQLERRM);
  END;

  -- ==========================================================
  -- F. 既有物件沒有被動到
  -- ==========================================================

  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('F 共存', 'writing_submissions 仍在',
          CASE WHEN to_regclass('public.writing_submissions') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
          coalesce(to_regclass('public.writing_submissions')::text, '不見了'));

  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('F 共存', 'writing_texts 仍在',
          CASE WHEN to_regclass('public.writing_texts') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
          coalesce(to_regclass('public.writing_texts')::text, '不見了'));

  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_admin';
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('F 共存', 'is_admin() 仍在（本次未重建）',
          CASE WHEN v_int = 1 THEN 'PASS' ELSE 'FAIL' END, v_int || ' 個');

  SELECT count(*) INTO v_int FROM public.writing_analyses;
  INSERT INTO v_result (section, name, verdict, detail)
  VALUES ('F 共存', 'writing_analyses 是空的（尚未跑過分析）',
          CASE WHEN v_int = 0 THEN 'PASS' ELSE 'INFO' END, v_int || ' 列');
END;
$outer$;

-- 總結與對照數字一律併進同一張暫存表，因為 SQL Editor 只顯示最後一個 SELECT。
INSERT INTO v_result (section, name, verdict, detail)
SELECT 'Z 總結', '通過項目',
       CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*) FILTER (WHERE verdict = 'PASS') || ' / '
       || count(*) FILTER (WHERE verdict <> 'INFO')
       || CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0
               THEN '　全部通過' ELSE '　有失敗項目' END
  FROM v_result;

-- 既有寫作物件的政策數量，僅供對照（預期 analyses 1、submissions 5、texts 3）
INSERT INTO v_result (section, name, verdict, detail)
SELECT 'Z 總結', '政策數 ' || tablename, 'INFO', count(*)::text
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('writing_submissions', 'writing_texts', 'writing_analyses')
 GROUP BY tablename;

SELECT seq, section, name, verdict, left(coalesce(detail, ''), 80) AS detail
  FROM v_result
 ORDER BY seq;
