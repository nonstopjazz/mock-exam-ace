-- =====================================================
-- mock 模考內容的「管理員讀取路徑」
--
-- 為什麼需要這個：
--   harden_mock_exam_content_permissions.sql 用欄位級 GRANT 把答案鍵
--   （correct_answer、reference_answer、sample_essay、scoring_criteria…）
--   對 authenticated 關掉。但欄位級授權是「角色」層級的，
--   而管理員在 Supabase 裡也是 authenticated —— 所以連 ExamAdmin
--   自己都讀不到要編輯的答案鍵，`.select('*')` 一律 42501。
--
--   RLS 分得出 admin 與學生（列級），欄位級授權分不出來。
--   這兩個 SECURITY DEFINER 函式就是那條分界線。
--
-- 安全性：
--   · SECURITY DEFINER，但「不是」因為 DEFINER 就放行——
--     函式第一件事就是檢查 is_admin()，不通過直接 42501。
--   · search_path 鎖為空字串，本體內所有名稱皆 schema 限定。
--   · EXECUTE 權限從 PUBLIC 收回，只發給 authenticated 與 service_role，
--     所以 anon 連進入函式都做不到（第一層），
--     就算進得來也會被 is_admin() 擋下（第二層）。
--   · 不動學生的欄位級 GRANT，不放寬任何學生可見範圍。
--
-- ⚠️ 產品邊界：這是「管理員專用」。
--    學生「交卷後看檢討與正解」是另一個檢查點，本檔不處理，
--    也刻意不提供任何以學生身分取得答案鍵的路徑。
--
-- 前置條件：bootstrap_is_admin.sql 必須已套用（is_admin() 存在且 search_path=public）。
-- =====================================================

DO $guard$
DECLARE v_config text; v_t text;
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION '中止：找不到 public.is_admin()。請先套用 bootstrap_is_admin.sql。';
  END IF;

  SELECT coalesce(array_to_string(p.proconfig, ','), '(null)') INTO v_config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';

  IF v_config <> 'search_path=public' THEN
    RAISE EXCEPTION '中止：public.is_admin() 的 search_path 是 %，預期正式環境的 search_path=public。'
      '請先套用 bootstrap_is_admin.sql。', v_config;
  END IF;

  FOREACH v_t IN ARRAY ARRAY[
    'exams','question_groups','group_questions',
    'vocabulary_questions','translation_questions','essay_questions'] LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      RAISE EXCEPTION '中止：找不到 public.%。請先套用 bootstrap_mock_exam_base_schema.sql。', v_t;
    END IF;
  END LOOP;
END $guard$;


-- ─────────────────────────────────────────────
-- 1. 取得單一考卷的完整內容（含所有教師欄位）
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mock_content_admin_fetch_exam(p_exam_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- 授權在最前面。is_admin() 對未登入者回傳 NULL 而不是 false，
  -- 所以這裡用 IS NOT TRUE，不能寫 NOT is_admin()——
  -- NOT NULL 是 NULL，IF NULL 不成立，會直接放行。
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'mock_content_admin_fetch_exam：僅限管理員'
      USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(e) || jsonb_build_object(
    'question_groups', (
      SELECT coalesce(jsonb_agg(
               to_jsonb(g) || jsonb_build_object('group_questions', (
                 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.question_number), '[]'::jsonb)
                 FROM public.group_questions q WHERE q.group_id = g.id))
               ORDER BY g.group_order), '[]'::jsonb)
      FROM public.question_groups g WHERE g.exam_id = e.id),
    'vocabulary_questions', (
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.question_number), '[]'::jsonb)
      FROM public.vocabulary_questions v WHERE v.exam_id = e.id),
    'translation_questions', (
      SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.question_number), '[]'::jsonb)
      FROM public.translation_questions t WHERE t.exam_id = e.id),
    'essay_questions', (
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.question_number), '[]'::jsonb)
      FROM public.essay_questions s WHERE s.exam_id = e.id)
  )
  INTO v_result
  FROM public.exams e
  WHERE e.id = p_exam_id;

  -- 找不到考卷：回傳 SQL NULL（PostgREST 會給 null）。
  -- 刻意不 RAISE —— 「不存在」與「無權限」必須是不同的結果，
  -- 但因為授權已在最前面擋掉，這裡的 NULL 不會洩漏任何存在性資訊。
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.mock_content_admin_fetch_exam(text) IS
  '管理員專用：以 jsonb 回傳整份考卷，含 correct_answer 等所有教師欄位。'
  '非管理員一律 42501。學生的交卷後檢討是另一個獨立路徑，不由本函式提供。';


-- ─────────────────────────────────────────────
-- 2. 列出全部考卷（含 draft 與 notes 等教師欄位）
--
-- ExamAdmin 的清單頁需要 draft 考卷與 notes；
-- 學生用的欄位級 SELECT 兩者都不給，所以清單也要走這條路。
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mock_content_admin_list_exams()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'mock_content_admin_list_exams：僅限管理員'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.year DESC, e.id), '[]'::jsonb)
    FROM public.exams e);
END;
$function$;

COMMENT ON FUNCTION public.mock_content_admin_list_exams() IS
  '管理員專用：列出全部考卷（含 draft 與 notes）。非管理員一律 42501。';


-- ─────────────────────────────────────────────
-- 3. EXECUTE 權限：anon 連門都進不來
-- ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mock_content_admin_fetch_exam(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mock_content_admin_list_exams()      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mock_content_admin_fetch_exam(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mock_content_admin_list_exams()     TO authenticated, service_role;


-- ─────────────────────────────────────────────
-- 4. 套用後自我驗證
-- ─────────────────────────────────────────────
DO $verify$
DECLARE v_n int; v_fn text; v_config text; v_secdef boolean;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['mock_content_admin_fetch_exam','mock_content_admin_list_exams'] LOOP
    SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '(null)')
      INTO v_secdef, v_config
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn;

    IF v_secdef IS NULL THEN
      RAISE EXCEPTION '驗證失敗：找不到 %。', v_fn;
    END IF;
    IF NOT v_secdef THEN
      RAISE EXCEPTION '驗證失敗：% 不是 SECURITY DEFINER。', v_fn;
    END IF;
    IF v_config <> 'search_path=""' THEN
      RAISE EXCEPTION '驗證失敗：% 的 search_path 為 %，預期 search_path=""。', v_fn, v_config;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'mock\_content\_admin\_%'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '驗證失敗：anon 仍可 EXECUTE % 個 admin RPC。', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'mock\_content\_admin\_%'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_n <> 2 THEN
    RAISE EXCEPTION '驗證失敗：authenticated 應可 EXECUTE 2 個 admin RPC，實得 %。', v_n;
  END IF;
END $verify$;
