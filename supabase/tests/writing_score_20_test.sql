-- =====================================================
-- 作文 20 分制總分 writing_score_20()
--
-- 🛑 這份測試最重要的一條：UNMEASURED【不可以拉低分數】。
--    它代表「這次的題目沒有要求你展現這個能力」，不是「你做不到」。
--    算成 0 分不會報錯，只會讓每個人的分數莫名其妙偏低——
--    而且題目越簡單、被判 UNMEASURED 的越多，分數就越低。
-- =====================================================

\set ON_ERROR_STOP on
\set QUIET on

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label;
  END IF;
END $$;

/** 造一份 competency_analysis：每個類別給一串 state */
CREATE OR REPLACE FUNCTION t_comp(VARIADIC p_states TEXT[]) RETURNS JSONB
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'taxonomy_version', 'writing-v1',
    'categories', jsonb_agg(
      jsonb_build_object(
        'code', 'W' || i,
        'summary', '...',
        -- 每個類別三個 skill，狀態相同；分開測混合的情況在 C 段
        'skills', CASE WHEN p_states[i] = 'EMPTY' THEN '[]'::jsonb
                  ELSE jsonb_build_array(
                    jsonb_build_object('code', 'x1', 'state', p_states[i], 'reason', 'r', 'evidence', '[]'::jsonb),
                    jsonb_build_object('code', 'x2', 'state', p_states[i], 'reason', 'r', 'evidence', '[]'::jsonb),
                    jsonb_build_object('code', 'x3', 'state', p_states[i], 'reason', 'r', 'evidence', '[]'::jsonb))
                  END)
      ORDER BY i))
    FROM generate_subscripts(p_states, 1) AS i;
$$;

\echo '════════ A. 基本換算 ════════'

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','STRONG','STRONG','STRONG')) ->> 'score')::int = 20,
  'A1 五個類別全 STRONG = 20');

SELECT t_assert(
  (writing_score_20(t_comp('ADEQUATE','ADEQUATE','ADEQUATE','ADEQUATE','ADEQUATE')) ->> 'score')::int = 15,
  'A2 全 ADEQUATE = 15（3/4 × 20）');

SELECT t_assert(
  (writing_score_20(t_comp('DEVELOPING','DEVELOPING','DEVELOPING','DEVELOPING','DEVELOPING')) ->> 'score')::int = 10,
  '🛑 A3 全 DEVELOPING = 10 —— 這是量表的【下限】，不是 0。'
  '四個狀態裡沒有任何一個代表「完全不行」');

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','ADEQUATE','ADEQUATE','DEVELOPING')) ->> 'score')::int = 16,
  'A4 混合：4+4+3+3+2 = 16，滿分 20 → 16');

\echo '════════ B. UNMEASURED ════════'

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','STRONG','STRONG','UNMEASURED')) ->> 'score')::int = 20,
  '🛑 B1 一個類別全未量到時【不拉低分數】——它被排除在分母外');

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','STRONG','STRONG','UNMEASURED')) ->> 'measured')::int = 4
  AND (writing_score_20(t_comp('STRONG','STRONG','STRONG','STRONG','UNMEASURED')) ->> 'total')::int = 5,
  '🛑 B2 而且回報 4 / 5 —— 畫面要講得出分母，不能假裝五項都評了');

SELECT t_assert(
  writing_score_20(t_comp('UNMEASURED','UNMEASURED','UNMEASURED','UNMEASURED','UNMEASURED')) IS NULL,
  '🛑 B3 全部未量到就【沒有分數】，不是 0 分');

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','EMPTY','EMPTY','EMPTY','EMPTY')) ->> 'measured')::int = 1,
  'B4 skills 是空陣列的類別也排除');

\echo '════════ C. 類別內混合 ════════'

-- W1 = STRONG + UNMEASURED + DEVELOPING → 有量到的是 4 與 2，平均 3
SELECT t_assert(
  (writing_score_20(jsonb_build_object(
     'categories', jsonb_build_array(
       jsonb_build_object('code','W1','summary','s','skills', jsonb_build_array(
         jsonb_build_object('code','a','state','STRONG'),
         jsonb_build_object('code','b','state','UNMEASURED'),
         jsonb_build_object('code','c','state','DEVELOPING')))))
   ) -> 'categories' -> 0 ->> 'points')::int = 3,
  '🛑 C1 類別內的 UNMEASURED 也只是被略過，不會把那一類拉低');

-- 平均 3.5 → round 4（Postgres 的 round 對 .5 是遠離零）
SELECT t_assert(
  (writing_score_20(jsonb_build_object(
     'categories', jsonb_build_array(
       jsonb_build_object('code','W1','summary','s','skills', jsonb_build_array(
         jsonb_build_object('code','a','state','STRONG'),
         jsonb_build_object('code','b','state','ADEQUATE')))))
   ) -> 'categories' -> 0 ->> 'points')::int = 4,
  'C2 類別分數取 skill 平均後四捨五入');

\echo '════════ D. 壞資料 ════════'

SELECT t_assert(writing_score_20(NULL) IS NULL, 'D1 NULL 進 NULL 出（STRICT）');
SELECT t_assert(writing_score_20('{}'::jsonb) IS NULL, 'D2 沒有 categories 時回 NULL，不是爆掉');
SELECT t_assert(writing_score_20('{"categories": "not-an-array"}'::jsonb) IS NULL,
  'D3 categories 不是陣列時回 NULL');
SELECT t_assert(writing_score_20('{"categories": []}'::jsonb) IS NULL, 'D4 空的 categories 回 NULL');

SELECT t_assert(
  writing_score_20(jsonb_build_object('categories', jsonb_build_array(
    jsonb_build_object('code','W1','summary','s','skills',
      jsonb_build_array(jsonb_build_object('code','a','state','WHAT_IS_THIS'))))) ) IS NULL,
  '🛑 D5 不認得的 state 當成沒量到，不會被當成某個預設分數');

\echo '════════ E. 權限 ════════'

SELECT t_assert(
  NOT has_function_privilege('anon', 'writing_score_20(jsonb)', 'EXECUTE'),
  'E1 anon 叫不動');

\echo ''
\echo '全部通過'
