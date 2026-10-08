-- =====================================================
-- 作文 20 分制：改成等距賦值，並去掉類別內的 round()
--
-- 🟢 只要在 production 執行一次。
--
-- 🛑 這支會【追溯改變所有舊作文的分數】。
--    分數沒有存成欄位，是每次讀取時從 competency_analysis 算的，
--    所以跑完的那一刻，學生看到的歷史分數就全部變了。
--    執行前應該先跑 supabase/tests/writing-score-audit/02-remap-whatif.sql
--    的「等距無round」那一欄，確認每一篇的新分數都可以接受。
--    （2026-10-08 已就 50 篇逐篇確認過。）
--
-- ══════════════════════════════════════════════════════════════
-- 改什麼
-- ══════════════════════════════════════════════════════════════
--
--   賦值      DEVELOPING 2 / ADEQUATE 3 / STRONG 4
--        →    DEVELOPING 1 / ADEQUATE 2 / STRONG 3
--
--   類別內    先取 skill 平均再 round() 成整數
--        →    直接用平均，不 round
--
--   換算      20 × 總分 /(4 × 有量到的類別數)
--        →    20 × 總分 /(3 × 有量到的類別數)
--
-- ══════════════════════════════════════════════════════════════
-- 為什麼
-- ══════════════════════════════════════════════════════════════
--
-- 【一】原本的 2/3/4 讓量表下限是 10 分
--
--   四個狀態裡沒有任何一個代表「完全不行」，所以就算每一項都評成
--   最嚴厲的 DEVELOPING，分數還是 10/20 —— 整個下半部的量表用不到。
--   等距之後下限變成 7（20 × 1/3），用得到的範圍變寬。
--
-- 【二】🛑 類別內的 round() 單向墊高分數
--
--   numeric 的 round() 是四捨五入【遠離零】：
--
--       avg(STRONG, STRONG, ADEQUATE, ADEQUATE) = 3.5  →  round = 4
--
--   也就是「一半 STRONG、一半 ADEQUATE」的類別被算成【完全 STRONG】。
--   而且 .5 永遠往上、不會往下，這個偏差是單向的。
--   production 50 篇裡最多墊高 2 分，多數墊高 1 分。
--
-- 【三】等距，是因為 1/2/4 的間距不等會把分布弄壞
--
--   先試過 DEVELOPING 1 / ADEQUATE 2 / STRONG 4。ADEQUATE→STRONG 的差距
--   是 DEVELOPING→ADEQUATE 的兩倍，結果：沒有 STRONG 的作文一律掉滿 5 分，
--   STRONG 多的幾乎不動 —— 底部一群 5–10、頂端 18–20，中間空掉。
--   等距之後降幅是 0–4，平順。
--
-- 🛑 【沒有】收緊 AI 的評級標準（prompt 不動），這是刻意的。
--    production 50 篇裡有 43 篇的 STRONG 是 0 —— AI 整體偏嚴，不是寬鬆。
--    而且一次只改一個變數：之後若還有偏差，才分得出是賦值還是評級造成的。
--
-- 回滾：supabase/migrations/change_writing_score_20_even_spacing.rollback.sql
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

COMMENT ON FUNCTION writing_score_20 IS
  '從 Axis 1（W1–W5）推導 20 分制總分。每個類別取其 skill 的平均（STRONG 3 / ADEQUATE 2 / DEVELOPING 1），UNMEASURED 排除在分母外，再按有量到的類別數換算回 20 分。全部未量到時回 NULL。🛑 量表下限是 7（20 × 1/3），因為四個狀態裡沒有任何一個代表「完全不行」。🛑 類別內刻意不 round —— numeric 的 round 遠離零，會把「一半 STRONG 一半 ADEQUATE」單向墊高成完全 STRONG。';

REVOKE ALL ON FUNCTION writing_score_20(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_score_20(JSONB) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
-- 等距之後的三個端點。全 STRONG 仍是 20，下限從 10 變成 7。
WITH t(label, comp) AS (
  VALUES
    ('全 STRONG（應為 20）',     'STRONG'),
    ('全 ADEQUATE（應為 13）',   'ADEQUATE'),
    ('全 DEVELOPING（應為 7）',  'DEVELOPING')
)
SELECT t.label AS "檢查項",
       (public.writing_score_20(jsonb_build_object(
          'categories', (SELECT jsonb_agg(jsonb_build_object(
            'code', 'W' || i,
            'skills', jsonb_build_array(
              jsonb_build_object('code','x','state', t.comp))))
            FROM generate_series(1,5) AS i)
        )) ->> 'score') AS "分數"
  FROM t;
