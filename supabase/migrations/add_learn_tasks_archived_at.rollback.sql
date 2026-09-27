-- 回滾 add_learn_tasks_archived_at.sql
--
-- 🛑 先把 class_detail 還原成單參數版本（重新執行 create_learn_classes_tasks.sql
--    裡的那一段），否則班級頁會整個打不開。只 DROP 不重建 = 班級頁壞掉。
DROP FUNCTION IF EXISTS learn_admin_class_detail(UUID, BOOLEAN);

-- archived_at 只是補充欄位，留著不影響任何東西。真的要拿掉：
-- ALTER TABLE learn_tasks DROP COLUMN IF EXISTS archived_at;
