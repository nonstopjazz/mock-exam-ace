-- 回滾 backfill_reading_question_target.sql
-- 🛑 這會把【人工確認過的】也一起清掉。只在確定要重跑整個推導時用。
UPDATE reading_questions
   SET target_text = NULL, target_occurrence = NULL
 WHERE construct = 'VC' AND target_text IS NOT NULL;
