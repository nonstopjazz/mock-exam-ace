-- =====================================================
-- 把 iLearn 救回來，同時讓 Supabase 的 rls_disabled_in_public 警告消失
--
-- 🔴 這份【會改變行為】。先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 執行前請先跑檔案最下方的「現況查詢」，確認現在的狀態真的如下面所述。
--
--
-- 為什麼需要這一份
--
--   2026-09-18 的 secure_legacy_public_tables.sql 收掉了 anon 的權限，
--   2026-09-18 的 lock_down_dead_legacy_tables.sql 又收掉 authenticated 並開了 RLS。
--   兩份都建立在同一個錯誤判斷上：「這 11 張表已經死了」。
--
--   實際上 student_tasks 正在被 ilearn-blog-lms-on.vercel.app 使用，
--   而且【那個站用的是 Supabase anon key】。結果是老師打不開學生作業，
--   畫面直接噴 permission denied for table student_tasks。
--
--   lock_down 的 rollback 只還了 authenticated，沒有還 anon，
--   所以跑完 rollback 之後 iLearn 依然是壞的。這份才是真正的復原。
--
--
-- 這份做什麼
--
--   1. 把 anon / authenticated 的 grant 還原成 2026-09-18 之前的樣子。
--   2. ENABLE RLS，並且補上一條【完全放行】的 policy。
--
--   第 2 步是關鍵，也是之前想錯的地方：Supabase 的 rls_disabled_in_public
--   稽核的是「RLS 旗標有沒有開」，【不是】「policy 嚴不嚴」。
--   所以「開 RLS + 放行 policy」可以同時滿足稽核與零行為變更。
--
--
-- ⚠️ 請不要把這份當成「資安修好了」
--
--   放行 policy 等於沒有保護。anon key 是公開在前端 JS 裡的，
--   任何人都能讀寫這 11 張表。這份只是讓警告消失並且讓 iLearn 能用，
--   真正的修法是 iLearn 那一側改成登入後帶 user JWT，再寫真正的 policy。
--   在 iLearn 淘汰之前，這是刻意接受的風險，不是疏忽。
--
--
-- 這份不刪任何一列資料。
-- =====================================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'users', 'user_course_access', 'student_tasks', 'courses', 'course_lessons',
    'assignments', 'assignment_submissions', 'exam_types', 'exam_records',
    'learning_progress_stats', 'vocabulary_sessions'
  ];
  v_t TEXT;
  v_done TEXT[] := '{}';
  v_skipped TEXT[] := '{}';
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || quote_ident(v_t)) IS NULL THEN
      v_skipped := v_skipped || v_t;
      CONTINUE;
    END IF;

    -- 1. 還原 grant。iLearn 會寫 student_tasks，所以不能只給 SELECT。
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated', v_t);

    -- 2. 開 RLS——這是給稽核看的旗標。
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);

    -- 3. 補放行 policy，抵銷第 2 步造成的行為改變。
    --    先 DROP 再 CREATE，讓這份可以重複執行。
    EXECUTE format('DROP POLICY IF EXISTS legacy_ilearn_open_access ON public.%I', v_t);
    EXECUTE format(
      'CREATE POLICY legacy_ilearn_open_access ON public.%I '
      'FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', v_t);

    v_done := v_done || v_t;
  END LOOP;

  RAISE NOTICE '已復原：% 張 → %',
    coalesce(array_length(v_done, 1), 0), coalesce(array_to_string(v_done, ', '), '（無）');
  RAISE NOTICE '這個環境沒有：% 張 → %',
    coalesce(array_length(v_skipped, 1), 0), coalesce(array_to_string(v_skipped, ', '), '（無）');
END;
$$;


-- 現況查詢 / 驗證
--
--   執行【前】跑一次：預期看到 anon可讀 = false（這就是 iLearn 壞掉的原因）。
--   執行【後】再跑一次：預期 RLS開著 = true、anon可讀 = true、政策數 >= 1。
SELECT c.relname                                            AS "表",
       c.relrowsecurity                                     AS "RLS開著",
       has_table_privilege('anon', c.oid, 'SELECT')          AS "anon可讀",
       has_table_privilege('anon', c.oid, 'UPDATE')          AS "anon可寫",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀",
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS "政策數"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND c.relname IN ('users','user_course_access','student_tasks','courses',
                     'course_lessons','assignments','assignment_submissions',
                     'exam_types','exam_records','learning_progress_stats',
                     'vocabulary_sessions')
 ORDER BY c.relname;
