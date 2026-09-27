-- =====================================================
-- VC 題：標出「被考的是哪一次出現」
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 這支只加欄位與改 reading_get_passage，【不填任何資料】。
--    填資料是下一支：backfill_reading_question_target.sql。
--
-- 【為什麼需要這個】
--   VC 題考的是某一個字在【某一處】的意思。同一個字在文章裡出現多次時，
--   學生不知道題目問的是哪一個。實測 290 題 VC：
--     269 題（92.8%）該字在文章裡只出現一次
--      19 題（6.6%）出現兩到三次 ← 就是這些會誤導
--       2 題 文章裡根本沒有那個字（題目本身有問題，另案處理）
--
-- 🛑 為什麼是 (文字, 第幾次) 而不是 character offset：
--    offset 只要 passage_text 被改過一個空白就全部失效，而且人看不懂、
--    沒辦法校對。(文字, 第幾次) 對空白正規化免疫，你一眼就能判斷對不對。
--
-- 🛑 兩欄【要嘛都有值，要嘛都是 NULL】。只有文字沒有次數，畫面就得猜
--    「大概是第一個吧」——那正是這次要消滅的行為。CHECK 擋住。
--
-- 🛑 畫面只在兩欄都有值時才標。標不出來就不標，不要標錯。
--
-- 回滾：supabase/migrations/add_reading_question_target.rollback.sql
-- =====================================================

ALTER TABLE reading_questions
  ADD COLUMN IF NOT EXISTS target_text       TEXT,
  ADD COLUMN IF NOT EXISTS target_occurrence SMALLINT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reading_questions_target_pair') THEN
    ALTER TABLE reading_questions
      ADD CONSTRAINT reading_questions_target_pair CHECK (
        (target_text IS NULL AND target_occurrence IS NULL)
        OR (length(btrim(target_text)) > 0 AND target_occurrence >= 1)
      );
  END IF;
END $$;

COMMENT ON COLUMN reading_questions.target_text IS
  'VC 題要標出來的原文片段（通常是題幹引號裡的那個字）。NULL = 不標。';
COMMENT ON COLUMN reading_questions.target_occurrence IS
  '那個片段在 passage_text 裡的第幾次出現，1-based。🛑 不可以用 offset：passage_text 改一個空白就全歪。';


-- ── 取題時把 anchor 一起回傳 ──────────────────────────
-- ⚠️ CREATE OR REPLACE，signature 沒變，不需要 DROP。
CREATE OR REPLACE FUNCTION reading_get_passage(
  p_passage_id TEXT,
  p_session_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_admin BOOLEAN := coalesce(public.is_admin(), false);
  v_p     public.reading_passages%ROWTYPE;
  v_out   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  IF coalesce(public.learn_feature_enabled('reading'), false) IS NOT TRUE THEN
    RAISE EXCEPTION '閱讀練習尚未對你開放' USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.reading_sessions
                      WHERE id = p_session_id AND student_id = v_uid) THEN
    RAISE EXCEPTION '找不到這次練習' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_p FROM public.reading_passages WHERE passage_id = p_passage_id;

  IF v_p.passage_id IS NULL OR (v_p.status <> 'PUBLISHED' AND NOT v_admin) THEN
    RAISE EXCEPTION '找不到這篇文章' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'passage', jsonb_build_object(
      'passage_id',     v_p.passage_id,
      'title',          v_p.title,
      'passage_text',   v_p.passage_text,
      'cefr_level',     v_p.cefr_level,
      'content_family', v_p.content_family,
      'subdomain',      v_p.subdomain,
      'word_count',     array_length(regexp_split_to_array(btrim(v_p.passage_text), '\s+'), 1)
    ),
    'questions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'question_id', q.id,
               'construct',   q.construct,
               'question',    q.question,
               'options',     opt.j,
               -- 🛑 這兩個是【顯示用的 anchor】，不是答案。
               --    它只說「題目問的是文章裡的這一處」，不透露正解。
               'target_text',       q.target_text,
               'target_occurrence', q.target_occurrence
             ) ORDER BY q.display_order), '[]'::jsonb)
        FROM public.reading_questions q
        CROSS JOIN LATERAL (
          SELECT jsonb_object_agg(
                   chr(64 + i.i),
                   CASE perm.p[i.i]
                     WHEN 'A' THEN q.option_a
                     WHEN 'B' THEN q.option_b
                     WHEN 'C' THEN q.option_c
                     ELSE q.option_d
                   END) AS j
            FROM (SELECT CASE
                           WHEN p_session_id IS NULL THEN ARRAY['A','B','C','D']::CHAR(1)[]
                           ELSE public.reading_option_permutation(p_session_id, q.id)
                         END AS p) perm,
                 generate_series(1, 4) AS i(i)
        ) opt
       WHERE q.passage_id = v_p.passage_id
    ),
    'paragraphs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'paragraph_no', pr.paragraph_no, 'description', pr.description
             ) ORDER BY pr.paragraph_no), '[]'::jsonb)
        FROM public.reading_passage_paragraphs pr
       WHERE pr.passage_id = v_p.passage_id
    ),
    'vocab', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'tier', v.tier, 'term', v.term,
               'definition', v.definition, 'paragraph_no', v.paragraph_no
             ) ORDER BY v.tier, v.term), '[]'::jsonb)
        FROM public.reading_passage_vocab v
       WHERE v.passage_id = v_p.passage_id
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION reading_get_passage IS
  '學生端取題：文章、六題、段落地圖、詞彙，一次往返。選項依 (session_id, question_id) 重排後才貼上 A–D；排列不隨回傳值送出。VC 題附 target_text / target_occurrence 供畫面標示。🛑 回傳【不含】正解與解說。';

REVOKE ALL ON FUNCTION reading_get_passage(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_get_passage(TEXT, UUID) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'reading_questions'
      AND column_name IN ('target_text', 'target_occurrence'))            AS "新欄位數（應為 2）",
  (SELECT count(*) FROM pg_constraint
    WHERE conname = 'reading_questions_target_pair')                      AS "CHECK（應為 1）",
  (SELECT count(*) FROM reading_questions WHERE target_text IS NOT NULL)  AS "已填的題數（這支不填，應為 0）";
