-- =====================================================
-- 回滾：create_mock_content_admin_read_rpc.sql
--
-- ⚠️ 移除之後，ExamAdmin 在內容權限硬化生效的環境上將無法讀取
--    答案鍵與 draft 考卷。只有在同時要回滾內容權限硬化時才執行。
--
-- 不碰 is_admin()、不碰任何資料表、不碰 legacy iLearn。
-- =====================================================

DROP FUNCTION IF EXISTS public.mock_content_admin_fetch_exam(text);
DROP FUNCTION IF EXISTS public.mock_content_admin_list_exams();

DO $verify$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'mock\_content\_admin\_%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '回滾未完成：仍有 % 個 mock_content_admin_ 函式。', v_n;
  END IF;
END $verify$;
