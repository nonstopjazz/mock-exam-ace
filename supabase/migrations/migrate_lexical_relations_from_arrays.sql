-- =====================================================
-- Lexical Model Phase 8：level_words.synonyms/antonyms → lexical_relations
--
-- 🟢 只要在 production 執行一次。
--    前置：create_lexical_relations.sql、migrate_level_words_to_lexical.sql
--
-- ⚠️ 【完全不動】 level_words。那兩個 text[] 欄位原樣保留，
--    所以這支隨時可以回滾重跑。
--
-- 🛑 規格：「如果找不到或有 ambiguity → 不要猜。」
--
--    只有【唯一命中】才建立關係。0 個或多個候選一律寫進
--    lexical_unresolved_relations 等人工處理。
--    猜錯的同義詞會直接變成出錯的考題 —— 同義／反義練習就是拿這個出題的。
--
-- 方向性：synonym 與 antonym 在語意上對稱，但這裡只建立
--   source → target 單向，【不自動補反向】。
--   原因：A 的 synonyms 裡有 B，不代表題庫作者也在 B 的 synonyms 裡放了 A。
--   自動補等於替原始資料做決定，超出「把既有資料搬過來」的範圍。
-- =====================================================

DO $$
DECLARE
  r_src       RECORD;
  v_raw       TEXT;
  v_norm      TEXT;
  v_target    UUID;
  v_count     INTEGER;
  v_kind      TEXT;
  v_arr       TEXT[];
  n_created   INTEGER := 0;
  n_no_match  INTEGER := 0;
  n_ambiguous INTEGER := 0;
  n_self      INTEGER := 0;
BEGIN
  IF to_regclass('public.level_words') IS NULL THEN
    RAISE NOTICE '這個環境沒有 level_words，跳過。';
    RETURN;
  END IF;

  FOR r_src IN
    SELECT i.id AS item_id, w.synonyms, w.antonyms
    FROM public.lexical_items i
    JOIN public.level_words  w ON w.id = i.legacy_level_word_id
    WHERE i.legacy_level_word_id IS NOT NULL
      AND (coalesce(array_length(w.synonyms, 1), 0) > 0
        OR coalesce(array_length(w.antonyms, 1), 0) > 0)
  LOOP
    FOREACH v_kind IN ARRAY ARRAY['synonym','antonym'] LOOP
      v_arr := CASE v_kind WHEN 'synonym' THEN r_src.synonyms ELSE r_src.antonyms END;
      CONTINUE WHEN v_arr IS NULL;

      FOREACH v_raw IN ARRAY v_arr LOOP
        CONTINUE WHEN btrim(coalesce(v_raw, '')) = '';

        v_norm := lower(regexp_replace(btrim(v_raw), '\s+', ' ', 'g'));

        -- 注意：uuid 沒有 min()，所以用 array_agg 取第一個。
        -- 只有 count = 1 時才會用到 v_target，所以取哪一個不影響結果。
        SELECT count(*), (array_agg(i.id))[1]
          INTO v_count, v_target
        FROM public.lexical_items i
        WHERE i.lemma = v_norm;

        IF v_count = 1 THEN
          IF v_target = r_src.item_id THEN
            -- 自己列自己（資料瑕疵）。不建立關係，也不算未解決。
            n_self := n_self + 1;
            CONTINUE;
          END IF;

          INSERT INTO public.lexical_relations
            (source_item_id, target_item_id, relation_type, note)
          VALUES (r_src.item_id, v_target, v_kind,
                  '由 level_words.' || v_kind || 's 匯入：' || btrim(v_raw))
          ON CONFLICT (source_item_id, target_item_id, relation_type) DO NOTHING;
          n_created := n_created + 1;

        ELSE
          INSERT INTO public.lexical_unresolved_relations
            (source_item_id, raw_target, relation_type, reason, candidate_count)
          VALUES (r_src.item_id, btrim(v_raw), v_kind,
                  CASE WHEN v_count = 0 THEN 'no_match' ELSE 'ambiguous_match' END,
                  v_count)
          ON CONFLICT (source_item_id, raw_target, relation_type) DO NOTHING;

          IF v_count = 0 THEN n_no_match  := n_no_match  + 1;
          ELSE                n_ambiguous := n_ambiguous + 1;
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE '關係匯入：建立 % 筆；未解決 no_match=% ambiguous=%；自我參照略過 % 筆',
    n_created, n_no_match, n_ambiguous, n_self;
END $$;
