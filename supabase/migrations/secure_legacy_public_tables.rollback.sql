-- 回滾 secure_legacy_public_tables.sql
--
-- 🛑 這會把三個洞全部打回去：兌換碼重新對未登入者公開、11 張遺留表重新
--    對 anon 開放讀寫刪、pg_stat_statements 重新洩漏 schema。
--    只在確認某個功能真的因此壞掉時使用，而且用完要馬上想別的辦法。

CREATE POLICY "Anyone can validate tokens" ON public.invite_tokens
  FOR SELECT USING (is_active = true);

DO $$
DECLARE v_t TEXT;
BEGIN
  IF to_regclass('public.tokens') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Logged in users can read active tokens" ON public.tokens';
    EXECUTE 'CREATE POLICY "Anyone can read active tokens" ON public.tokens
               FOR SELECT USING (is_active = true)';
  END IF;

  FOREACH v_t IN ARRAY ARRAY['users','user_course_access','student_tasks','courses',
    'course_lessons','assignments','assignment_submissions','exam_types',
    'exam_records','learning_progress_stats','vocabulary_sessions'] LOOP
    IF to_regclass('public.' || quote_ident(v_t)) IS NOT NULL THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO anon', v_t);
    END IF;
  END LOOP;

  IF to_regclass('extensions.pg_stat_statements') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON extensions.pg_stat_statements TO anon, authenticated';
    EXECUTE 'GRANT SELECT ON extensions.pg_stat_statements_info TO anon, authenticated';
  END IF;
END;
$$;
