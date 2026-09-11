-- =====================================================
-- Rollback: create_writing_teacher_reviews.sql
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 update_writing_admin_queue.rollback.sql 之後執行——
--    那支查詢讀這張表。
--
-- ⚠️ 這會刪掉所有「已檢閱」的紀錄。還原之後每一篇已送出的作文都會重新
--    算成「待處理」。作文、分析、講評完全不受影響。
-- =====================================================

DROP FUNCTION IF EXISTS writing_set_teacher_reviewed(UUID, BOOLEAN);
DROP TABLE IF EXISTS writing_teacher_reviews;
