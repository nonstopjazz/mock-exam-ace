-- =====================================================
-- 主題學習包 —— 第一期：管理端 RPC
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_learning_packs_1_tables.sql 之後執行。
--
-- 回滾：supabase/migrations/create_learning_packs_2_admin.rollback.sql
--
-- 兩張表的 RLS 不給 authenticated 任何權限，所以後台一律走這裡。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 發布前要檢查什麼
-- ══════════════════════════════════════════════════════════════
--
--   規格：「未完成題型不能在後台顯示為可用」「完成條件要可驗證」。
--   所以 learning_pack_readiness() 檢查的是【這個包能不能真的被做完】，
--   不是只檢查欄位有沒有填：
--
--     · 至少要有一個單元        —— 空的包發布出去，學生打開是空白
--     · 閱讀單元的文章要有題目  —— 沒有題目就沒有「完成」可言
--     · 單字單元的單字集不能是空的
--     · target_count 不可以超過來源實際有的數量
--       （規格四.3：要提示可用數量與原因，不可悄悄混入範圍外內容）
--
--   這一支同時給三個地方用：清單上的狀態、編輯頁的提示、發布的閘門。
--   三個地方共用一份定義，才不會出現「清單說可以發布、按下去卻被擋」。
-- =====================================================

-- =====================================================
-- 發布就緒檢查
-- =====================================================
/**
 * 回傳這個學習包還缺什麼。空陣列 = 可以發布。
 *
 * 內部函式：不給任何角色 EXECUTE，由下面幾支 SECURITY DEFINER 呼叫。
 */
CREATE OR REPLACE FUNCTION learning_pack_readiness(p_pack_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_problems JSONB := '[]'::jsonb;
  v_units    INTEGER;
  r          RECORD;
  v_avail    INTEGER;
BEGIN
  SELECT count(*) INTO v_units
    FROM public.learning_pack_units u WHERE u.pack_id = p_pack_id;

  IF v_units = 0 THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'code', 'NO_UNITS',
      'message', '這個學習包還沒有任何單元'));
  END IF;

  FOR r IN
    SELECT u.id, u.title, u.sort_order, u.activity_type,
           u.reading_passage_id, u.vocab_pack_id, u.vocab_mode, u.target_count
      FROM public.learning_pack_units u
     WHERE u.pack_id = p_pack_id
     ORDER BY u.sort_order, u.id
  LOOP
    IF r.activity_type = 'reading' THEN
      SELECT count(*) INTO v_avail
        FROM public.reading_questions q
       WHERE q.passage_id = r.reading_passage_id;

      IF v_avail = 0 THEN
        v_problems := v_problems || jsonb_build_object(
          'code', 'READING_NO_QUESTIONS',
          'unit_id', r.id, 'unit_title', r.title,
          'message', format('「%s」引用的文章還沒有任何題目', r.title));
      END IF;

    ELSE
      SELECT count(*) INTO v_avail
        FROM public.pack_items pi WHERE pi.pack_id = r.vocab_pack_id;

      IF v_avail = 0 THEN
        v_problems := v_problems || jsonb_build_object(
          'code', 'VOCAB_EMPTY',
          'unit_id', r.id, 'unit_title', r.title,
          'message', format('「%s」引用的單字集是空的', r.title));
      END IF;
    END IF;

    -- 🛑 分母不可以超過來源實際有的數量。
    --    超過的話這個單元【永遠完成不了】，而學生會一直看到未完成。
    IF r.target_count IS NOT NULL AND v_avail > 0 AND r.target_count > v_avail THEN
      v_problems := v_problems || jsonb_build_object(
        'code', 'TARGET_EXCEEDS_SOURCE',
        'unit_id', r.id, 'unit_title', r.title,
        'available', v_avail, 'target', r.target_count,
        'message', format('「%s」設定要完成 %s 個，但來源只有 %s 個 —— 這個單元會永遠完成不了',
                          r.title, r.target_count, v_avail));
    END IF;
  END LOOP;

  RETURN v_problems;
END;
$$;

COMMENT ON FUNCTION learning_pack_readiness IS
  '學習包還缺什麼才能發布。空陣列 = 可以發布。檢查的是「能不能真的被做完」而不是欄位有沒有填：空的包、沒有題目的文章、空的單字集、以及 target_count 超過來源數量（那會讓單元永遠完成不了）。清單、編輯頁、發布閘門共用這一份定義。';

REVOKE ALL ON FUNCTION learning_pack_readiness(UUID) FROM PUBLIC, anon, authenticated, service_role;


-- =====================================================
-- 清單
-- =====================================================
CREATE OR REPLACE FUNCTION learning_pack_admin_list()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_list');

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT p.id, p.slug, p.title, p.summary, p.cover_path,
               p.grade, p.textbook_version, p.status,
               p.open_at, p.close_at, p.created_at, p.updated_at,
               (SELECT count(*)::int FROM public.learning_pack_units u
                 WHERE u.pack_id = p.id)                        AS unit_count,
               public.learning_pack_readiness(p.id)             AS problems
          FROM public.learning_packs p
      ) x
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION learning_pack_admin_list IS
  '後台的學習包清單，含單元數與發布就緒問題。僅限管理員。';

REVOKE ALL ON FUNCTION learning_pack_admin_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_list() TO authenticated, service_role;


-- =====================================================
-- 單一學習包 + 單元
-- =====================================================
/**
 * 單元會帶上【來源的現況】：標題、可用數量。
 *
 * 🛑 可用數量要在這裡算，不是讓前端自己去查。
 *    前端分別查的話，畫面上的「可用 20 個」與發布檢查用的數字會有機會不一致，
 *    而那種不一致只有在發布被擋下來的那一刻才會發現。
 */
CREATE OR REPLACE FUNCTION learning_pack_admin_get(p_pack_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pack JSONB;
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_get');

  SELECT row_to_json(p)::jsonb INTO v_pack
    FROM public.learning_packs p WHERE p.id = p_pack_id;

  IF v_pack IS NULL THEN
    RAISE EXCEPTION '找不到這個學習包' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_pack || jsonb_build_object(
    'problems', public.learning_pack_readiness(p_pack_id),
    'units', coalesce((
      SELECT jsonb_agg(row_to_json(y)::jsonb ORDER BY y.sort_order, y.id)
        FROM (
          SELECT u.id, u.sort_order, u.title, u.activity_type,
                 u.reading_passage_id, u.vocab_pack_id,
                 u.vocab_mode, u.task_kind, u.target_count,
                 CASE WHEN u.activity_type = 'reading'
                      THEN (SELECT rp.title FROM public.reading_passages rp
                             WHERE rp.passage_id = u.reading_passage_id)
                      ELSE (SELECT pk.title FROM public.packs pk
                             WHERE pk.id = u.vocab_pack_id)
                 END AS source_title,
                 -- 來源實際有多少可用內容
                 CASE WHEN u.activity_type = 'reading'
                      THEN (SELECT count(*)::int FROM public.reading_questions q
                             WHERE q.passage_id = u.reading_passage_id)
                      ELSE (SELECT count(*)::int FROM public.pack_items pi
                             WHERE pi.pack_id = u.vocab_pack_id)
                 END AS source_available
            FROM public.learning_pack_units u
           WHERE u.pack_id = p_pack_id
        ) y
    ), '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION learning_pack_admin_get IS
  '單一學習包與它的單元。單元帶上來源標題與【可用數量】—— 可用數量在這裡算而不是讓前端自己查，否則畫面上的數字與發布檢查用的會有機會不一致。僅限管理員。';

REVOKE ALL ON FUNCTION learning_pack_admin_get(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_get(UUID) TO authenticated, service_role;


-- =====================================================
-- 建立／更新學習包
-- =====================================================
/**
 * p_pack_id 為 NULL = 新建。
 *
 * 🛑 所有欄位參數都用「NULL 代表不改」的語意，【除了】新建的時候。
 *    這樣前端只送改動的欄位就好，不必先讀一次再整包寫回去 ——
 *    後者在兩個分頁同時編輯時會互相覆蓋。
 *
 * 🛑 但「NULL = 不改」會讓【清空】變得做不到：填過的預計時間、開放時間
 *    再也拿不掉。文字欄位還可以送空字串，INTEGER 與 TIMESTAMPTZ 不行。
 *    所以要清空的欄位用 p_clear 點名，而不是另外開一堆 p_clear_xxx 布林值。
 *    欄位名會對白名單驗證 —— 不驗的話這個參數就是一個可以寫任何欄位的洞。
 */
CREATE OR REPLACE FUNCTION learning_pack_admin_upsert(
  p_pack_id           UUID    DEFAULT NULL,
  p_slug              TEXT    DEFAULT NULL,
  p_title             TEXT    DEFAULT NULL,
  p_summary           TEXT    DEFAULT NULL,
  p_cover_path        TEXT    DEFAULT NULL,
  p_grade             TEXT    DEFAULT NULL,
  p_textbook_version  TEXT    DEFAULT NULL,
  p_textbook_volume   TEXT    DEFAULT NULL,
  p_textbook_lessons  TEXT    DEFAULT NULL,
  p_scope_note        TEXT    DEFAULT NULL,
  p_goals             JSONB   DEFAULT NULL,
  p_estimated_minutes INTEGER DEFAULT NULL,
  p_open_at           TIMESTAMPTZ DEFAULT NULL,
  p_close_at          TIMESTAMPTZ DEFAULT NULL,
  p_clear             TEXT[]  DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    UUID;
  v_clear TEXT[] := coalesce(p_clear, '{}'::text[]);
  v_bad   TEXT;
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_upsert');

  -- 只有可為 NULL 的欄位清得掉。slug / title / summary / goals 是 NOT NULL，
  -- 放進來只會換成一個看不懂的 not-null violation。
  SELECT x INTO v_bad
    FROM unnest(v_clear) AS x
   WHERE x NOT IN ('cover_path', 'grade', 'textbook_version', 'textbook_volume',
                   'textbook_lessons', 'scope_note', 'estimated_minutes',
                   'open_at', 'close_at')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '% 不是可以清空的欄位', v_bad USING ERRCODE = '22023';
  END IF;

  IF p_pack_id IS NULL THEN
    IF coalesce(btrim(p_slug), '') = '' OR coalesce(btrim(p_title), '') = '' THEN
      RAISE EXCEPTION '新建學習包時 slug 與標題必填' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.learning_packs (
      slug, title, summary, cover_path, grade,
      textbook_version, textbook_volume, textbook_lessons, scope_note,
      goals, estimated_minutes, open_at, close_at, created_by)
    VALUES (
      btrim(p_slug), btrim(p_title), coalesce(p_summary, ''), p_cover_path, p_grade,
      p_textbook_version, p_textbook_volume, p_textbook_lessons, p_scope_note,
      coalesce(p_goals, '[]'::jsonb), p_estimated_minutes, p_open_at, p_close_at,
      auth.uid())
    RETURNING id INTO v_id;

  ELSE
    UPDATE public.learning_packs SET
      slug              = coalesce(btrim(p_slug), slug),
      title             = coalesce(btrim(p_title), title),
      summary           = coalesce(p_summary, summary),
      cover_path        = CASE WHEN 'cover_path'        = ANY(v_clear) THEN NULL ELSE coalesce(p_cover_path, cover_path) END,
      grade             = CASE WHEN 'grade'             = ANY(v_clear) THEN NULL ELSE coalesce(p_grade, grade) END,
      textbook_version  = CASE WHEN 'textbook_version'  = ANY(v_clear) THEN NULL ELSE coalesce(p_textbook_version, textbook_version) END,
      textbook_volume   = CASE WHEN 'textbook_volume'   = ANY(v_clear) THEN NULL ELSE coalesce(p_textbook_volume, textbook_volume) END,
      textbook_lessons  = CASE WHEN 'textbook_lessons'  = ANY(v_clear) THEN NULL ELSE coalesce(p_textbook_lessons, textbook_lessons) END,
      scope_note        = CASE WHEN 'scope_note'        = ANY(v_clear) THEN NULL ELSE coalesce(p_scope_note, scope_note) END,
      goals             = coalesce(p_goals, goals),
      estimated_minutes = CASE WHEN 'estimated_minutes' = ANY(v_clear) THEN NULL ELSE coalesce(p_estimated_minutes, estimated_minutes) END,
      open_at           = CASE WHEN 'open_at'           = ANY(v_clear) THEN NULL ELSE coalesce(p_open_at, open_at) END,
      close_at          = CASE WHEN 'close_at'          = ANY(v_clear) THEN NULL ELSE coalesce(p_close_at, close_at) END
     WHERE id = p_pack_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION '找不到這個學習包' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN public.learning_pack_admin_get(v_id);
END;
$$;

COMMENT ON FUNCTION learning_pack_admin_upsert IS
  '建立或更新學習包。p_pack_id 為 NULL = 新建。更新時 NULL 代表「不改這一欄」，所以前端只送改動的欄位 —— 整包寫回去的話，兩個分頁同時編輯會互相覆蓋。🛑 正因為如此，清空要用 p_clear 點名欄位（對白名單驗證），否則填過的預計時間與開放時間拿不掉。僅限管理員。';

REVOKE ALL ON FUNCTION learning_pack_admin_upsert(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_upsert(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated, service_role;


-- =====================================================
-- 建立／更新單元
-- =====================================================
/**
 * 🛑 同反義字 + 單字集的組合在這裡先擋，給一個看得懂的訊息。
 *
 *    資料表有 CHECK 擋著，但那會丟出
 *    「violates check constraint "lpu_no_synonym_antonym_from_pack"」——
 *    管理員看到那個字串不會知道發生什麼事，更不會知道為什麼。
 */
CREATE OR REPLACE FUNCTION learning_pack_admin_unit_upsert(
  p_pack_id            UUID,
  p_unit_id            UUID    DEFAULT NULL,
  p_title              TEXT    DEFAULT NULL,
  p_activity_type      TEXT    DEFAULT NULL,
  p_reading_passage_id TEXT    DEFAULT NULL,
  p_vocab_pack_id      UUID    DEFAULT NULL,
  p_vocab_mode         TEXT    DEFAULT NULL,
  p_task_kind          TEXT    DEFAULT NULL,
  p_target_count       INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    UUID;
  v_next  INTEGER;
  v_avail INTEGER;
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_unit_upsert');

  IF NOT EXISTS (SELECT 1 FROM public.learning_packs WHERE id = p_pack_id) THEN
    RAISE EXCEPTION '找不到這個學習包' USING ERRCODE = 'P0002';
  END IF;

  IF p_vocab_mode = 'synonym_antonym' THEN
    RAISE EXCEPTION
      '單字集沒有同義／反義字資料（pack_items 沒有這兩個欄位），所以這個模式出不了題。請改用其他模式。'
      USING ERRCODE = '22023';
  END IF;

  -- 來源要真的存在。FK 會擋，但訊息同樣看不懂。
  IF p_activity_type = 'reading' AND p_reading_passage_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.reading_passages
                      WHERE passage_id = p_reading_passage_id) THEN
    RAISE EXCEPTION '找不到這篇閱讀文章' USING ERRCODE = 'P0002';
  END IF;
  IF p_activity_type = 'vocab' AND p_vocab_pack_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.packs WHERE id = p_vocab_pack_id) THEN
    RAISE EXCEPTION '找不到這個單字集' USING ERRCODE = 'P0002';
  END IF;

  IF p_unit_id IS NULL THEN
    IF coalesce(btrim(p_title), '') = '' OR p_activity_type IS NULL
       OR p_task_kind IS NULL THEN
      RAISE EXCEPTION '新建單元時標題、活動類型與任務型態必填' USING ERRCODE = '22023';
    END IF;

    -- 接在最後。不讓前端決定 sort_order，避免兩個人同時新增撞號。
    SELECT coalesce(max(sort_order), -1) + 1 INTO v_next
      FROM public.learning_pack_units WHERE pack_id = p_pack_id;

    INSERT INTO public.learning_pack_units (
      pack_id, sort_order, title, activity_type,
      reading_passage_id, vocab_pack_id, vocab_mode, task_kind, target_count)
    VALUES (
      p_pack_id, v_next, btrim(p_title), p_activity_type,
      p_reading_passage_id, p_vocab_pack_id, p_vocab_mode, p_task_kind, p_target_count)
    RETURNING id INTO v_id;

  ELSE
    UPDATE public.learning_pack_units SET
      title              = coalesce(btrim(p_title), title),
      activity_type      = coalesce(p_activity_type, activity_type),
      reading_passage_id = CASE WHEN p_activity_type = 'vocab' THEN NULL
                                ELSE coalesce(p_reading_passage_id, reading_passage_id) END,
      vocab_pack_id      = CASE WHEN p_activity_type = 'reading' THEN NULL
                                ELSE coalesce(p_vocab_pack_id, vocab_pack_id) END,
      vocab_mode         = CASE WHEN p_activity_type = 'reading' THEN NULL
                                ELSE coalesce(p_vocab_mode, vocab_mode) END,
      task_kind          = coalesce(p_task_kind, task_kind),
      target_count       = p_target_count   -- 🛑 這一欄 NULL 是有意義的值（= 全部），不能 coalesce
     WHERE id = p_unit_id AND pack_id = p_pack_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION '找不到這個單元' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 分母超過來源數量時當場講出來。存得進去（readiness 會擋發布），
  -- 但管理員應該在按下去的當下就知道，而不是發布時才發現。
  IF p_target_count IS NOT NULL THEN
    SELECT CASE WHEN p_activity_type = 'reading'
                THEN (SELECT count(*) FROM public.reading_questions
                       WHERE passage_id = p_reading_passage_id)
                ELSE (SELECT count(*) FROM public.pack_items
                       WHERE pack_id = p_vocab_pack_id) END
      INTO v_avail;
    IF v_avail IS NOT NULL AND p_target_count > v_avail THEN
      RAISE WARNING '設定要完成 % 個，但來源只有 % 個', p_target_count, v_avail;
    END IF;
  END IF;

  RETURN public.learning_pack_admin_get(p_pack_id);
END;
$$;

COMMENT ON FUNCTION learning_pack_admin_unit_upsert IS
  '建立或更新單元。🛑 同反義字 + 單字集的組合在這裡先擋並給看得懂的訊息（資料表的 CHECK 也擋，但那個錯誤字串管理員看不懂）。sort_order 由後端決定，避免兩人同時新增撞號。target_count 的 NULL 是有意義的值（= 全部），所以不 coalesce。僅限管理員。';

REVOKE ALL ON FUNCTION learning_pack_admin_unit_upsert(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_unit_upsert(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;


-- =====================================================
-- 刪除單元
-- =====================================================
CREATE OR REPLACE FUNCTION learning_pack_admin_unit_delete(p_unit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_pack UUID;
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_unit_delete');

  DELETE FROM public.learning_pack_units WHERE id = p_unit_id
  RETURNING pack_id INTO v_pack;

  IF v_pack IS NULL THEN
    RAISE EXCEPTION '找不到這個單元' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.learning_pack_admin_get(v_pack);
END;
$$;

REVOKE ALL ON FUNCTION learning_pack_admin_unit_delete(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_unit_delete(UUID) TO authenticated, service_role;


-- =====================================================
-- 重新排序
-- =====================================================
/**
 * 一次送整份順序，而不是「把第 3 個往上移」。
 *
 * 🛑 整份送才有辦法驗證完整性：少一個或多一個都代表前端的狀態與資料庫
 *    不同步（例如另一個分頁剛刪掉一個單元），這時候照著做會把順序弄亂，
 *    而且沒有人會發現。
 */
CREATE OR REPLACE FUNCTION learning_pack_admin_reorder(
  p_pack_id  UUID,
  p_unit_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected INTEGER;
  v_given    INTEGER := coalesce(array_length(p_unit_ids, 1), 0);
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_reorder');

  SELECT count(*) INTO v_expected
    FROM public.learning_pack_units WHERE pack_id = p_pack_id;

  IF v_given <> v_expected THEN
    RAISE EXCEPTION '順序清單有 % 個，但這個學習包有 % 個單元 —— 畫面可能不是最新的，請重新整理',
      v_given, v_expected USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_unit_ids) AS g(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.learning_pack_units u
                        WHERE u.id = g.id AND u.pack_id = p_pack_id)
  ) THEN
    RAISE EXCEPTION '順序清單裡有不屬於這個學習包的單元' USING ERRCODE = '22023';
  END IF;

  UPDATE public.learning_pack_units u
     SET sort_order = g.ord - 1
    FROM unnest(p_unit_ids) WITH ORDINALITY AS g(id, ord)
   WHERE u.id = g.id AND u.pack_id = p_pack_id;

  RETURN public.learning_pack_admin_get(p_pack_id);
END;
$$;

COMMENT ON FUNCTION learning_pack_admin_reorder IS
  '一次送整份單元順序。🛑 整份送才驗證得了完整性：少一個或多一個代表前端狀態與資料庫不同步（例如另一個分頁剛刪了一個），照著做會把順序弄亂而且沒有人會發現。僅限管理員。';

REVOKE ALL ON FUNCTION learning_pack_admin_reorder(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_reorder(UUID, UUID[]) TO authenticated, service_role;


-- =====================================================
-- 發布／下架
-- =====================================================
CREATE OR REPLACE FUNCTION learning_pack_admin_set_status(
  p_pack_id UUID,
  p_status  TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_problems JSONB;
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_set_status');

  IF p_status NOT IN ('DRAFT', 'PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION '狀態只能是 DRAFT / PUBLISHED / ARCHIVED' USING ERRCODE = '22023';
  END IF;

  -- 🛑 只有【發布】要檢查。下架與退回草稿永遠要做得到 ——
  --    一個已經發布但內容有問題的包，不可以因為檢查不過就下不了架。
  IF p_status = 'PUBLISHED' THEN
    v_problems := public.learning_pack_readiness(p_pack_id);
    IF jsonb_array_length(v_problems) > 0 THEN
      RAISE EXCEPTION '還不能發布：%',
        (SELECT string_agg(x ->> 'message', '；')
           FROM jsonb_array_elements(v_problems) x)
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.learning_packs SET status = p_status WHERE id = p_pack_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這個學習包' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.learning_pack_admin_get(p_pack_id);
END;
$$;

COMMENT ON FUNCTION learning_pack_admin_set_status IS
  '發布／退回草稿／下架。🛑 只有發布會檢查就緒狀態 —— 一個已發布但內容有問題的包，不可以因為檢查不過就下不了架。僅限管理員。';

REVOKE ALL ON FUNCTION learning_pack_admin_set_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_set_status(UUID, TEXT) TO authenticated, service_role;


-- =====================================================
-- 可選的教材來源
-- =====================================================
/**
 * 組裝單元時的下拉選單。
 *
 * 🛑 帶上【可用數量】，而且空的來源也要列出來（標示數量 0），不是濾掉。
 *    濾掉的話，老師會找不到他剛建立的單字集，然後以為系統壞了 ——
 *    而真正的原因是那個單字集還沒加字。
 */
CREATE OR REPLACE FUNCTION learning_pack_admin_sources()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.learn_require_admin('learning_pack_admin_sources');

  RETURN jsonb_build_object(
    'passages', coalesce((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.title)
        FROM (
          SELECT rp.passage_id, rp.title, rp.cefr_level,
                 (SELECT count(*)::int FROM public.reading_questions q
                   WHERE q.passage_id = rp.passage_id) AS question_count
            FROM public.reading_passages rp
        ) x
    ), '[]'::jsonb),
    'vocab_packs', coalesce((
      SELECT jsonb_agg(row_to_json(y)::jsonb ORDER BY y.title)
        FROM (
          SELECT pk.id, pk.title,
                 (SELECT count(*)::int FROM public.pack_items pi
                   WHERE pi.pack_id = pk.id) AS item_count
            FROM public.packs pk
        ) y
    ), '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION learning_pack_admin_sources IS
  '組裝單元時的教材下拉選單，帶可用數量。🛑 空的來源也列出來（數量 0）不是濾掉 —— 濾掉的話老師會找不到他剛建立的單字集，然後以為系統壞了。僅限管理員。';

REVOKE ALL ON FUNCTION learning_pack_admin_sources() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learning_pack_admin_sources() TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname                                                AS "函式",
       count(*) OVER (PARTITION BY p.proname)                   AS "幾個版本",
       p.prosecdef                                              AS "SECURITY_DEFINER",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'learning_pack%'
 ORDER BY 1;
-- 預期：8 列。learning_pack_readiness 的「登入者可執行」是 false（內部函式），
--       其餘 7 支是 true。全部 anon=false。
