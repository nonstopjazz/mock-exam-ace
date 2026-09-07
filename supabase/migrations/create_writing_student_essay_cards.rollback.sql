-- =====================================================
-- Rollback: create_writing_student_essay_cards.sql
--
-- 這份 migration 只新增一支唯讀函式，沒有建表、沒有改表、沒有動 RLS，
-- 因此回滾就是把函式移除，資料完全不受影響。
--
-- ⚠️ 回滾後前端的「我的作文」卡片列表會拿到 PGRST202（找不到函式）。
--    若要保留頁面可用，請先把前端退回舊版的 useEssayList() 查詢再執行本檔。
-- =====================================================

DROP FUNCTION IF EXISTS public.writing_student_essay_cards();
