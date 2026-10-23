-- =====================================================
-- 回滾 create_learning_packs_2_admin.sql
--
-- 只移除 RPC，【不動資料】。學習包與單元都留著。
--
-- 🛑 前端必須一起回滾 —— /admin/learning-packs 會呼叫這些函式，
--    函式不存在時整頁讀不到資料。
-- =====================================================

DROP FUNCTION IF EXISTS public.learning_pack_admin_sources();
DROP FUNCTION IF EXISTS public.learning_pack_admin_set_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.learning_pack_admin_reorder(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.learning_pack_admin_unit_delete(UUID);
DROP FUNCTION IF EXISTS public.learning_pack_admin_unit_upsert(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.learning_pack_admin_upsert(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.learning_pack_admin_get(UUID);
DROP FUNCTION IF EXISTS public.learning_pack_admin_list();
-- readiness 最後移除：上面幾支依賴它
DROP FUNCTION IF EXISTS public.learning_pack_readiness(UUID);

SELECT 'RPC 已全部移除' AS "檢查項",
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'learning_pack%') = 0 AS "通過";
