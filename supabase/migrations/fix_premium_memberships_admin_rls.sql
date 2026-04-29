-- 修復：允許 Admin 查看所有 premium_memberships
-- 原本只有 "Users can view own memberships" 導致 admin 看不到其他使用者的 Premium 狀態

CREATE POLICY "Admins can view all memberships"
  ON premium_memberships FOR SELECT
  USING (is_admin());
