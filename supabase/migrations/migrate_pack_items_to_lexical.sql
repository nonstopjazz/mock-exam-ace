-- =====================================================
-- Lexical Model Phase 7b + 3：pack_items → lexical_items + lexical_pack_items
--
-- 🟢 只要在 production 執行一次。
--    前置：create_lexical_core.sql、create_lexical_pack_items.sql、
--          migrate_level_words_to_lexical.sql（先有官方題庫才有對象可比對）
--
-- ⚠️ 【完全不動】 pack_items 與 packs。一列不刪、一欄不改。
--
-- 🛑 合併規則（規格：禁止只靠英文 display string 無條件 merge）
--
--    只有【同時】滿足這三個條件才算 exact_safe_match、才會指向既有項目：
--      1. 正規化後的 lemma 只命中【一個】候選
--      2. 兩邊都有非空的 part_of_speech
--      3. 兩邊的 part_of_speech 相同（忽略大小寫與前後空白）
--
--    只要有一項不成立 → 建立【新的】lexical_item，標記 ambiguous_match。
--    寧可多出一筆待人工確認的重複，也不要把兩個不同的字合併成一個 ——
--    合併之後熟練度會混在一起，而且合併是不可逆的。
--
--    這代表 book(n. 書) 與 book(v. 預訂) 不會被合併，
--    pack 裡沒有標詞性的字也不會被合併。兩者都是刻意的。
-- =====================================================

DO $$
DECLARE
  r_item        RECORD;
  v_lemma       TEXT;
  v_candidates  UUID[];
  v_target      UUID;
  v_method      TEXT;
  v_count       INTEGER;
  v_note        TEXT;
  v_type        TEXT;
  n_exact       INTEGER := 0;
  n_new         INTEGER := 0;
  n_ambiguous   INTEGER := 0;
  n_manual      INTEGER := 0;
  n_links       INTEGER := 0;
BEGIN
  IF to_regclass('public.pack_items') IS NULL THEN
    RAISE NOTICE '這個環境沒有 pack_items，跳過。';
    RETURN;
  END IF;

  FOR r_item IN
    SELECT pi.id, pi.pack_id, pi.word, pi.definition, pi.part_of_speech,
           pi.example_sentence, pi.phonetic, pi.sort_order,
           pi.audio_url, pi.example_audio_url
    FROM public.pack_items pi
    ORDER BY pi.pack_id, pi.sort_order, pi.id
  LOOP
    -- 已經處理過就跳過（讓這支可以重跑）
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.lexical_legacy_map m
      WHERE m.legacy_source = 'pack_item' AND m.legacy_id = r_item.id::TEXT
    );

    -- ── 資料本身有問題 ────────────────────────────────
    IF btrim(coalesce(r_item.word, '')) = '' THEN
      INSERT INTO public.lexical_legacy_map
        (legacy_source, legacy_id, lexical_item_id, match_method, candidate_count, note)
      VALUES ('pack_item', r_item.id::TEXT, NULL, 'manual_review_required', 0,
              'pack_items.word 是空字串或只有空白，沒有建立 canonical 項目');
      n_manual := n_manual + 1;
      CONTINUE;
    END IF;

    v_lemma := lower(regexp_replace(btrim(r_item.word), '\s+', ' ', 'g'));
    v_type  := CASE WHEN btrim(r_item.word) LIKE '% %' THEN 'phrase' ELSE 'word' END;

    -- ── 找候選 ───────────────────────────────────────
    SELECT array_agg(i.id), count(*)
      INTO v_candidates, v_count
    FROM public.lexical_items i
    WHERE i.lemma = v_lemma;

    v_count := coalesce(v_count, 0);

    IF v_count = 1
       AND btrim(coalesce(r_item.part_of_speech, '')) <> ''
       AND EXISTS (
         SELECT 1 FROM public.lexical_items i
         WHERE i.id = v_candidates[1]
           AND lower(btrim(coalesce(i.part_of_speech, ''))) = lower(btrim(r_item.part_of_speech))
       )
    THEN
      -- 唯一候選 ＋ 兩邊詞性都有且相同 → 可以安全確認是同一個字
      v_target := v_candidates[1];
      v_method := 'exact_safe_match';
      v_note   := 'lemma 唯一命中且詞性相符：' || r_item.part_of_speech;
      n_exact  := n_exact + 1;

    ELSIF v_count = 0 THEN
      v_method := 'new_item_created';
      v_note   := '題庫中沒有相同 lemma，建立新的 canonical 項目';
      n_new    := n_new + 1;

    ELSE
      -- 有候選但無法安全確認（多個候選，或詞性缺失／不符）→ 不合併
      v_method := 'ambiguous_match';
      v_note   := format('lemma 命中 %s 個候選，但%s，未合併，另建新項目待人工確認',
                    v_count,
                    CASE WHEN btrim(coalesce(r_item.part_of_speech,'')) = ''
                         THEN 'pack 這一筆沒有詞性'
                         ELSE '詞性不符或候選不只一個' END);
      n_ambiguous := n_ambiguous + 1;
    END IF;

    -- ── 需要建立新項目的情況 ──────────────────────────
    IF v_method IN ('new_item_created', 'ambiguous_match') THEN
      INSERT INTO public.lexical_items (
        item_type, display_form, lemma,
        translation, part_of_speech, ipa, example,
        audio_url, example_audio_url
      ) VALUES (
        v_type, btrim(r_item.word), v_lemma,
        r_item.definition, r_item.part_of_speech, r_item.phonetic, r_item.example_sentence,
        r_item.audio_url, r_item.example_audio_url
      )
      RETURNING id INTO v_target;
    END IF;

    INSERT INTO public.lexical_legacy_map
      (legacy_source, legacy_id, lexical_item_id, match_method, candidate_count, note)
    VALUES ('pack_item', r_item.id::TEXT, v_target, v_method, v_count, v_note);

    -- ── Phase 3：掛進 collection ─────────────────────
    INSERT INTO public.lexical_pack_items (pack_id, lexical_item_id, sort_order)
    VALUES (r_item.pack_id, v_target, coalesce(r_item.sort_order, 0))
    ON CONFLICT (pack_id, lexical_item_id) DO NOTHING;

    n_links := n_links + 1;
  END LOOP;

  RAISE NOTICE 'pack_items → lexical：exact_safe_match=% new_item_created=% ambiguous_match=% manual_review_required=% ；建立 pack 連結 % 筆',
    n_exact, n_new, n_ambiguous, n_manual, n_links;
END $$;


-- 驗證：每一列 pack_items 都要有一筆對照
DO $$
DECLARE v_missing INTEGER;
BEGIN
  IF to_regclass('public.pack_items') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_missing
  FROM public.pack_items pi
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lexical_legacy_map m
    WHERE m.legacy_source = 'pack_item' AND m.legacy_id = pi.id::TEXT
  );

  IF v_missing > 0 THEN
    RAISE EXCEPTION '% 列 pack_items 沒有對照，migration 不完整', v_missing;
  END IF;
  RAISE NOTICE '驗證通過：pack_items 全部都有對照。';
END $$;
