-- =====================================================
-- 回滾 create_reading_passage_aux.sql —— 段落與詞彙
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 🛑 回滾順序與建立相反。這八支互相有 FK 與相依，
--    由後往前跑：submit → fetch → trigger → guard → sessions
--                → aux → questions → passages
--
-- ⚠️ 會刪掉資料表的那幾支【連同裡面的資料一起消失】。
--    題庫可以從來源 xlsx 重新匯入；學生的作答紀錄不行。
--    reading_attempts 若已經有資料，回滾前先備份：
--      CREATE TABLE reading_attempts_backup AS SELECT * FROM reading_attempts;
-- =====================================================

DROP TABLE IF EXISTS reading_passage_vocab;
DROP TABLE IF EXISTS reading_passage_paragraphs;

-- 驗證：相關物件應該歸零
SELECT count(*)::int AS "剩下的 reading 物件"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname LIKE 'reading\_%' AND c.relkind='r';
