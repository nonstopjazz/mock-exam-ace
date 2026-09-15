-- 回滾 seed_speaking_prompts.sql —— 移除這批從 IELTS 匯入的題目。
--
-- 🛑 只刪【沒有人練過】的題目。
--    有練習紀錄的那些留著：speaking_recordings.prompt_id 指著它們，
--    刪掉會變成 NULL（ON DELETE SET NULL），學生回頭看自己的練習時，
--    就再也連不回原本那一題。練習當下的題目文字有快照、不會消失，
--    但「這題還在題庫裡嗎」這個連結會斷掉。
--
-- 執行後會回報刪了幾題、留了幾題。

DO $$
DECLARE v_deleted INTEGER; v_kept INTEGER;
BEGIN
  SELECT count(*) INTO v_kept
    FROM speaking_prompts p
   WHERE EXISTS (SELECT 1 FROM speaking_recordings r WHERE r.prompt_id = p.id);

  DELETE FROM speaking_prompts p
   WHERE NOT EXISTS (SELECT 1 FROM speaking_recordings r WHERE r.prompt_id = p.id);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE '已刪除 % 題；保留 % 題（有練習紀錄）', v_deleted, v_kept;
END;
$$;
