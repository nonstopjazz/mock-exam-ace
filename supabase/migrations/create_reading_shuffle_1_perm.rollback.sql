-- 回滾 create_reading_shuffle_1_perm.sql
-- 🛑 先回滾 2–5，那幾支會呼叫這裡的函式。
DROP FUNCTION IF EXISTS reading_option_to_display(UUID, UUID, CHAR);
DROP FUNCTION IF EXISTS reading_option_to_canonical(UUID, UUID, CHAR);
DROP FUNCTION IF EXISTS reading_option_permutation(UUID, UUID);
