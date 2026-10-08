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
  'A3 全 DEVELOPING = 7。'
  '🛑 這【曾經】是量表的下限（當時只有四個狀態，沒有一個代表「完全不行」）。'
  'add_writing_state_minimal.sql 之後下限是 0，而這一條必須仍然是 7 ——'
  '新增 MINIMAL 不應該動到任何既有評級的分數');

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','ADEQUATE','ADEQUATE','DEVELOPING')) ->> 'score')::int = 15,
  'A4 混合：3+3+2+2+1 = 11，20 × 11/15 = 14.7 → 15');

SELECT t_assert(
  (writing_score_20(t_comp('MINIMAL','MINIMAL','MINIMAL','MINIMAL','MINIMAL')) ->> 'score')::int = 0,
  '🛑 A5 全 MINIMAL = 0 —— 這是新的下限。'
  '老師要能給爛作文 0–6 分，而在 MINIMAL 之前算不出低於 7 的數字');

\echo '──── A6–A9：0–6 這一段真的到得了（這是這次改動的全部目的）────'

-- 每個類別三個 skill、狀態相同，所以類別平均就是該狀態的賦值。
-- sum / (3 × 5) × 20：MINIMAL 每多一類，分數就往下一階。
SELECT t_assert(
  (writing_score_20(t_comp('MINIMAL','MINIMAL','MINIMAL','MINIMAL','DEVELOPING')) ->> 'score')::int = 1,
  'A6 四類 MINIMAL + 一類 DEVELOPING = 1（20 × 1/15 = 1.33）');

SELECT t_assert(
  (writing_score_20(t_comp('MINIMAL','MINIMAL','MINIMAL','DEVELOPING','DEVELOPING')) ->> 'score')::int = 3,
  'A7 三類 MINIMAL + 兩類 DEVELOPING = 3（20 × 2/15 = 2.67）');

SELECT t_assert(
  (writing_score_20(t_comp('MINIMAL','MINIMAL','DEVELOPING','DEVELOPING','DEVELOPING')) ->> 'score')::int = 4,
  'A8 兩類 MINIMAL + 三類 DEVELOPING = 4');

SELECT t_assert(
  (writing_score_20(t_comp('MINIMAL','DEVELOPING','DEVELOPING','DEVELOPING','DEVELOPING')) ->> 'score')::int = 5,
  'A9 一類 MINIMAL + 四類 DEVELOPING = 5');

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

\echo '════════ 🛑 B5–B8. MINIMAL 與 UNMEASURED 方向相反 ════════'
-- 🛑 這一組是整個改動的對照組，也是最容易寫錯的地方。
--    兩個狀態都是「沒看到這個能力」，但計分方向完全相反：
--      MINIMAL     判定學生沒做到 → 算進分母，0 分，會把分數【拉低】
--      UNMEASURED  沒有可判斷的材料 → 排除在分母外，【不影響】分數
--
--    把 MINIMAL 寫成排除（也就是忘了在 CASE 裡列它）會怎樣？
--    最爛的那幾項不算分 —— 爛作文的分數【反而變高】，而且畫面上看起來正常。
--    B5 與 B6 是同一份評級，只差最後一類的狀態；分數必須不同。

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','STRONG','STRONG','MINIMAL')) ->> 'score')::int = 16,
  '🛑 B5 四類 STRONG + 一類 MINIMAL = 16 —— MINIMAL 把分數拉低了'
  '（3+3+3+3+0 = 12，20 × 12/15）');

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','STRONG','STRONG','UNMEASURED')) ->> 'score')::int = 20,
  '🛑 B6 同一份評級但最後一類是 UNMEASURED → 20，完全不受影響。'
  '與 B5 的 16 相差 4 分 —— 這個差額就是「算進分母」與「排除」的差別。'
  '🛑 如果 B5 也答 20，代表 MINIMAL 被當成沒量到，改動是反向的');

SELECT t_assert(
  (writing_score_20(t_comp('STRONG','STRONG','STRONG','STRONG','MINIMAL')) ->> 'measured')::int = 5,
  '🛑 B7 而且 MINIMAL 要算在 measured 裡（5 項全評了），'
  '不可以像 UNMEASURED 那樣讓分母變成 4');

SELECT t_assert(
  (writing_score_20(t_comp('MINIMAL','MINIMAL','MINIMAL','MINIMAL','MINIMAL')) IS NOT NULL
   AND (writing_score_20(t_comp('MINIMAL','MINIMAL','MINIMAL','MINIMAL','MINIMAL')) ->> 'score')::int = 0
   AND writing_score_20(t_comp('UNMEASURED','UNMEASURED','UNMEASURED','UNMEASURED','UNMEASURED')) IS NULL),
  '🛑 B8 「0 分」與「沒有分數」是兩件事：'
  '全 MINIMAL → 0（評了，判定最低）；全 UNMEASURED → NULL（沒東西可評）。'
  '混為一談的話，交白卷和沒題材會長得一樣');

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

-- 🛑 類別內的 MINIMAL 是 0，要參與平均；UNMEASURED 才是被略過。
--    這兩條用的是同一個類別、同一組「有量到」的 skill，
--    差別只在中間多插一個 UNMEASURED —— 平均必須一樣。
SELECT t_assert(
  (writing_score_20(jsonb_build_object(
     'categories', jsonb_build_array(
       jsonb_build_object('code','W1','summary','s','skills', jsonb_build_array(
         jsonb_build_object('code','a','state','MINIMAL'),
         jsonb_build_object('code','b','state','STRONG')))))
   ) -> 'categories' -> 0 ->> 'points')::numeric = 1.5,
  '🛑 C4 類別內 MINIMAL + STRONG 的平均是 1.5（0 與 3），'
  'MINIMAL 參與平均 —— 被略過的話會變成 3');

SELECT t_assert(
  (writing_score_20(jsonb_build_object(
     'categories', jsonb_build_array(
       jsonb_build_object('code','W1','summary','s','skills', jsonb_build_array(
         jsonb_build_object('code','a','state','MINIMAL'),
         jsonb_build_object('code','b','state','UNMEASURED'),
         jsonb_build_object('code','c','state','STRONG')))))
   ) -> 'categories' -> 0 ->> 'points')::numeric = 1.5,
  'C5 中間插一個 UNMEASURED 不改變平均，仍是 1.5 —— 只有它被略過');

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
  'D5 唯一一個 skill 的 state 不認得時沒有分數');

-- 🛑 D6 才是真正分辨得出行為的那一條。
--
--    D5 自己證明不了什麼：它只有一個 skill，所以不管「排除在分母外」還是
--    「整篇回 NULL」，答案都是 NULL。兩種行為它都會通過 —— 那是空心的斷言。
--
--    D6 把不認得的 state 混在四個 STRONG 裡面：
--      舊行為（排除在分母外）→ 20 分，看起來完全正常
--      現行行為（整篇 NULL） → 沒有分數
--
--    為什麼要是 NULL：如果 prompt 先上線、migration 還沒跑，新的 MINIMAL
--    在舊函式眼裡就是「不認得的 state」。排除掉的話，最爛的那幾項不算分，
--    【爛作文的分數反而變高】，而且畫面上沒有任何線索。
--    「沒有分數」是誠實的；「算得出來但偏高」不是。
SELECT t_assert(
  writing_score_20(jsonb_build_object('categories', jsonb_build_array(
    jsonb_build_object('code','W1','skills', jsonb_build_array(jsonb_build_object('code','a','state','STRONG'))),
    jsonb_build_object('code','W2','skills', jsonb_build_array(jsonb_build_object('code','a','state','STRONG'))),
    jsonb_build_object('code','W3','skills', jsonb_build_array(jsonb_build_object('code','a','state','STRONG'))),
    jsonb_build_object('code','W4','skills', jsonb_build_array(jsonb_build_object('code','a','state','STRONG'))),
    jsonb_build_object('code','W5','skills', jsonb_build_array(jsonb_build_object('code','a','state','TYPO_HERE')))))
  ) IS NULL,
  '🛑 D6 不認得的 state 混在四個 STRONG 裡 → 整篇沒有分數。'
  '舊行為會把它排除在分母外並答 20 —— 偏高而且看起來正常。'
  '這一條是 D5 證明不了的那半');

-- 同一個類別【裡面】混進不認得的值，也要擋住
SELECT t_assert(
  writing_score_20(jsonb_build_object('categories', jsonb_build_array(
    jsonb_build_object('code','W1','skills', jsonb_build_array(
      jsonb_build_object('code','a','state','STRONG'),
      jsonb_build_object('code','b','state','SOMETHING_ELSE')))))
  ) IS NULL,
  'D7 類別內部混進不認得的值也是沒有分數，不是只看類別層');

-- 🛑 skill 物件根本沒有 state 欄位 —— 不是「不認得」，是缺欄位
SELECT t_assert(
  writing_score_20(jsonb_build_object('categories', jsonb_build_array(
    jsonb_build_object('code','W1','skills', jsonb_build_array(
      jsonb_build_object('code','a','reason','忘了寫 state')))))
  ) IS NULL,
  'D8 skill 少了 state 欄位時沒有分數，不是當成沒量到');

-- 對照：skills 是【空陣列】是合法的（B4 已經在用），不可以被 D6–D8 的檢查誤殺
SELECT t_assert(
  (writing_score_20(t_comp('STRONG','EMPTY','EMPTY','EMPTY','EMPTY')) ->> 'score')::int = 20,
  '🛑 D9 對照組：skills 是空陣列【仍然合法】，'
  '不可以被「缺 state」的檢查誤判成壞資料。'
  '少了這一條，D8 可能是用「把空類別也當壞資料」換來的');

\echo '════════ E. 權限 ════════'

SELECT t_assert(
  NOT has_function_privilege('anon', 'writing_score_20(jsonb)', 'EXECUTE'),
  'E1 anon 叫不動');

\echo ''
\echo '全部通過'
