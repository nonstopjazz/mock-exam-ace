-- =====================================================
-- 回滾：管理員批改頁的 20 分制總分
--
-- 把 writing_admin_analysis() 還原成不帶 score 的版本。
-- 沒有資料變更要回滾 —— 這支從頭到尾只讀不寫。
--
-- 🛑 前端要先回到沒有分數區塊的版本再跑這支。反過來的話，
--    批改頁會讀到 undefined，分數就不顯示（不會壞掉，但會讓人以為是 bug）。
-- =====================================================

CREATE OR REPLACE FUNCTION writing_admin_analysis(p_essay_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_analysis：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.analysis_version DESC), '[]'::jsonb)
    INTO v_result
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_analysis IS
  '管理員讀單篇作文的歷次分析（含診斷欄位）。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_analysis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_analysis(UUID) TO authenticated, service_role;


-- ── 驗證（唯讀）：回傳裡不該再有 score ────────────────
SELECT prosrc LIKE '%writing_score_20%' AS "還有分數（應為 false）"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'writing_admin_analysis';
