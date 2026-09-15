-- 回滾 fix_speaking_part2_cue_optional.sql
--
-- ⚠️ 如果已經匯入 cue 是空的 Part 2 題目，這份回滾會【失敗】——
--    舊的 CHECK 加不回去，因為現存的資料不符合它。那是正確的行為：
--    要先處理那些資料，才談得上回到舊的規則。

ALTER TABLE speaking_prompts DROP CONSTRAINT IF EXISTS speaking_prompts_part_shape;
ALTER TABLE speaking_prompts ADD CONSTRAINT speaking_prompts_part_shape CHECK (
  (part IN (1, 3) AND length(btrim(coalesce(question, ''))) > 0)
  OR
  (part = 2 AND length(btrim(coalesce(title, ''))) > 0
             AND length(btrim(coalesce(cue, ''))) > 0)
);
