-- =====================================================
-- 回滾 create_learn_course_access_matrix.sql
--
-- 只移除兩支新函式。【不動任何授權資料】——
-- learn_course_access 與 learn_feature_access 裡由那一頁建立的列都留著，
-- 因為它們與既有頁面建立的列完全沒有差別（同樣的表、同樣的欄位）。
--
-- 🛑 前端必須【一起】回滾。
--    /admin/course-access 會呼叫這兩支，函式不存在時整頁讀不到資料。
--    只回滾 SQL 的話，管理中心會多一張點進去就壞掉的卡。
--
-- 回滾之後：
--   · 個別開放回到「只能收回不能新增」（課程編輯頁）
--   · 「哪個學生開放了哪些課」沒有地方看得到，要逐門課點進去比對
--   · 開放課程時不再一併處理功能閘 —— 會回到「勾了課學生還是看不到」
-- =====================================================

DROP FUNCTION IF EXISTS public.learn_admin_course_grant_student(UUID, UUID, BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.learn_admin_course_access_matrix(TEXT, UUID, INTEGER);


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT '兩支都已移除' AS "檢查項",
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('learn_admin_course_access_matrix',
                             'learn_admin_course_grant_student')) = 0 AS "通過";
