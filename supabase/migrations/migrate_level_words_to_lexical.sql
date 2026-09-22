-- =====================================================
-- Lexical Model Phase 7a：level_words → lexical_items
--
-- 🟢 只要在 production 執行一次。前置：create_lexical_core.sql
--
-- ⚠️ 【完全不動】 level_words。一列不刪、一欄不改。
--    這支只往 lexical_items 與 lexical_legacy_map 寫入。
--
-- 可以重複執行：靠 legacy_level_word_id 的 UNIQUE 與 ON CONFLICT DO NOTHING，
-- 第二次跑不會產生第二份。
--
-- item_type 判定
--   level_words 沒有「這是不是片語」的旗標，全部混在一起。
--   唯一可靠的訊號是 display_form 裡有沒有空白：
--     含空白 → phrase（全庫 27 筆，如 artificial intelligence、used to）
--     否則   → word
--   collocation / pattern / expression 這次【不自動判定】——
--   分不出 collocation 與 phrase 需要語言學判斷，猜錯會汙染 canonical 資料。
--   之後由老師在後台改 item_type，或另寫一支有明確規則的 migration。
-- =====================================================

DO $$
DECLARE
  v_before  INTEGER;
  v_after   INTEGER;
  v_mapped  INTEGER;
  v_skipped INTEGER;
BEGIN
  IF to_regclass('public.level_words') IS NULL THEN
    RAISE NOTICE '這個環境沒有 level_words，跳過。';
    RETURN;
  END IF;

  SELECT count(*) INTO v_before FROM public.lexical_items;

  -- ── 1. 建立 canonical 項目 ──────────────────────────
  INSERT INTO public.lexical_items (
    item_type, display_form, lemma,
    translation, part_of_speech, ipa, example, example_translation,
    difficulty, extra_notes, audio_url, example_audio_url,
    level, category, tags,
    legacy_level_word_id
  )
  SELECT
    CASE WHEN btrim(w.word) LIKE '% %' THEN 'phrase' ELSE 'word' END,
    btrim(w.word),
    -- lemma：小寫 + 收斂連續空白。比對用，不顯示。
    lower(regexp_replace(btrim(w.word), '\s+', ' ', 'g')),
    w.translation, w.part_of_speech, w.ipa, w.example, w.example_translation,
    w.difficulty, w.extra_notes, w.audio_url, w.example_audio_url,
    w.level::SMALLINT, w.category, coalesce(w.tags, '{}'),
    w.id
  FROM public.level_words w
  WHERE btrim(coalesce(w.word, '')) <> ''
  ON CONFLICT (legacy_level_word_id) DO NOTHING;

  SELECT count(*) INTO v_after FROM public.lexical_items;

  -- ── 2. 寫 legacy 對照（同時就是 migration report）────
  --
  -- level_words.id 是 canonical 來源的主鍵，一對一對應，
  -- 所以這一批全部是 exact_safe_match —— 不需要任何字串比對猜測。
  INSERT INTO public.lexical_legacy_map (
    legacy_source, legacy_id, lexical_item_id, match_method, candidate_count, note
  )
  SELECT 'level_word', i.legacy_level_word_id, i.id, 'exact_safe_match', 1,
         '由 level_words.id 直接對應，無字串比對'
  FROM public.lexical_items i
  WHERE i.legacy_level_word_id IS NOT NULL
  ON CONFLICT (legacy_source, legacy_id) DO NOTHING;

  -- ── 3. 資料本身有問題的列 ───────────────────────────
  INSERT INTO public.lexical_legacy_map (
    legacy_source, legacy_id, lexical_item_id, match_method, candidate_count, note
  )
  SELECT 'level_word', w.id, NULL, 'manual_review_required', 0,
         'level_words.word 是空字串或只有空白，沒有建立 canonical 項目'
  FROM public.level_words w
  WHERE btrim(coalesce(w.word, '')) = ''
  ON CONFLICT (legacy_source, legacy_id) DO NOTHING;

  SELECT count(*) INTO v_mapped
    FROM public.lexical_legacy_map WHERE legacy_source = 'level_word' AND lexical_item_id IS NOT NULL;
  SELECT count(*) INTO v_skipped
    FROM public.lexical_legacy_map WHERE legacy_source = 'level_word' AND lexical_item_id IS NULL;

  RAISE NOTICE 'level_words → lexical_items：新建 % 筆（總數 % → %），對應 % 筆，需人工處理 % 筆',
    v_after - v_before, v_before, v_after, v_mapped, v_skipped;
END $$;


-- 驗證：每一列 level_words 都要有一筆對照（不論成功或列為待處理）
DO $$
DECLARE v_missing INTEGER;
BEGIN
  IF to_regclass('public.level_words') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_missing
  FROM public.level_words w
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lexical_legacy_map m
    WHERE m.legacy_source = 'level_word' AND m.legacy_id = w.id
  );

  IF v_missing > 0 THEN
    RAISE EXCEPTION '% 列 level_words 沒有對照，migration 不完整', v_missing;
  END IF;
  RAISE NOTICE '驗證通過：level_words 全部都有對照。';
END $$;
