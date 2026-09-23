-- 回滾 restore_ilearn_legacy_table_access.sql
--
-- 用在「iLearn 已經正式淘汰、確定沒有任何東西再讀這 11 張表」的時候。
-- 跑完等於回到 lock_down_dead_legacy_tables.sql 之後的狀態：
-- RLS 開著、沒有放行 policy、anon 與 authenticated 都讀不到，
-- 只剩 service_role 進得去（它繞過 RLS，而且 grant 一直都保留著）。
--
-- 🔴 跑這份之前請先確認 iLearn 真的關掉了。這正是 2026-09-18 犯錯的地方。

DO $$
DECLARE
  v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['users','user_course_access','student_tasks','courses',
    'course_lessons','assignments','assignment_submissions','exam_types',
    'exam_records','learning_progress_stats','vocabulary_sessions'] LOOP
    IF to_regclass('public.' || quote_ident(v_t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS legacy_ilearn_open_access ON public.%I', v_t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    END IF;
  END LOOP;
  RAISE NOTICE '已撤回放行 policy 與 anon/authenticated 權限。service_role 不受影響。';
END;
$$;
