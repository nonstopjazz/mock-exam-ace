-- =====================================================
-- 學生自己的閱讀練習統計
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_sessions.sql 與 create_reading_questions.sql。
--
-- 🛑 為什麼一定要 SECURITY DEFINER：reading_question_skills 對 authenticated
--    【完全沒有權限】，而 micro-skill 分析非讀它不可。這支只回傳【統計】，
--    不回傳哪一題標了哪些 skill——那張表等於「每一題在考什麼」的提示表，
--    給學生看等於給他一份考前重點。
--
-- 🛑 沒有 student_id 參數。對象永遠是 auth.uid()，不接受前端指定——
--    有那個參數，任何學生都能看別人的成績。
--
-- 🛑 emphasis 是 NULL 的【不算 0 分】，是【排除在加權之外】，
--    另外用 ungraded 回報有幾題。來源有 10% 的 emphasis 是空的，
--    補 0 會把「沒有標權重」變成「這一題完全不考這個能力」——
--    那是憑空捏造出來的結論。
--
-- 回滾：supabase/migrations/create_reading_my_stats.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_my_stats(p_min_questions INT DEFAULT 3)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_out JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  WITH my_attempts AS (
    SELECT a.id, a.question_id, a.is_correct, a.response_time_ms,
           a.answer_change_count, a.first_answer, a.selected_answer,
           q.construct, q.passage_id
      FROM public.reading_attempts a
      JOIN public.reading_questions q ON q.id = a.question_id
     WHERE a.student_id = v_uid
  ),
  by_construct AS (
    SELECT jsonb_agg(x ORDER BY x ->> 'construct') AS j FROM (
      SELECT jsonb_build_object(
        'construct',   t.construct,
        'answered',    count(*),
        'correct',     count(*) FILTER (WHERE t.is_correct),
        -- 🛑 中位數不是平均。第一題會吸收掉讀文章的時間，
        --    平均會被那一筆拉走，中位數不會。
        'median_ms',   percentile_cont(0.5) WITHIN GROUP (ORDER BY t.response_time_ms)
                         FILTER (WHERE t.response_time_ms IS NOT NULL),
        'changed',     count(*) FILTER (WHERE t.answer_change_count > 0),
        -- 本來選對卻改錯：只看最後答案完全看不到這件事
        'changed_away_from_correct',
          count(*) FILTER (WHERE NOT t.is_correct
                             AND t.first_answer IS NOT NULL
                             AND t.first_answer <> t.selected_answer
                             AND t.first_answer = k.correct_answer)
      ) AS x
      FROM my_attempts t
      JOIN public.reading_question_keys k ON k.question_id = t.question_id
      GROUP BY t.construct
    ) s
  ),
  skill_rows AS (
    SELECT s.skill_code,
           s.emphasis,
           t.is_correct
      FROM my_attempts t
      JOIN public.reading_question_skills s ON s.question_id = t.question_id
  ),
  by_skill AS (
    SELECT jsonb_agg(x ORDER BY (x ->> 'graded')::int DESC, x ->> 'skill_code') AS j FROM (
      SELECT jsonb_build_object(
        'skill_code', r.skill_code,
        -- 有 emphasis 的才進加權
        'graded',     count(*) FILTER (WHERE r.emphasis IS NOT NULL),
        -- 🛑 沒有 emphasis 的另外數，不補 0、不進分母
        'ungraded',   count(*) FILTER (WHERE r.emphasis IS NULL),
        'accuracy',   CASE
                        WHEN sum(r.emphasis) FILTER (WHERE r.emphasis IS NOT NULL) > 0
                        THEN round(
                          sum(r.emphasis * (CASE WHEN r.is_correct THEN 1 ELSE 0 END))
                            FILTER (WHERE r.emphasis IS NOT NULL)::numeric
                          / sum(r.emphasis) FILTER (WHERE r.emphasis IS NOT NULL), 3)
                        ELSE NULL
                      END,
        -- 🛑 題數不夠就不算「量到了」。一題答錯就說某個能力 0%，
        --    那不是分析，是雜訊。門檻由伺服器決定，畫面只是照著顯示。
        'enough',     count(*) FILTER (WHERE r.emphasis IS NOT NULL) >= p_min_questions
      ) AS x
      FROM skill_rows r
      GROUP BY r.skill_code
    ) s
  ),
  recent AS (
    SELECT jsonb_agg(x ORDER BY x ->> 'started_at' DESC) AS j FROM (
      SELECT jsonb_build_object(
        'session_id',   se.id,
        'passage_id',   se.passage_id,
        'title',        p.title,
        'status',       se.status,
        'started_at',   se.started_at,
        'submitted_at', se.submitted_at,
        'answered',     (SELECT count(*) FROM public.reading_attempts a
                          WHERE a.session_id = se.id),
        'correct',      (SELECT count(*) FROM public.reading_attempts a
                          WHERE a.session_id = se.id AND a.is_correct),
        'total_seconds', CASE WHEN se.submitted_at IS NULL THEN NULL
                              ELSE round(extract(epoch FROM (se.submitted_at - se.started_at)))::int END
      ) AS x
      FROM public.reading_sessions se
      JOIN public.reading_passages p ON p.passage_id = se.passage_id
     WHERE se.student_id = v_uid
     ORDER BY se.started_at DESC
     LIMIT 30
    ) s
  )
  SELECT jsonb_build_object(
    'overall', jsonb_build_object(
      'sessions',  (SELECT count(*) FROM public.reading_sessions WHERE student_id = v_uid),
      'passages',  (SELECT count(DISTINCT passage_id) FROM my_attempts),
      'answered',  (SELECT count(*) FROM my_attempts),
      'correct',   (SELECT count(*) FROM my_attempts WHERE is_correct),
      'min_questions_for_skill', p_min_questions),
    'by_construct', coalesce((SELECT j FROM by_construct), '[]'::jsonb),
    'by_skill',     coalesce((SELECT j FROM by_skill), '[]'::jsonb),
    'recent',       coalesce((SELECT j FROM recent), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION reading_my_stats(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_my_stats(INT) TO authenticated, service_role;

COMMENT ON FUNCTION reading_my_stats IS
  '學生自己的閱讀統計：六大能力、micro-skill（依 emphasis 加權，NULL 排除不補 0）、最近練習。沒有 student_id 參數，對象永遠是 auth.uid()。🛑 只回統計，不回哪一題標了哪些 skill。';

-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                      AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',')                AS "設定",
       has_function_privilege('anon', p.oid, 'EXECUTE') AS "anon可執行",
       pg_get_function_arguments(p.oid)                 AS "參數"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'reading_my_stats';
