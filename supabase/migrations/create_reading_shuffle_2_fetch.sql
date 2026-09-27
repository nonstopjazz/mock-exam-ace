-- =====================================================
-- 選項亂序（2／5）：取題時重排選項
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 先執行 create_reading_shuffle_1_perm.sql。
--
-- 🛑 這支會【先 DROP 再建】，SQL Editor 會跳 destructive 警告。
--    原因是多了一個參數就是新的 signature，只做 CREATE OR REPLACE 會留下
--    舊的那支，然後 supabase.rpc('reading_get_passage', {p_passage_id})
--    會因為兩支都符合而報 "function is not unique"。
--
--    DROP 之後權限會回到預設（PUBLIC 可執行），所以下面的 REVOKE/GRANT
--    是必要的，不是抄來的樣板。
--
-- 🛑 排列【不隨回傳值送出】。前端只看得到重排後的 A–D 文字，
--    看不到它們原本是什麼——拿到對照表就能套用題庫的答案偏斜去猜。
--
-- 🛑 p_session_id 是 NULL 時【不重排】。後台預覽沒有 session，
--    那時看到的就是題庫原本的順序。
--
-- 回滾：supabase/migrations/create_reading_shuffle_2_fetch.rollback.sql
-- =====================================================

DROP FUNCTION IF EXISTS reading_get_passage(TEXT);

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

  -- 🛑 這道閘是【真的】那一道。StudentFeatureGate 只是不渲染頁面，
  --    藏起來的頁面仍然打得到 API。
  IF coalesce(public.learn_feature_enabled('reading'), false) IS NOT TRUE THEN
    RAISE EXCEPTION '閱讀練習尚未對你開放' USING ERRCODE = '42501';
  END IF;

  -- 🛑 session 必須是自己的。不擋的話，學生可以借別人的 session_id
  --    去問「那個人這一題的選項排成什麼樣」——那等於發出對照表。
  IF p_session_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.reading_sessions
                      WHERE id = p_session_id AND student_id = v_uid) THEN
    RAISE EXCEPTION '找不到這次練習' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_p FROM public.reading_passages WHERE passage_id = p_passage_id;

  -- 🛑 找不到與沒上架回同一個錯誤。
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
               'options',     opt.j
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
  '學生端取題：文章、六題、段落地圖、詞彙，一次往返。選項依 (session_id, question_id) 重排後才貼上 A–D；排列不隨回傳值送出。🛑 回傳【不含】正解與解說。';

REVOKE ALL ON FUNCTION reading_get_passage(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_get_passage(TEXT, UUID) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       pg_get_function_arguments(p.oid)                          AS "參數",
       p.prosecdef                                               AS "SECURITY DEFINER",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'reading_get_passage';
