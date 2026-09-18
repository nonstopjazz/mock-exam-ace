-- 回滾 lock_down_dead_legacy_tables.sql
--
-- 用在「判斷錯了，iLearn 的某個畫面因此變空」的時候。
--
-- ⚠️ 這【不會】把 anon 的權限還回去 —— 那是前一份（secure_legacy_public_tables）
--    做的止血，不該因為這份回滾而一起失效。未登入的人依然讀不到。
--    這裡只還原 authenticated 的讀取能力，並關掉 RLS。

DO $$
DECLARE
  v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['users','user_course_access','student_tasks','courses',
    'course_lessons','assignments','assignment_submissions','exam_types',
    'exam_records','learning_progress_stats','vocabulary_sessions'] LOOP
    IF to_regclass('public.' || quote_ident(v_t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', v_t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_t);
      -- service_role 不必還原 —— 正向那份沒有收它。
    END IF;
  END LOOP;
  RAISE NOTICE '已還原 authenticated 的權限並關閉 RLS。anon 仍然讀不到（那是另一份的止血）。';
END;
$$;
