-- =====================================================
-- Six-Way Reading（5／7）：上架閘門
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_questions.sql。
--
-- 要解決的問題
--
--   半成品必須入得了庫：2026-09 那批 21 篇裡有 5 篇是壞的
--   （3 篇選項全空、1 篇四題缺解說、1 篇一題選項空）。
--   匯入時整篇拒絕，那 5 篇就連「知道它壞在哪」都做不到。
--
--   但半成品【絕對不能上架】。學生點開一篇只有三題、
--   或是四個選項全空白的文章，比看不到這篇還糟。
--
-- 所以檢查不在匯入，在【狀態轉換】：
--   DRAFT     → 隨便，半成品歡迎
--   PUBLISHED → 六個 construct 各一題，且每題內容完整、有答案有解說
--
-- 🛑 用 trigger 而不是「匯入時檢查」。
--    匯入時檢查只擋得住匯入那一條路；後台按鈕、SQL Editor 手改、
--    未來的任何一支腳本都繞得過去。trigger 在資料庫層，繞不過。
--
-- 回滾：supabase/migrations/create_reading_publish_guard.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_publish_readiness(p_passage_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH want AS (SELECT unnest(ARRAY['SM','MI','SD','CO','CD','VC']) AS construct),
  have AS (
    SELECT q.construct
      FROM public.reading_questions q
      JOIN public.reading_question_keys k ON k.question_id = q.id
     WHERE q.passage_id = p_passage_id
       AND length(btrim(q.question))  > 0
       AND length(btrim(q.option_a))  > 0
       AND length(btrim(q.option_b))  > 0
       AND length(btrim(q.option_c))  > 0
       AND length(btrim(q.option_d))  > 0
       AND length(btrim(k.explanation)) > 0
  )
  SELECT jsonb_build_object(
    'passage_id', p_passage_id,
    'ready',   (SELECT count(*) FROM have) = 6,
    'present', (SELECT coalesce(jsonb_agg(construct ORDER BY construct), '[]'::jsonb) FROM have),
    'missing', (SELECT coalesce(jsonb_agg(w.construct ORDER BY w.construct), '[]'::jsonb)
                  FROM want w WHERE w.construct NOT IN (SELECT construct FROM have))
  );
$$;

COMMENT ON FUNCTION reading_publish_readiness IS
  '這篇文章能不能上架，以及缺哪幾個 construct。「完整」的定義是六個 construct 各一題，且題幹、四個選項、解說都非空。';

REVOKE ALL ON FUNCTION reading_publish_readiness(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_publish_readiness(TEXT) TO authenticated, service_role;
