-- =====================================================
-- 閱讀練習開放控制（1／2）：取題
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 這是【改寫既有函式】（CREATE OR REPLACE），不是新建。
--    執行前 reading_get_passage 已經存在，這支只是在它前面多一道檢查。
--
-- 🛑 加上 learn_feature_enabled('reading') 之後，【沒有被開放的學生叫不動它】。
--    開放對象在 /admin/feature-access 設定，預設【不對任何人開放】。
--    管理員不受影響——learn_feature_enabled 對管理員一律回 true。
--
-- 回滾：把 create_reading_student_rpc_* 的原版重新執行一次即可（純加檢查）。
-- =====================================================

CREATE OR REPLACE FUNCTION reading_get_passage(p_passage_id TEXT)
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
  --    藏起來的頁面仍然打得到 API——瀏覽器 console 裡一行 supabase.rpc()
  --    就繞過去了。真正決定誰看得到閱讀練習的是這一行。
  --
  --    learn_feature_enabled() 對管理員一律回 true，所以後台預覽不受影響。
  IF coalesce(public.learn_feature_enabled('reading'), false) IS NOT TRUE THEN
    RAISE EXCEPTION '閱讀練習尚未對你開放' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM public.reading_passages WHERE passage_id = p_passage_id;

  -- 🛑 找不到與沒上架回同一個錯誤。
  --    分開講會讓人用這支去探測「哪些 passage_id 存在但還沒上架」。
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
               'options',     jsonb_build_object('A', q.option_a, 'B', q.option_b,
                                                 'C', q.option_c, 'D', q.option_d)
             ) ORDER BY q.display_order), '[]'::jsonb)
        FROM public.reading_questions q
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
  '學生端取題：文章、六題、段落地圖、詞彙，一次往返。🛑 回傳【不含】正解與解說。但答案的安全性靠的是 reading_question_keys 沒有發給 authenticated 任何權限，不是靠這支。';

REVOKE ALL ON FUNCTION reading_get_passage(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_get_passage(TEXT) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                               AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',')                         AS "設定",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'reading_get_passage';
