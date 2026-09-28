-- 回滾：移除播放位址相關的函式與設定表
DROP FUNCTION IF EXISTS learn_course_playback(UUID);
DROP FUNCTION IF EXISTS learn_bunny_embed_url(TEXT, BIGINT);
DROP FUNCTION IF EXISTS learn_bunny_token_key();
DROP TABLE IF EXISTS learn_course_config;
