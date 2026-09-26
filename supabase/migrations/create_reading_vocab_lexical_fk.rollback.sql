-- 回滾 create_reading_vocab_lexical_fk.sql
ALTER TABLE reading_passage_vocab
  DROP CONSTRAINT IF EXISTS reading_passage_vocab_lexical_item_id_fkey;
