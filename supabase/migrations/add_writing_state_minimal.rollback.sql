-- =====================================================
-- 回滾 add_writing_state_minimal.sql
--
-- 把 writing_score_20() 退回等距版（四個狀態、下限 7）。
--
-- 🛑 回滾之前要先確認【沒有任何作文已經被評出 MINIMAL】。
--    舊函式不認得 MINIMAL，而舊函式對不認得的值是「排除在分母外」——
--    所以帶 MINIMAL 的作文回滾後分數會【偏高】，而且畫面上看起來正常。
--
--    先跑這一支確認是 0：
--
--      SELECT count(DISTINCT a.id) AS "帶 MINIMAL 的作文篇數"
--        FROM public.writing_analyses a
--        CROSS JOIN LATERAL jsonb_array_elements(a.competency_analysis -> 'categories') c
--        CROSS JOIN LATERAL jsonb_array_elements(c -> 'skills') s
--       WHERE a.status = 'COMPLETED' AND s ->> 'state' = 'MINIMAL';
--
--    不是 0 的話，回滾 prompt（api/_lib/writingPrompts.ts）與契約
--    （api/_lib/analysisContract.ts）就夠了，這支函式留著 ——
--    MINIMAL = 0 對沒有 MINIMAL 的資料本來就沒有影響。
--
-- 函式本體與 change_writing_score_20_even_spacing.sql 完全相同。
-- =====================================================

CREATE OR REPLACE FUNCTION writing_score_20(p_competency JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_out JSONB;
BEGIN
  -- 還沒分析完、或形狀不對，就沒有分數。不要為了「總是有個數字」而編一個。
  IF jsonb_typeof(p_competency -> 'categories') <> 'array' THEN
    RETURN NULL;
  END IF;

  WITH per_category AS (
    SELECT
      c ->> 'code' AS code,
      -- UNMEASURED 在 CASE 裡回 NULL，avg() 會自己略過——
      -- 這就是「排除在分母之外」的實作
      avg(CASE s ->> 'state'
            WHEN 'STRONG'     THEN 3
            WHEN 'ADEQUATE'   THEN 2
            WHEN 'DEVELOPING' THEN 1
          END) AS avg_points
    FROM jsonb_array_elements(p_competency -> 'categories') c
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
           ELSE '[]'::jsonb END) s ON true
    GROUP BY c ->> 'code'
  ),
  scored AS (
    -- 🛑 這裡【不】round。round 會把 .5 單向往上推，
    --    把「一半 STRONG、一半 ADEQUATE」的類別算成完全 STRONG。
    SELECT code, avg_points AS points
      FROM per_category
     WHERE avg_points IS NOT NULL
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM scored) = 0 THEN NULL
    ELSE jsonb_build_object(
      -- 依【有量到的】類別按比例換算回 20 分制。
      -- 分母的 3 = STRONG 的賦值（滿分），改賦值時要一起改。
      'score',    round(20.0 * (SELECT sum(points) FROM scored)
                             / (3 * (SELECT count(*) FROM scored)))::INT,
      'measured', (SELECT count(*)::INT FROM scored),
      'total',    (SELECT count(*)::INT FROM per_category),
      -- 🛑 points 現在是小數（類別內的平均），不再是整數。
      --    取一位小數只是為了可讀；分數本身用的是完整精度。
      'categories', (
        SELECT jsonb_agg(jsonb_build_object('code', code, 'points', round(points, 1))
                         ORDER BY code)
          FROM scored)
    )
  END INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION writing_score_20(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_score_20(JSONB) TO authenticated, service_role;
