-- =====================================================
-- 回滾：作文 20 分制的等距賦值
--
-- 還原成 DEVELOPING 2 / ADEQUATE 3 / STRONG 4，並恢復類別內的 round()。
--
-- 🛑 跑完的那一刻所有舊作文的分數會【再變一次】回原本的數字 ——
--    分數是讀取時算的。學生會看到分數又動了。
--
-- 🛑 前端與 admin 介面裡「下限是 7 分」那段文字也要一起回到「10 分」，
--    否則畫面會說一個不成立的下限。
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
            WHEN 'STRONG'     THEN 4
            WHEN 'ADEQUATE'   THEN 3
            WHEN 'DEVELOPING' THEN 2
          END) AS avg_points
    FROM jsonb_array_elements(p_competency -> 'categories') c
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
           ELSE '[]'::jsonb END) s ON true
    GROUP BY c ->> 'code'
  ),
  scored AS (
    SELECT code, round(avg_points)::INT AS points
      FROM per_category
     WHERE avg_points IS NOT NULL
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM scored) = 0 THEN NULL
    ELSE jsonb_build_object(
      -- 依【有量到的】類別按比例換算回 20 分制
      'score',    round(20.0 * (SELECT sum(points) FROM scored)
                             / (4 * (SELECT count(*) FROM scored)))::INT,
      'measured', (SELECT count(*)::INT FROM scored),
      'total',    (SELECT count(*)::INT FROM per_category),
      'categories', (
        SELECT jsonb_agg(jsonb_build_object('code', code, 'points', points) ORDER BY code)
          FROM scored)
    )
  END INTO v_out;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION writing_score_20 IS
  '從 Axis 1（W1–W5）推導 20 分制總分。每個類別取其 skill 的平均（STRONG 4 / ADEQUATE 3 / DEVELOPING 2），UNMEASURED 排除在分母外，再按有量到的類別數換算回 20 分。全部未量到時回 NULL。🛑 量表下限是 10，因為四個狀態裡沒有任何一個代表「完全不行」。';

REVOKE ALL ON FUNCTION writing_score_20(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_score_20(JSONB) TO authenticated, service_role;


-- ── 驗證（唯讀）：應回到 20 / 15 / 10 ─────────────────
WITH t(label, comp) AS (
  VALUES ('全 STRONG（應為 20）', 'STRONG'),
         ('全 ADEQUATE（應為 15）', 'ADEQUATE'),
         ('全 DEVELOPING（應為 10）', 'DEVELOPING')
)
SELECT t.label AS "檢查項",
       (public.writing_score_20(jsonb_build_object(
          'categories', (SELECT jsonb_agg(jsonb_build_object(
            'code', 'W' || i,
            'skills', jsonb_build_array(jsonb_build_object('code','x','state', t.comp))))
            FROM generate_series(1,5) AS i)
        )) ->> 'score') AS "分數"
  FROM t;
