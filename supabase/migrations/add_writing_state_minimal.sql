-- =====================================================
-- 作文 20 分制：把量表下限從 7 打開到 0
--
-- 🟢 只要在 production 執行一次。
-- 🛑 執行前先跑 supabase/tests/writing-score-audit/04-state-vocabulary.sql，
--    確認「不認得的總數」是 0。理由見下面第【三】點。
--
-- ══════════════════════════════════════════════════════════════
-- 為什麼
-- ══════════════════════════════════════════════════════════════
--
-- 老師要能給爛作文 0–6 分。原本給不出來：
--
--   四個狀態裡【沒有任何一個代表「完全不行」】。最低的 DEVELOPING 是
--   「有嘗試但控制不穩」，賦值 1，所以整篇最低就是 20 × 1/3 = 6.67 → 7。
--   7 不是「目前剛好沒人更低」，是【算不出比它更低的數字】。
--
--   實測 production 60 篇裡約 30 篇擠在 7–10 —— 底部分辨不出好壞。
--
-- 所以在 DEVELOPING 之下加第五個狀態 MINIMAL，賦值 0。
--
-- ══════════════════════════════════════════════════════════════
-- 改什麼
-- ══════════════════════════════════════════════════════════════
--
-- 【一】新增 MINIMAL = 0
--
--   STRONG 3 / ADEQUATE 2 / DEVELOPING 1 / MINIMAL 0
--   UNMEASURED 仍然排除在分母外。
--
--   🛑 STRONG 仍然是 3，分母仍然是 3 × 類別數 ——
--      所以這支對【現有資料完全沒有影響】。舊作文的分數一分不動
--      （舊資料裡沒有 MINIMAL）。這跟上一次改賦值不同，那次是追溯性的。
--
--   新的端點：
--     全 STRONG      20   （不變）
--     全 ADEQUATE    13   （不變）
--     全 DEVELOPING   7   （不變，現在它不再是下限）
--     全 MINIMAL      0   （新）
--
--   0–6 這一段怎麼落到：類別平均低於 0.9 就進得去。
--     5 類全 MINIMAL                     → 0
--     4 類 MINIMAL + 1 類 DEVELOPING     → 1
--     3 + 2                              → 3
--     2 + 3                              → 4
--     1 + 4                              → 5
--   類別內是 skill 的平均（小數），所以中間的值都填得滿。
--
-- 【二】0 分和「沒有分數」仍然是兩件事
--
--   全 MINIMAL  → 0 分（有量到，判定是最低）
--   全 UNMEASURED → NULL，完全不顯示分數（沒有可判斷的材料）
--
--   這兩者不可以互相取代，跟 analysisContract.ts 開頭講的是同一條線。
--
-- 【三】🛑 不認得的 state 從「排除」改成「整篇沒有分數」
--
--   原本的行為：CASE 沒有命中就回 NULL，avg() 略過它 —— 等於【排除在分母外】。
--
--   那會造成一個很難發現的失敗：如果 prompt 先上線、這支 migration 還沒跑，
--   新寫入的 MINIMAL 在舊函式眼裡是不認得的值，於是被排除 ——
--   【最爛的那幾項不算分，爛作文的分數反而變高】。
--   而且畫面上看起來完全正常，只是數字偏高。
--
--   所以改成：只要出現不在五個值裡的 state，整篇回 NULL。
--   「沒有分數」是誠實的，「算得出來但是錯的」不是。
--
--   代價：萬一 production 存著第五種 state，那幾篇會立刻變成讀不到分數。
--   先跑 04-state-vocabulary.sql 確認是 0 篇。
--
-- 🛑 【沒有】動 AI 的 prompt —— 那在另一個 commit。
--    這支先上，才不會有上面第【三】點那個窗口。
--
-- 回滾：supabase/migrations/add_writing_state_minimal.rollback.sql
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

  -- 🛑 不認得的 state → 整篇沒有分數，而不是把它排除在分母外。
  --    排除的話，分數會【偏高】而且看起來正常（見檔頭第三點）。
  --    CROSS JOIN 而非 LEFT JOIN：skills 是空陣列的類別不產生列，
  --    不會被誤判成「缺 state」。
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_competency -> 'categories') c
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(c -> 'skills') = 'array' THEN c -> 'skills'
             ELSE '[]'::jsonb END) s
     WHERE s ->> 'state' IS NULL
        OR s ->> 'state' NOT IN
             ('STRONG', 'ADEQUATE', 'DEVELOPING', 'MINIMAL', 'UNMEASURED')
  ) THEN
    RETURN NULL;
  END IF;

  WITH per_category AS (
    SELECT
      c ->> 'code' AS code,
      -- UNMEASURED 在 CASE 裡回 NULL，avg() 會自己略過——
      -- 這就是「排除在分母之外」的實作。
      -- 🛑 MINIMAL 是 0，【不是】NULL —— 它要算進分母，而且是最低分。
      avg(CASE s ->> 'state'
            WHEN 'STRONG'     THEN 3
            WHEN 'ADEQUATE'   THEN 2
            WHEN 'DEVELOPING' THEN 1
            WHEN 'MINIMAL'    THEN 0
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
      -- 🛑 points 是小數（類別內的平均），不是整數。
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
  '從 Axis 1（W1–W5）推導 20 分制總分。每個類別取其 skill 的平均（STRONG 3 / ADEQUATE 2 / DEVELOPING 1 / MINIMAL 0），UNMEASURED 排除在分母外，再按有量到的類別數換算回 20 分。量表下限是 0（全 MINIMAL）；全部未量到時回 NULL —— 0 分與「沒有分數」是兩件事。🛑 類別內刻意不 round —— numeric 的 round 遠離零，會把「一半 STRONG 一半 ADEQUATE」單向墊高成完全 STRONG。🛑 出現五個值以外的 state 時整篇回 NULL，不把它排除在分母外 —— 排除會讓分數偏高而且看起來正常。';

REVOKE ALL ON FUNCTION writing_score_20(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_score_20(JSONB) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
-- 前三個端點必須【不變】—— 這支不應該動到任何舊作文的分數。
WITH t(ord, label, st) AS (
  VALUES
    (1, '全 STRONG（應為 20，不變）',     'STRONG'),
    (2, '全 ADEQUATE（應為 13，不變）',   'ADEQUATE'),
    (3, '全 DEVELOPING（應為 7，不變）',  'DEVELOPING'),
    (4, '🛑 全 MINIMAL（應為 0，新的下限）', 'MINIMAL')
)
SELECT t.label AS "檢查項",
       coalesce(
         (public.writing_score_20(jsonb_build_object(
            'categories', (SELECT jsonb_agg(jsonb_build_object(
              'code', 'W' || i,
              'skills', jsonb_build_array(
                jsonb_build_object('code','x','state', t.st))))
              FROM generate_series(1,5) AS i)
          )) ->> 'score'), '(沒有分數)') AS "分數"
  FROM t

UNION ALL
-- 🛑 全部未量到仍然是「沒有分數」，不是 0 分。
SELECT '🛑 全 UNMEASURED（應為「沒有分數」，不是 0）',
       coalesce((public.writing_score_20(jsonb_build_object(
         'categories', (SELECT jsonb_agg(jsonb_build_object(
           'code', 'W' || i,
           'skills', jsonb_build_array(
             jsonb_build_object('code','x','state','UNMEASURED'))))
           FROM generate_series(1,5) AS i)
       )) ->> 'score'), '(沒有分數)')

UNION ALL
-- 🛑 這一列是檔頭第三點的驗收：不認得的 state 混在 STRONG 裡面。
--    舊函式會把它排除，答出 20；新函式必須答「沒有分數」。
SELECT '🛑 4 個 STRONG + 1 個不認得的 state（舊函式會答 20）',
       coalesce((public.writing_score_20(jsonb_build_object(
         'categories', jsonb_build_array(
           jsonb_build_object('code','W1','skills', jsonb_build_array(jsonb_build_object('code','x','state','STRONG'))),
           jsonb_build_object('code','W2','skills', jsonb_build_array(jsonb_build_object('code','x','state','STRONG'))),
           jsonb_build_object('code','W3','skills', jsonb_build_array(jsonb_build_object('code','x','state','STRONG'))),
           jsonb_build_object('code','W4','skills', jsonb_build_array(jsonb_build_object('code','x','state','STRONG'))),
           jsonb_build_object('code','W5','skills', jsonb_build_array(jsonb_build_object('code','x','state','TYPO_HERE'))))
       )) ->> 'score'), '(沒有分數)');
