-- =====================================================
-- 學生看自己的錯誤統計（2／2）：某個錯誤的完整歷史
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_writing_my_errors_1_overview.sql。
--    順序其實不影響結果（兩支互不相依），分開貼的原因見那一支的檔頭。
--
-- 這是什麼
--
--   老師端 writing_admin_error_findings（A7）的學生版：
--   「這個錯我在哪幾篇作文裡犯過，各自寫了什麼、該改成什麼」。
--
-- 🛑 同樣【沒有 student_id 參數】。對象一律是 auth.uid()。
--
-- 學生端其實已經看得到單篇報告裡的「錯誤與修正」。這一支補的是
-- 跨作文的那一段 —— 同一個錯散在好幾篇裡，今天要一篇篇開才數得出來。
--
-- 🛑 correction 原樣回傳，不做任何抽樣或截斷。
--    畫面上會與 quote 逐詞比對後標出差異（見 src/lib/writing/correctionDiff.ts），
--    那需要完整的兩段文字。
--
-- 回滾：supabase/migrations/create_writing_my_errors_2_findings.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION writing_my_error_findings(
  p_error_code TEXT    DEFAULT NULL,
  p_limit      INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID    := auth.uid();
  v_limit INTEGER := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_total INTEGER;
  v_rows  JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  WITH mine AS (
    SELECT f.*
      FROM public.writing_error_findings f
     WHERE f.student_id = v_uid
       AND (p_error_code IS NULL OR f.error_code = p_error_code))
  SELECT count(*)::int,
         coalesce(jsonb_agg(
           jsonb_build_object(
             'finding_id',         t.id,
             'essay_id',           t.essay_id,
             'essay_submitted_at', t.essay_submitted_at,
             'essay_topic',        t.essay_topic,
             'finding_index',      t.finding_index,
             'error_code',         t.error_code,
             'primary_skill',      t.primary_skill,
             'quote',              t.quote,
             'correction',         t.correction,
             'reason',             t.reason,
             'is_fallback_code',   t.is_fallback_code)
           ORDER BY t.rn) FILTER (WHERE t.rn <= v_limit), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (SELECT m.*,
                 row_number() OVER (ORDER BY m.essay_submitted_at DESC,
                                             m.essay_id,
                                             m.finding_index) AS rn
            FROM mine m) t;

  RETURN jsonb_build_object(
    'rows',      v_rows,
    'total',     v_total,
    'limit',     v_limit,
    'truncated', v_total > v_limit,
    'error_code', p_error_code);
END;
$$;

COMMENT ON FUNCTION writing_my_error_findings IS
  '學生看自己某個錯誤的完整歷史（原文／修正／說明），依時間新到舊。對象是 auth.uid()，沒有 student_id 參數。';

REVOKE ALL ON FUNCTION writing_my_error_findings(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_my_error_findings(TEXT, INTEGER) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                              AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',')                        AS "設定",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_my_error_overview', 'writing_my_error_findings')
 ORDER BY p.proname;
