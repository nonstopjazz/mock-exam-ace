-- =====================================================
-- 作文 20 分制總分 writing_score_20()
--
-- 🛑 2026-10-08 改成等距賦值（STRONG 3 / ADEQUATE 2 / DEVELOPING 1）
--    並去掉類別內的 round()。端點因此變成 20 / 13 / 7。
--    詳見 supabase/migrations/change_writing_score_20_even_spacing.sql
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
  (writing_score_20(t_comp('ADEQUATE','ADEQUATE','ADEQUATE','ADEQUATE','ADEQUATE')) ->> 'score')::int = 13,
  'A2 全 ADEQUATE = 13（2/3 × 20 = 13.3）');

SELECT t_assert(
  (writing_score_20(t_comp('DEVELOPING','DEVELOPING','DEVELOPING','DEVELOPING','DEVELOPING')) ->> 'score')::int = 7,
  '🛑 A3 全 DEVELOPING = 7 —— 這是量表的【下限】，不是 0。'
  '四個狀態裡沒有任何一個代表「完全不行」。'
  '等距之前這裡是 10，整個下半部量表用不到');

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','ADEQUATE','ADEQUATE','DEVELOPING')) ->> 'score')::int = 15,
  'A4 混合：3+3+2+2+1 = 11，20 × 11/15 = 14.7 → 15');

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
   ) -> 'categories' -> 0 ->> 'points')::numeric = 2.0,
  '🛑 C1 類別內的 UNMEASURED 也只是被略過，不會把那一類拉低'
  '（STRONG 3 與 DEVELOPING 1 的平均 = 2，UNMEASURED 不算進分母）');

-- 🛑 一半 STRONG、一半 ADEQUATE → 平均 2.5，而且【不會被 round 成 3】。
--    這是 2026-10-08 那次修正的重點：numeric 的 round() 遠離零，
--    原本 avg(4,3) = 3.5 會被推成 4，把這個類別算成【完全 STRONG】。
--    .5 永遠往上、不會往下，所以那是單向墊高。
SELECT t_assert(
  (writing_score_20(jsonb_build_object(
     'categories', jsonb_build_array(
       jsonb_build_object('code','W1','summary','s','skills', jsonb_build_array(
         jsonb_build_object('code','a','state','STRONG'),
         jsonb_build_object('code','b','state','ADEQUATE')))))
   ) -> 'categories' -> 0 ->> 'points')::numeric = 2.5,
  '🛑 C2 類別分數就是 skill 的平均，【不 round】——'
  '2.5 留著 2.5，不會被推成 3');

-- 整篇每個類別都是「一半 STRONG、一半 ADEQUATE」→ 平均都是 2.5。
-- 舊公式會把每一類推成 4（= 滿分），整篇變成 20 分。
-- 現在應該是 20 × 12.5/15 = 16.7 → 17。
SELECT t_assert(
  (writing_score_20(jsonb_build_object(
     'categories', (SELECT jsonb_agg(jsonb_build_object(
       'code','W' || i,
       'skills', jsonb_build_array(
         jsonb_build_object('code','a','state','STRONG'),
         jsonb_build_object('code','b','state','ADEQUATE'))))
       FROM generate_series(1,5) AS i))
   ) ->> 'score')::int = 17,
  '🛑 C3 整篇都剛好 .5 時是 17 分，不是 20 ——'
  '舊公式會把每一類單向墊高成滿分');

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
