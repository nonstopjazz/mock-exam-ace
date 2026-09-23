-- =====================================================
-- 回滾：把 lexical_legacy_map 的讀取權限還給 authenticated
--
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 回滾之後，任何登入者又讀得到整張內部對照表（6376 列，含人工確認備註）。
--    只有在確認某個功能真的需要它的時候才回滾 —— 而那時候更該做的是
--    開一支 SECURITY DEFINER 函式只回傳需要的欄位，而不是整表放行。
-- =====================================================

GRANT SELECT ON TABLE public.lexical_legacy_map TO authenticated;

DROP POLICY IF EXISTS lexical_legacy_map_read ON public.lexical_legacy_map;
CREATE POLICY lexical_legacy_map_read ON public.lexical_legacy_map
  FOR SELECT TO authenticated
  USING (true);

SELECT has_table_privilege('authenticated', 'public.lexical_legacy_map', 'SELECT') AS "回滾後_登入者可讀（應true）";
