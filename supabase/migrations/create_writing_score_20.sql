-- =====================================================
-- 作文 20 分制總分
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 兩支都是 CREATE OR REPLACE，signature 沒變，【不需要 DROP】。
--
-- 【為什麼是 5 × 0–4 而不是 4 × 0–5】
--   既有的 Axis 1 是 W1–W5，五個類別。硬湊成四個面向就會多出一套
--   跟 W1–W5 對不起來的評分標準，然後兩套遲早互相矛盾。
--   五個類別 × 0–4 剛好是 20 分，而且每一分都從既有分析推導得出——
--   不必重跑 AI，舊作文也算得出來。
--
-- 🛑 UNMEASURED 不算 0 分，是【排除在分母之外】。
--    題目沒有要求你寫論證，不等於你論證能力是 0。這與閱讀那邊
--    emphasis = NULL 不補 0 是同一條原則。
--
-- 🛑 類別本身沒有 state。契約裡的 CompetencyCategoryResult 只有 summary
--    與 skills[]，所以類別的分數必須從它底下的 skill 推出來。
--    一個類別底下【一個 skill 都沒量到】時，整個類別排除。
--
-- 🛑 這個量表的下限是 10 / 20，不是 0。
--    四個狀態裡只有 STRONG / ADEQUATE / DEVELOPING 是「有量到」，
--    沒有任何一個代表「完全不行」。硬把 DEVELOPING 當 0 分，等於
--    替分析捏造一個它從來沒有做出的判斷。要改的話只有一個地方：
--    下面那個 CASE。但那是產品決定，不是技術決定。
--
-- 回滾：supabase/migrations/create_writing_score_20.rollback.sql
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

-- ── 卡片列表帶出 20 分制總分 ──────────────────────────
-- ⚠️ CREATE OR REPLACE，signature 沒變，不需要 DROP。
CREATE OR REPLACE FUNCTION writing_student_essay_cards()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_rows JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'writing_student_essay_cards：需要登入' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
           jsonb_agg(row_to_json(c)::jsonb ORDER BY c.essay_date DESC, c.created_at DESC),
           '[]'::jsonb
         )
    INTO v_rows
    FROM (
      SELECT
        s.id AS essay_id,
        s.title,
        s.essay_topic,
        s.essay_date,
        s.submission_type,
        s.status,
        s.submitted_at,
        s.created_at,

        -- writing_texts 是 append-only，最新的一列才是目前的文字
        cur.char_count,
        cur.word_count,

        a.status AS analysis_status,
        -- 沒有分析列時是 false，不是 NULL —— 讓 client 端不必處理三態
        coalesce(a.status = 'COMPLETED', false) AS report_ready,

        -- 綜合層欄位一律以 COMPLETED 為閘門，與 writing_student_analysis() 相同。
        -- 半完成的報告寧可不顯示，也不給學生一個會變動的等第。
        CASE WHEN a.status = 'COMPLETED'
             THEN a.overall_evaluation ->> 'level' END AS overall_level,
        CASE WHEN a.status = 'COMPLETED'
             THEN a.overall_evaluation ->> 'headline' END AS overall_headline,

        -- 20 分制總分。與 overall_level 同一道閘：半完成的報告寧可不給分數，
        -- 也不要給一個等一下會變的數字。
        CASE WHEN a.status = 'COMPLETED'
             THEN public.writing_score_20(a.competency_analysis) END AS score,

        EXISTS (
          SELECT 1 FROM public.writing_teacher_feedback f
           WHERE f.essay_id = s.id
        ) AS has_teacher_feedback

      FROM public.writing_submissions s
      -- 目前的文字：writing_texts 是 append-only，最新一列才算數
      LEFT JOIN LATERAL (
        SELECT wt.char_count, wt.word_count
          FROM public.writing_texts wt
         WHERE wt.essay_id = s.id
         ORDER BY wt.created_at DESC
         LIMIT 1
      ) cur ON true
      -- 最新一次分析。重新分析會插入新列（analysis_version+1），舊列保留，
      -- 列表只看最新的那一次。
      LEFT JOIN LATERAL (
        -- 🛑 competency_analysis 要一起選出來，score 那一行才有東西可以算。
        --    少選這一欄不會在語法上報錯，會在執行時說「沒有這個欄位」。
        SELECT an.status, an.overall_evaluation, an.competency_analysis
          FROM public.writing_analyses an
         WHERE an.essay_id = s.id
         ORDER BY an.analysis_version DESC
         LIMIT 1
      ) a ON true
     WHERE s.student_id = v_uid
    ) c;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION writing_student_essay_cards IS
  '學生自己的作文列表（卡片版）。過濾條件只有 auth.uid()，不接受 student_id 參數。批改結果經策展：等第、headline 與 20 分制 score 只在 COMPLETED 時提供，永不回傳 provider / model / error_detail / validation_issues，也不回傳 competency_analysis 本身（只回推導出來的分數）。';

REVOKE ALL ON FUNCTION writing_student_essay_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_student_essay_cards() TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                               AS "SECURITY DEFINER",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_score_20', 'writing_student_essay_cards')
 ORDER BY p.proname;
