-- =====================================================
-- 收窄 lexical_legacy_map：學生不需要讀整張對照表
--
-- 🟢 只要在 production 執行一次。不動任何一列資料，只改權限與一條政策。
--
-- 為什麼
--
--   create_lexical_core.sql 當初給了 authenticated 全表 SELECT，政策是
--   USING (true)。但實際查過呼叫路徑之後，那個權限沒有任何人用得到：
--
--     · 前端【沒有任何地方】查這張表（src/ 只有註解與型別對齊提到它）
--     · 前端唯一碰到的 lexical 物件是 record_lexical_attempt()
--     · 那支 RPC 是 SECURITY DEFINER，legacy id → canonical id 的查表
--       在伺服器端完成（create_lexical_rpcs.sql:149），以擁有者身分執行，
--       【不受 grant 與 RLS 影響】
--     · 五個 report 視圖本來就全部 REVOKE ALL FROM authenticated
--
--   而這張表裝的是 match_method、candidate_count，以及
--   「lemma 命中 2 個候選…待人工確認」這種內部備註 —— 6376 列的內部帳，
--   學生沒有理由讀得到。隔壁的 lexical_unresolved_relations 正是為了
--   同樣的理由【從一開始就不發 grant】。這一份讓兩張表的處理一致。
--
-- 🛑 這【不是】修補資安漏洞：表裡沒有個資、沒有秘密。它是最小權限，
--    以及讓兩張性質相同的表不要有兩套規則。
--
-- 兩層一起收，不是只收一層：
--   grant 收掉  → 現在就讀不到
--   政策改成 is_admin() → 將來若有人不小心補了 grant，仍然讀不到
--
-- 回滾：supabase/migrations/restrict_lexical_legacy_map_read.rollback.sql
-- =====================================================

-- ── 前置檢查（唯讀）────────────────────────────────────────────
-- 預期：現況 = true（還沒收窄過），service_role = true（不該被動到）
SELECT has_table_privilege('authenticated', 'public.lexical_legacy_map', 'SELECT') AS "收窄前_登入者可讀",
       has_table_privilege('service_role',  'public.lexical_legacy_map', 'SELECT') AS "service_role可讀";


REVOKE SELECT ON TABLE public.lexical_legacy_map FROM authenticated;

-- 政策也一起收。USING (true) 留著會讓「為什麼讀不到」變成兩個地方要查。
DROP POLICY IF EXISTS lexical_legacy_map_read ON public.lexical_legacy_map;
CREATE POLICY lexical_legacy_map_read ON public.lexical_legacy_map
  FOR SELECT TO authenticated
  USING (is_admin());

COMMENT ON TABLE public.lexical_legacy_map IS
  'legacy id → canonical id 的對照，兼 migration 報告的資料來源。內部帳：學生端沒有任何路徑會讀它（record_lexical_attempt 是 SECURITY DEFINER，在伺服器端查）。因此不發 authenticated 的 SELECT grant。';


-- ── 驗證（唯讀）───────────────────────────────────────────────
-- 預期：登入者可讀 = false、service_role 可讀 = true、政策數 = 2
SELECT has_table_privilege('authenticated', 'public.lexical_legacy_map', 'SELECT') AS "收窄後_登入者可讀",
       has_table_privilege('service_role',  'public.lexical_legacy_map', 'SELECT') AS "service_role仍可讀",
       (SELECT count(*)::int FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'lexical_legacy_map') AS "政策數";
