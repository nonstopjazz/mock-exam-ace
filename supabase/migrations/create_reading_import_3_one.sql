-- =====================================================
-- Six-Way Reading 匯入（3／4）：單篇匯入
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_import_2_hash.sql。
--
-- 這支做【一篇】的驗證與寫入。批次的迴圈在 create_reading_import_4_batch.sql，
-- 那裡把這支包在 BEGIN…EXCEPTION 裡，所以這支只要 RAISE，
-- 那一篇的所有寫入都會被回滾，而同批其他篇不受影響。
--
-- 🛑 這支【重新驗證全部】，不信任前端送來的任何東西。
--    前端也有一份驗證，那是為了給 admin 看 preview。
--    能被繞過的驗證不是驗證，是提示——瀏覽器的 console 裡
--    一行 supabase.rpc() 就繞過去了。
--
-- 🛑 衝突規則：不存在→匯入、內容相同→略過、內容不同→拒絕。
--    【任何情況都不自動覆蓋】，即使那一篇還沒有人作答。
--    要改內容應該另外設計明確的 replace / version 流程，
--    不可以藏在批次匯入裡——批次匯入是「補上缺的」，不是「改掉有的」。
--
-- 🛑 內部函式，不給任何角色 EXECUTE。它沒有 is_admin() 檢查，
--    授權在呼叫端。直接暴露它等於讓任何登入者寫題庫。
--
-- 回滾：supabase/migrations/create_reading_import_3_one.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_import_one_passage(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_p        JSONB := p_payload -> 'passage';
  v_pid      TEXT;
  v_hash     TEXT;
  v_existing TEXT;
  v_q        JSONB;
  v_qid      UUID;
  v_s        JSONB;
  v_pg       JSONB;
  v_v        JSONB;
  v_constructs TEXT[] := '{}';
  v_c        TEXT;
  v_opts     JSONB;
  v_ans      TEXT;
  v_emph     INT;
  v_no       INT;
BEGIN
  IF v_p IS NULL THEN
    RAISE EXCEPTION 'payload 缺少 passage' USING ERRCODE = '22023';
  END IF;

  v_pid := btrim(coalesce(v_p ->> 'passage_id', ''));
  IF v_pid = '' THEN
    RAISE EXCEPTION 'passage_id 不可為空' USING ERRCODE = '22023';
  END IF;

  -- ── 文章層級 ────────────────────────────────────────
  IF btrim(coalesce(v_p ->> 'title', '')) = '' THEN
    RAISE EXCEPTION 'title 不可為空' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(v_p ->> 'passage_text', '')) = '' THEN
    RAISE EXCEPTION 'passage_text 不可為空' USING ERRCODE = '22023';
  END IF;
  IF (v_p ->> 'content_source') IS NULL
     OR (v_p ->> 'content_source') NOT IN ('FINAL','REVISED','WRITER') THEN
    RAISE EXCEPTION 'content_source 必須是 FINAL / REVISED / WRITER（收到 %）',
      coalesce(v_p ->> 'content_source', 'null') USING ERRCODE = '22023';
  END IF;
  IF (v_p ->> 'cefr_level') IS NOT NULL
     AND (v_p ->> 'cefr_level') NOT IN ('A1','A2','B1','B2','C1','C2') THEN
    RAISE EXCEPTION 'cefr_level 不合法：%', v_p ->> 'cefr_level' USING ERRCODE = '22023';
  END IF;

  -- ── 冪等判斷 ────────────────────────────────────────
  v_hash := public.reading_canonical_hash(p_payload);
  SELECT content_hash INTO v_existing
    FROM public.reading_passages WHERE passage_id = v_pid;

  IF FOUND THEN
    IF v_existing IS NOT NULL AND v_existing = v_hash THEN
      RETURN jsonb_build_object('passage_id', v_pid, 'status', 'skipped',
                                'reason', '已經匯入過，內容完全相同');
    END IF;
    -- 🛑 內容不同一律拒絕，不看有沒有作答紀錄。
    --    有作答紀錄時更嚴重：reading_attempts 指的是題目 UUID，
    --    原地換內容之後 UUID 還在，紀錄看起來完整，但它記的已經是另一道題。
    RETURN jsonb_build_object('passage_id', v_pid, 'status', 'conflict',
      'reason', CASE WHEN EXISTS (
                  SELECT 1 FROM public.reading_attempts a
                    JOIN public.reading_questions q ON q.id = a.question_id
                   WHERE q.passage_id = v_pid)
                THEN '已存在且內容不同，而且已經有學生作答——永遠不可原地覆蓋'
                ELSE '已存在但內容不同。批次匯入不覆蓋既有文章' END);
  END IF;

  -- ── 題目層級的驗證（先全部驗完再寫）────────────────
  IF jsonb_typeof(p_payload -> 'questions') <> 'array' THEN
    RAISE EXCEPTION 'questions 必須是陣列' USING ERRCODE = '22023';
  END IF;

  FOR v_q IN SELECT * FROM jsonb_array_elements(p_payload -> 'questions') LOOP
    v_c := v_q ->> 'construct';
    IF v_c IS NULL OR v_c NOT IN ('SM','MI','SD','CO','CD','VC') THEN
      RAISE EXCEPTION 'construct 不合法：%（只能是 SM/MI/SD/CO/CD/VC）',
        coalesce(v_c, 'null') USING ERRCODE = '22023';
    END IF;
    IF v_c = ANY (v_constructs) THEN
      RAISE EXCEPTION '同一篇的 % 出現超過一題', v_c USING ERRCODE = '23505';
    END IF;
    v_constructs := v_constructs || v_c;

    IF btrim(coalesce(v_q ->> 'question', '')) = '' THEN
      RAISE EXCEPTION '% 缺題幹', v_c USING ERRCODE = '22023';
    END IF;

    v_opts := v_q -> 'options';
    IF v_opts IS NULL OR jsonb_typeof(v_opts) <> 'object' THEN
      RAISE EXCEPTION '% 的 options 必須是物件', v_c USING ERRCODE = '22023';
    END IF;
    IF btrim(coalesce(v_opts ->> 'A','')) = '' OR btrim(coalesce(v_opts ->> 'B','')) = ''
       OR btrim(coalesce(v_opts ->> 'C','')) = '' OR btrim(coalesce(v_opts ->> 'D','')) = '' THEN
      RAISE EXCEPTION '% 的四個選項必須都有文字', v_c USING ERRCODE = '22023';
    END IF;

    v_ans := v_q ->> 'correct_answer';
    IF v_ans IS NULL OR v_ans NOT IN ('A','B','C','D') THEN
      RAISE EXCEPTION '% 的正解不合法：%', v_c, coalesce(v_ans,'null') USING ERRCODE = '22023';
    END IF;
    IF btrim(coalesce(v_q ->> 'explanation', '')) = '' THEN
      RAISE EXCEPTION '% 缺解說', v_c USING ERRCODE = '22023';
    END IF;

    -- micro-skill：emphasis 只能是 0–100 或 null
    IF v_q ? 'skills' AND jsonb_typeof(v_q -> 'skills') = 'array' THEN
      FOR v_s IN SELECT * FROM jsonb_array_elements(v_q -> 'skills') LOOP
        IF btrim(coalesce(v_s ->> 'skill_code','')) = '' THEN
          RAISE EXCEPTION '% 有一個 skill 沒有代號', v_c USING ERRCODE = '22023';
        END IF;
        IF (v_s -> 'emphasis') IS NOT NULL AND jsonb_typeof(v_s -> 'emphasis') <> 'null' THEN
          v_emph := (v_s ->> 'emphasis')::int;
          IF v_emph < 0 OR v_emph > 100 THEN
            RAISE EXCEPTION '% 的 % emphasis 超出 0–100：%',
              v_c, v_s ->> 'skill_code', v_emph USING ERRCODE = '22023';
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 段落
  FOR v_pg IN SELECT * FROM jsonb_array_elements(coalesce(p_payload -> 'paragraphs','[]'::jsonb)) LOOP
    v_no := (v_pg ->> 'paragraph_no')::int;
    IF v_no IS NULL OR v_no < 1 OR v_no > 20 THEN
      RAISE EXCEPTION 'paragraph_no 不合法：%', coalesce(v_pg ->> 'paragraph_no','null')
        USING ERRCODE = '22023';
    END IF;
    IF btrim(coalesce(v_pg ->> 'description','')) = '' THEN
      RAISE EXCEPTION '第 % 段沒有描述', v_no USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 詞彙
  FOR v_v IN SELECT * FROM jsonb_array_elements(coalesce(p_payload -> 'vocabulary','[]'::jsonb)) LOOP
    IF (v_v ->> 'tier') IS NULL
       OR (v_v ->> 'tier') NOT IN ('CANDIDATE','ACADEMIC','KNOWLEDGE') THEN
      RAISE EXCEPTION 'vocab tier 不合法：%', coalesce(v_v ->> 'tier','null')
        USING ERRCODE = '22023';
    END IF;
    IF btrim(coalesce(v_v ->> 'term','')) = '' THEN
      RAISE EXCEPTION 'vocab 有一筆沒有 term' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- ── 寫入。到這裡為止全部驗過了 ──────────────────────
  -- 🛑 status 永遠寫 DRAFT。上架是另一個動作，由 trigger 把關六題完整。
  INSERT INTO public.reading_passages (
    passage_id, title, passage_text, content_source, cefr_level,
    content_family, subdomain, narrative_archetype, geography, time_period,
    fame_level, fame_rank, quality_score, readability_score, sixway_score,
    topic_quality_score, factual_risk, source_package_id, source_batch_id,
    content_hash, status, imported_by
  ) VALUES (
    v_pid, btrim(v_p ->> 'title'), v_p ->> 'passage_text',
    v_p ->> 'content_source', v_p ->> 'cefr_level',
    v_p ->> 'content_family', v_p ->> 'subdomain', v_p ->> 'narrative_archetype',
    v_p ->> 'geography', v_p ->> 'time_period', v_p ->> 'fame_level',
    (v_p ->> 'fame_rank')::smallint, (v_p ->> 'quality_score')::smallint,
    (v_p ->> 'readability_score')::smallint, (v_p ->> 'sixway_score')::smallint,
    (v_p ->> 'topic_quality_score')::smallint, v_p ->> 'factual_risk',
    v_p ->> 'source_package_id', v_p ->> 'source_batch_id',
    v_hash, 'DRAFT', auth.uid()
  );

  FOR v_q IN SELECT * FROM jsonb_array_elements(p_payload -> 'questions') LOOP
    INSERT INTO public.reading_questions (
      passage_id, construct, question, option_a, option_b, option_c, option_d, display_order
    ) VALUES (
      v_pid, v_q ->> 'construct', v_q ->> 'question',
      v_q -> 'options' ->> 'A', v_q -> 'options' ->> 'B',
      v_q -> 'options' ->> 'C', v_q -> 'options' ->> 'D',
      (v_q ->> 'display_order')::smallint
    ) RETURNING id INTO v_qid;

    -- 🛑 答案只進 reading_question_keys，不進 reading_questions。
    INSERT INTO public.reading_question_keys (question_id, correct_answer, explanation)
    VALUES (v_qid, v_q ->> 'correct_answer', v_q ->> 'explanation');

    IF v_q ? 'skills' AND jsonb_typeof(v_q -> 'skills') = 'array' THEN
      FOR v_s IN SELECT * FROM jsonb_array_elements(v_q -> 'skills') LOOP
        INSERT INTO public.reading_question_skills (question_id, skill_code, emphasis)
        VALUES (v_qid, v_s ->> 'skill_code',
                CASE WHEN jsonb_typeof(v_s -> 'emphasis') IN ('null') OR (v_s -> 'emphasis') IS NULL
                     THEN NULL ELSE (v_s ->> 'emphasis')::smallint END)
        ON CONFLICT (question_id, skill_code) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  FOR v_pg IN SELECT * FROM jsonb_array_elements(coalesce(p_payload -> 'paragraphs','[]'::jsonb)) LOOP
    INSERT INTO public.reading_passage_paragraphs (passage_id, paragraph_no, description)
    VALUES (v_pid, (v_pg ->> 'paragraph_no')::smallint, v_pg ->> 'description')
    ON CONFLICT (passage_id, paragraph_no) DO NOTHING;
  END LOOP;

  FOR v_v IN SELECT * FROM jsonb_array_elements(coalesce(p_payload -> 'vocabulary','[]'::jsonb)) LOOP
    INSERT INTO public.reading_passage_vocab (passage_id, tier, term, definition, paragraph_no)
    VALUES (v_pid, v_v ->> 'tier', v_v ->> 'term', v_v ->> 'definition',
            (v_v ->> 'paragraph_no')::smallint)
    ON CONFLICT (passage_id, tier, term) DO NOTHING;
  END LOOP;

  -- 🛑 0 題的文章【照樣匯入】：後台看得見這個缺口，總比整篇消失好。
  --    但訊息不可以把它講得像一般匯入——那一列永遠沒有用，
  --    需要回去重新產製。array_length 對空陣列回 NULL，要自己處理。
  RETURN jsonb_build_object(
    'passage_id', v_pid, 'status', 'imported',
    'reason', CASE coalesce(array_length(v_constructs, 1), 0)
                WHEN 0 THEN '⚠️ 匯入了，但一題都沒有——這篇需要重新產製'
                WHEN 6 THEN '6 題，完整'
                ELSE format('⚠️ 只有 %s 題，缺 %s',
                            array_length(v_constructs, 1),
                            array_to_string(ARRAY(
                              SELECT c FROM unnest(ARRAY['SM','MI','SD','CO','CD','VC']) c
                               WHERE c <> ALL (v_constructs)), '/'))
              END,
    'publish_ready', (public.reading_publish_readiness(v_pid) ->> 'ready')::boolean);
END;
$$;

COMMENT ON FUNCTION reading_import_one_passage IS
  '匯入一篇 canonical payload。🛑 內部函式，沒有 is_admin() 檢查——授權在 reading_import_batch()。不發任何 EXECUTE 權限。衝突一律拒絕，不自動覆蓋。';

-- 🛑 誰都不給。呼叫端是 SECURITY DEFINER，靠所有權叫得動。
REVOKE ALL ON FUNCTION reading_import_one_passage(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
-- 預期：anon 與 authenticated 都不可執行
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行",
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS "service_role可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'reading_import_one_passage';
