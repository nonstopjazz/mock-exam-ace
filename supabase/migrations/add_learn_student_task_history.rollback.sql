-- =====================================================
-- 回滾：學生端的「已結束的作業」
--
-- 只移除新增的那一支 RPC。沒有任何資料變更要回滾 ——
-- 這支從頭到尾只讀不寫。
--
-- 🛑 前端要先回到沒有這個區塊的版本再跑這支，否則學生頁會出現
--    「找不到函式」的錯誤。順序：先回前端，再跑這支。
-- =====================================================

DROP FUNCTION IF EXISTS learn_student_task_history(INTEGER);


-- ── 驗證（唯讀）：應該回 0 列 ─────────────────────────
SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'learn_student_task_history';
