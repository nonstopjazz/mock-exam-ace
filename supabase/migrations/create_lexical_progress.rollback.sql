-- =====================================================
-- 回滾 create_lexical_progress.sql
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 會刪掉 student_lexical_mastery 與 lexical_attempts 的所有資料。
--
-- 🛑 這是本批唯一會【遺失無法重建資料】的回滾：
--    lexical_attempts 是原生新資料（每一次作答的細節），舊表沒有這些東西，
--    刪掉就真的沒有了。student_lexical_mastery 累積的熟練度同樣會消失 ——
--    舊表 user_word_progress 完全沒有被動過、仍然完整，但【沒有】任何一支
--    migration 會把它匯入新表（產品決策：不做 backfill，新表從 0 開始），
--    所以不要把它當成可以還原 mastery 的備份。
--
--    要保留 attempt 證據的話，回滾前先備份：
--      CREATE TABLE lexical_attempts_backup AS SELECT * FROM lexical_attempts;
--
-- 🛑 必須先回滾 create_lexical_rpcs.sql（函式依賴這兩張表）。
-- =====================================================

DROP POLICY IF EXISTS lexical_attempts_own_read        ON lexical_attempts;
DROP POLICY IF EXISTS student_lexical_mastery_own_read ON student_lexical_mastery;

DROP TRIGGER IF EXISTS trg_student_lexical_mastery_touch ON student_lexical_mastery;

DROP TABLE IF EXISTS lexical_attempts;
DROP TABLE IF EXISTS student_lexical_mastery;
