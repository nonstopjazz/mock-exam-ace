-- =====================================================
-- 管理員批改頁帶出 20 分制總分
--
-- 🟢 只要在 production 執行一次。
--
-- 【現況】老師在批改頁看不到分數。
--     • 學生在作文列表（EssayCard）看得到 —— writing_student_essay_cards() 有回 score
--     • 報告本身（WritingReportView）沒有分數
--     • 老師的批改頁渲染的就是那個報告 → 老師從頭到尾看不到分數
--
--   所以老師無法得知 AI 實際給了學生幾分，也就無法判斷 AI 的標準鬆不鬆。
--
-- 🛑 分數【不在前端算】。
--    writing_score_20() 已經是唯一的換算來源，在 TypeScript 再寫一份
--    就有兩個實作。哪天調整標準（例如把 DEVELOPING 從 2 改成 1），
--    改了 SQL 沒改前端，老師看到的分數就會跟學生看到的不一樣 ——
--    而那正是最不該出現落差的地方。
--
-- 🛑 CREATE OR REPLACE 就夠，signature 沒變，不需要先 DROP。
--    （有變 signature 的才需要，否則會留下舊的 overload。）
--
-- 回滾：supabase/migrations/add_writing_admin_analysis_score.rollback.sql
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

  SELECT coalesce(jsonb_agg(
           -- 原本的整列（含診斷欄位）再併上分數。
           -- 🛑 只有 COMPLETED 才給分數：還在跑或失敗的分析沒有分數，
           --    硬算會得到一個看起來像成績的數字。
           row_to_json(a)::jsonb || jsonb_build_object(
             'score',
             CASE WHEN a.status = 'COMPLETED'
                  THEN public.writing_score_20(a.competency_analysis) END)
           ORDER BY a.analysis_version DESC), '[]'::jsonb)
    INTO v_result
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_analysis IS
  '管理員讀單篇作文的歷次分析（含診斷欄位與 20 分制總分）。分數由 writing_score_20() 換算，與學生看到的是同一個來源。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_analysis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_analysis(UUID) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       pg_get_function_arguments(p.oid) AS "參數",
       -- 應該只有一支，不該有殘留的 overload
       count(*) OVER ()                 AS "同名函式數（應為 1）"
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'writing_admin_analysis';

SELECT grantee, privilege_type
  FROM information_schema.role_routine_grants
 WHERE routine_schema = 'public'
   AND routine_name = 'writing_admin_analysis'
 ORDER BY grantee;
