-- =====================================================
-- reading_passage_vocab → lexical_items 的外鍵（補件）
--
-- 🟡 【只在缺外鍵的環境執行】。
--    create_reading_passage_aux.sql 會在 lexical_items 存在時自動加上它；
--    這一支是給「當時還沒有、後來才有」的環境補上，目前是 gsat-staging。
--
-- ⚠️ 前置：lexical_items 必須已經存在。不存在會直接告訴你，不會建半套。
--
-- 冪等：已經有外鍵就什麼都不做。
--
-- 回滾：supabase/migrations/create_reading_vocab_lexical_fk.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF to_regclass('public.reading_passage_vocab') IS NULL THEN
    RAISE EXCEPTION 'reading_passage_vocab 還不存在，請先跑 create_reading_passage_aux.sql';
  END IF;
  IF to_regclass('public.lexical_items') IS NULL THEN
    RAISE EXCEPTION 'lexical_items 還不存在，這個環境還不能加這條外鍵';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'reading_passage_vocab_lexical_item_id_fkey') THEN
    RAISE NOTICE '外鍵已經存在，不用做。';
  ELSE
    ALTER TABLE reading_passage_vocab
      ADD CONSTRAINT reading_passage_vocab_lexical_item_id_fkey
      FOREIGN KEY (lexical_item_id) REFERENCES lexical_items(id) ON DELETE SET NULL;
    RAISE NOTICE '✅ 已加上 lexical_items 外鍵。';
  END IF;
END $$;

SELECT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'reading_passage_vocab_lexical_item_id_fkey') AS "外鍵存在";
