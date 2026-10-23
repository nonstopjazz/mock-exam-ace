-- =====================================================
-- 回滾 create_learning_packs_1_tables.sql
--
-- 🛑 這會【永久刪掉所有學習包與單元】。那些資料無法重建。
--
--    刪之前先看一下會失去什麼：
--
--      SELECT p.status, count(DISTINCT p.id) AS "學習包數",
--             count(u.id) AS "單元數"
--        FROM public.learning_packs p
--        LEFT JOIN public.learning_pack_units u ON u.pack_id = p.id
--       GROUP BY p.status;
--
-- 🛑 要先跑 create_learning_packs_2_admin.rollback.sql（RPC 依賴這兩張表）。
--
-- ⚠️ 教材本身不受影響 —— reading_passages 與 packs 都沒有被動過，
--    學習包只存引用。
-- =====================================================

DROP TABLE IF EXISTS public.learning_pack_units;
DROP TABLE IF EXISTS public.learning_packs;
DROP FUNCTION IF EXISTS public.learning_packs_touch();

SELECT '兩張表都已移除' AS "檢查項",
       (SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('learning_packs', 'learning_pack_units')) = 0 AS "通過";
