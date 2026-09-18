-- =====================================================
-- 回滾 create_lexical_rpcs.sql
-- 🟢 只要在 production 執行一次。
--
-- ⚠️ 只刪函式，不刪資料。回滾之後前端呼叫 record_lexical_attempt 會拿到
--    「function does not exist」—— 相容層（src/lib/lexical/attempts.ts）
--    把 RPC 失敗視為非致命，七個頁面仍然靠 user_word_progress 正常運作。
-- =====================================================

DROP FUNCTION IF EXISTS get_lexical_mastery_map();
DROP FUNCTION IF EXISTS record_lexical_attempt(TEXT,TEXT,UUID,TEXT,TEXT,BOOLEAN,INTEGER,INTEGER,BOOLEAN,TEXT,UUID,UUID,UUID,JSONB,BOOLEAN);
DROP FUNCTION IF EXISTS lexical_compat_next_mastery(SMALLINT,BOOLEAN,TEXT);
DROP FUNCTION IF EXISTS lexical_compat_review_interval(SMALLINT);
