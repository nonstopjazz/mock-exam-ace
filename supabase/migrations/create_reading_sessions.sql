-- =====================================================
-- Six-Way Reading（4／7）：作答階段與逐題紀錄
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_questions.sql。
--
-- 🛑 reading_attempts 是 append-only 的事實紀錄，不是「目前狀態」。
--    學生在畫面上改答案改的是前端 state；落地只有一次——送出那一次。
--    改了幾次記在 answer_change_count 裡。
--
--    這一點跟 lexical_attempts 是同一個設計：留下發生過什麼，
--    而不是留下最後看起來怎樣。
--
-- 🛑 is_correct 由伺服器端判定，【不接受前端傳入】。
--    reading_submit_answer() 自己去 reading_question_keys 比對。
--    讓前端送 is_correct 等於把計分權交給瀏覽器。
--
-- 回滾：supabase/migrations/create_reading_sessions.rollback.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS reading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  passage_id TEXT NOT NULL REFERENCES reading_passages(passage_id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
         CHECK (status IN ('IN_PROGRESS','SUBMITTED','ABANDONED')),

  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,

  CONSTRAINT reading_sessions_submitted_has_time CHECK (
    (status = 'SUBMITTED' AND submitted_at IS NOT NULL)
    OR (status <> 'SUBMITTED' AND submitted_at IS NULL)
  )
);

COMMENT ON TABLE reading_sessions IS
  '一次閱讀練習。同一篇可以練很多次——每一次是一個 session，不覆蓋前一次。';

CREATE INDEX IF NOT EXISTS reading_sessions_student_idx
  ON reading_sessions (student_id, started_at DESC);
-- 一位學生同一篇同時只能有一個進行中的 session，避免兩個分頁互相蓋掉
CREATE UNIQUE INDEX IF NOT EXISTS reading_sessions_one_active
  ON reading_sessions (student_id, passage_id)
  WHERE status = 'IN_PROGRESS';


CREATE TABLE IF NOT EXISTS reading_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id  UUID NOT NULL REFERENCES reading_sessions(id)  ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES reading_questions(id) ON DELETE CASCADE,
  -- 反正規化：查「這位學生的所有作答」不必每次 join session
  student_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  selected_answer CHAR(1) NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
  -- 🛑 伺服器端判定，前端傳什麼都不看
  is_correct      BOOLEAN NOT NULL,

  response_time_ms    INTEGER CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  -- 送出前改了幾次答案。0 = 一次就決定。
  answer_change_count INTEGER NOT NULL DEFAULT 0 CHECK (answer_change_count >= 0),
  -- 第一次選的是什麼。配合 change_count 才分得出「改對」與「改錯」。
  first_answer CHAR(1) CHECK (first_answer IS NULL OR first_answer IN ('A','B','C','D')),

  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 一題一次。再送同一題不會新增，也不會覆蓋（見 submit RPC）。
  UNIQUE (session_id, question_id)
);

COMMENT ON TABLE reading_attempts IS
  '逐題作答的事實紀錄，append-only。is_correct 一律由伺服器比對答案後寫入。';
COMMENT ON COLUMN reading_attempts.answer_change_count IS
  '送出前改了幾次。猶豫程度的訊號——高 change_count 的 construct 是沒把握的地方。';

CREATE INDEX IF NOT EXISTS reading_attempts_student_idx
  ON reading_attempts (student_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS reading_attempts_question_idx
  ON reading_attempts (question_id, is_correct);


-- ── 權限 ──────────────────────────────────────────────
REVOKE ALL ON reading_sessions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON reading_attempts FROM PUBLIC, anon, authenticated, service_role;

-- 學生讀得到自己的紀錄（結果頁要用），但【不能自己寫】——
-- 寫入一律經過 SECURITY DEFINER 的 RPC，否則學生可以自己 INSERT is_correct = true。
GRANT SELECT ON reading_sessions TO authenticated;
GRANT SELECT ON reading_attempts TO authenticated;
GRANT ALL    ON reading_sessions TO service_role;
GRANT ALL    ON reading_attempts TO service_role;

ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reading_sessions_own_read ON reading_sessions;
CREATE POLICY reading_sessions_own_read ON reading_sessions
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR coalesce(public.is_admin(), false));

DROP POLICY IF EXISTS reading_attempts_own_read ON reading_attempts;
CREATE POLICY reading_attempts_own_read ON reading_attempts
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR coalesce(public.is_admin(), false));

DROP POLICY IF EXISTS reading_sessions_service_all ON reading_sessions;
CREATE POLICY reading_sessions_service_all ON reading_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS reading_attempts_service_all ON reading_attempts;
CREATE POLICY reading_attempts_service_all ON reading_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 驗證（唯讀）───────────────────────────────────────
-- 預期：兩張表的「登入者可寫」都是 false
SELECT c.relname,
       c.relrowsecurity AS "RLS 開啟",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀",
       has_table_privilege('authenticated', c.oid, 'INSERT') AS "登入者可寫",
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS "登入者可改"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('reading_sessions','reading_attempts')
 ORDER BY c.relname;
