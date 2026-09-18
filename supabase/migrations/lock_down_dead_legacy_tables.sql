-- =====================================================
-- 關掉 11 張已經死掉的遺留表
--
-- 🔴 這一份【會改變行為】。先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 secure_legacy_public_tables.sql 之後執行。
--
--
-- 這一份跟前一份的差別
--
--   前一份只收 anon，已登入的使用者完全不受影響，所以是零風險的止血。
--   這一份連 authenticated 一起收，並開啟 RLS —— 也就是說，這 11 張表
--   【透過 PostgREST 就完全讀不到了】，不管有沒有登入。
--
--   service_role 的 grant 保留著，而且它繞過 RLS，所以後端／排程要救資料
--   隨時救得回來。資料本身一列都沒有動。
--
--
-- 為什麼判定它們是死的
--
--   2026-09-18 查 pg_stat_user_tables 與實際列數：
--
--     users                     37 列   累計更新 1
--     student_tasks             40 列   累計更新 26，autovacuum 停在 2026-08-02
--     course_lessons            10 列
--     exam_types                 9 列
--     vocabulary_sessions        9 列
--     exam_records               5 列
--     user_course_access         3 列
--     courses                    2 列
--     assignments                0 列   累計寫入 0
--     assignment_submissions     0 列   累計寫入 0
--     learning_progress_stats    0 列   累計寫入 0
--
--   ⚠️ 「被讀取次數」那一欄（3000+）不能當成有人在用：assignments 是一張
--      空表、累計寫入 0，卻被讀了 3379 次 —— 那是 Dashboard 的 Table Editor、
--      PostgREST 的 schema cache reload、備份掃描與稽核查詢，不是應用程式。
--
--   37 個使用者、2 門課、3 筆選課權限。這不是一個在營運的系統的資料量。
--   這個 repo 也一張都沒有查詢它們（iLearn 那一側的 codebase 看不到，
--   但統計與列數兩個獨立證據指向同一個結論）。
--
--
-- 🛑 如果判斷錯了會怎樣
--
--   症狀是 iLearn 的某個畫面變成空的（查詢不會報錯，只會回 0 列）。
--   回滾一行就好，見 lock_down_dead_legacy_tables.rollback.sql。
--   資料不會遺失 —— 這份 SQL 不刪任何一列。
--
--   建議跑完之後觀察幾天再算數。
--
--
-- 順帶：跑完之後 Supabase 的 rls_disabled_in_public 警告會消失，
--       因為 RLS 旗標終於是 true 了。前一份沒有動 RLS，所以警告還會再來。
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
    IF to_regclass('public.' || quote_ident(v_t)) IS NOT NULL THEN
      -- 收回一般角色的權限。
      --
      -- 🛑 service_role 的 grant【刻意保留】。它繞過 RLS，但【不繞過 grant】——
      --    收掉之後連後端與排程都讀不到，那就不是「退役」而是「鎖死」，
      --    真要救資料時得先改權限才動得了。
      --    （本機驗證抓到的：原本這行連 service_role 一起收，
      --     結果 SET ROLE service_role 之後 permission denied。）
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_t);

      -- 開 RLS 但【不寫任何 policy】= 透過 PostgREST 一列都讀不到。
      -- 這是「這張表已經退役」最直接的表示法，比留著一條假的政策清楚。
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);

      v_done := v_done || v_t;
    ELSE
      v_skipped := v_skipped || v_t;
    END IF;
  END LOOP;

  RAISE NOTICE '已鎖定：% 張 → %',
    coalesce(array_length(v_done, 1), 0), coalesce(array_to_string(v_done, ', '), '（無）');
  RAISE NOTICE '這個環境沒有：% 張 → %',
    coalesce(array_length(v_skipped, 1), 0), coalesce(array_to_string(v_skipped, ', '), '（無）');
END;
$$;


-- 驗證：跑完應該全部是 RLS開著 = true、anon可讀 = false、登入者可讀 = false
SELECT c.relname                                             AS "表",
       c.relrowsecurity                                      AS "RLS開著",
       has_table_privilege('anon', c.oid, 'SELECT')           AS "anon可讀",
       has_table_privilege('authenticated', c.oid, 'SELECT')  AS "登入者可讀",
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS "政策數"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND c.relname IN ('users','user_course_access','student_tasks','courses',
                     'course_lessons','assignments','assignment_submissions',
                     'exam_types','exam_records','learning_progress_stats',
                     'vocabulary_sessions')
 ORDER BY c.relname;
