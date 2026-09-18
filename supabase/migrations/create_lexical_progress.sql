-- =====================================================
-- Lexical Model Phase 4 + 5：學生熟練度 + 作答證據
--
-- 🟢 只要在 production 執行一次。前置：create_lexical_core.sql
--
-- ⚠️ 這一份【不動】 user_word_progress 與 pack_item_progress。
--    兩張舊表繼續存在、繼續被七個頁面寫入。新表是平行的第二份記錄，
--    由 record_lexical_attempt() 以【完全相同的既有公式】維護。
--    本次沒有發明任何新的 mastery / SRS 演算法。
--
-- 兩個關鍵差異（規格要求）：
--   1. identity 是 student_id + lexical_item_id，【不綁 pack】。
--      學生對 persist 的熟練度只有一份，不論它從哪個 pack、
--      哪個 assignment、哪個 practice mode 出現。
--   2. 時間用 TIMESTAMPTZ，不再是 user_word_progress 那種 Unix 毫秒 BIGINT。
-- =====================================================


-- =====================================================
-- 1. student_lexical_mastery
-- =====================================================

CREATE TABLE IF NOT EXISTS student_lexical_mastery (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id      UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  lexical_item_id UUID NOT NULL REFERENCES lexical_items(id) ON DELETE CASCADE,

  -- 與 user_word_progress 相容的四個欄位（相同語意、相同上限 6）。
  mastery_level   SMALLINT    NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 6),
  next_review_at  TIMESTAMPTZ,
  review_count    INTEGER     NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  correct_count   INTEGER     NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  last_review_at  TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 這一條就是 Phase 4 的重點：每個學生 × 每個 canonical 字詞只有一列。
  UNIQUE (student_id, lexical_item_id),

  CHECK (correct_count <= review_count)
);

COMMENT ON TABLE student_lexical_mastery IS
  '學生對 canonical 語彙單位的熟練度。identity 刻意【不含 pack_id】：同一個字出現在幾個 pack 都只有一份熟練度。與 user_word_progress 並存，由 record_lexical_attempt() 用既有公式維護，本次沒有新演算法。';
COMMENT ON COLUMN student_lexical_mastery.mastery_level IS
  '0–6，與 user_word_progress.mastery_level 同語意。升降規則見 lexical_compat_next_mastery()。';
COMMENT ON COLUMN student_lexical_mastery.next_review_at IS
  'TIMESTAMPTZ，不是 user_word_progress 那種 Unix 毫秒。間隔表見 lexical_compat_review_interval()。';

CREATE INDEX IF NOT EXISTS student_lexical_mastery_due_idx
  ON student_lexical_mastery (student_id, next_review_at);
CREATE INDEX IF NOT EXISTS student_lexical_mastery_item_idx
  ON student_lexical_mastery (lexical_item_id);
CREATE INDEX IF NOT EXISTS student_lexical_mastery_level_idx
  ON student_lexical_mastery (student_id, mastery_level);

DROP TRIGGER IF EXISTS trg_student_lexical_mastery_touch ON student_lexical_mastery;
CREATE TRIGGER trg_student_lexical_mastery_touch
  BEFORE UPDATE ON student_lexical_mastery
  FOR EACH ROW EXECUTE FUNCTION lexical_touch_updated_at();


-- =====================================================
-- 2. lexical_attempts：每一次作答的完整證據
--
-- 這是目前系統完全沒有的東西。現在只留下累積計數
-- （review_count / correct_count），每一次作答的細節在關掉頁面時消失。
--
-- ⚠️ exercise_type 與 skill_dimension 是【兩個不同概念】，不合併：
--      exercise_type   = 這一題長什麼樣子（哪個練習模式出的）
--      skill_dimension = 這一題在考什麼能力
--    例如 fill_blank 與 quick_quiz 都可以考 meaning，
--    而同一個 flashcard 既是 exposure 也是 self_assessment。
-- =====================================================

CREATE TABLE IF NOT EXISTS lexical_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id       UUID NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  lexical_item_id  UUID NOT NULL REFERENCES lexical_items(id) ON DELETE CASCADE,

  exercise_type    TEXT NOT NULL
                   CHECK (exercise_type IN (
                     'srs','quick_quiz','flashcard','spelling',
                     'fill_blank','match','synonym_antonym','cluster_recall'
                   )),

  skill_dimension  TEXT NOT NULL
                   CHECK (skill_dimension IN (
                     'meaning',            -- 認得意思
                     'form_recall',        -- 拼得出來
                     'context',            -- 在句子裡用得對
                     'lexical_connection', -- 同義／反義／字族之間的連結
                     'self_assessment'     -- 學生自評，不是客觀測驗
                   )),

  -- NULL = 這一次沒有客觀對錯（翻卡曝光、SRS 自評）。
  correct          BOOLEAN,

  response_time_ms INTEGER CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  attempt_count    INTEGER CHECK (attempt_count    IS NULL OR attempt_count    >= 0),
  used_hint        BOOLEAN,

  -- SRS 的 forgot / hard / easy，以及 flashcard 的 Mark as Known。
  self_rating      TEXT CHECK (self_rating IS NULL OR self_rating IN ('forgot','hard','easy')),

  pack_id          UUID REFERENCES packs(id) ON DELETE SET NULL,

  -- 刻意【不加】FK：目前沒有 canonical 的 assignment 主表
  -- （legacy 的 assignments 已於 2026-09-18 退役，learn_tasks 是另一個模組的概念）。
  -- 現在硬綁一張表，等真正的 assignment 模型出來就得改。
  assignment_id    UUID,

  -- 一場練習（一次 quiz/一輪配對）的識別碼，由前端產生。
  session_id       UUID,

  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata         JSONB,

  -- 熟練度有沒有因為這一次而變動。false = 只留證據，不動 mastery
  -- （配對遊戲的誤點就是這一類）。
  affected_mastery BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON TABLE lexical_attempts IS
  '每一次作答的完整證據，append-only 的事實記錄。與 student_lexical_mastery 分離：留下 attempt 不代表一定要動熟練度（見 affected_mastery）。';
COMMENT ON COLUMN lexical_attempts.exercise_type IS
  '這一題由哪個練習模式出的。與 skill_dimension 是不同概念，不要合併。';
COMMENT ON COLUMN lexical_attempts.skill_dimension IS
  '這一題在考哪一種能力。與 exercise_type 是不同概念，不要合併。';
COMMENT ON COLUMN lexical_attempts.correct IS
  'NULL = 這一次沒有客觀對錯。翻卡曝光與 SRS 自評都是 NULL —— 自評不是客觀測驗證據。';
COMMENT ON COLUMN lexical_attempts.assignment_id IS
  '刻意無 FK：目前沒有 canonical assignment 主表。等 teacher assignment 模型定案再補 FK。';
COMMENT ON COLUMN lexical_attempts.affected_mastery IS
  '這一次是否觸發了 student_lexical_mastery 更新。配對遊戲的誤點記為 false。';

CREATE INDEX IF NOT EXISTS lexical_attempts_student_time_idx
  ON lexical_attempts (student_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lexical_attempts_item_idx
  ON lexical_attempts (lexical_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lexical_attempts_student_item_idx
  ON lexical_attempts (student_id, lexical_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lexical_attempts_exercise_idx
  ON lexical_attempts (exercise_type, skill_dimension);
CREATE INDEX IF NOT EXISTS lexical_attempts_session_idx
  ON lexical_attempts (session_id) WHERE session_id IS NOT NULL;


-- =====================================================
-- 3. 權限
--
-- 🔒 規格要求：RLS 不允許學生讀寫其他學生的 mastery / attempt。
--
-- 做法比「只寫 policy」更嚴：兩張表【完全不發 DML grant】給 authenticated。
-- 學生只能 SELECT 自己的列；所有寫入都走 record_lexical_attempt()
-- 這支 SECURITY DEFINER 函式，前端沒有任何直接寫入的路徑。
-- 這同時滿足「新資料寫入不得只靠前端 local state」。
-- =====================================================

ALTER TABLE student_lexical_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexical_attempts        ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE student_lexical_mastery FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE lexical_attempts        FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE student_lexical_mastery TO authenticated;
GRANT SELECT ON TABLE lexical_attempts        TO authenticated;

DROP POLICY IF EXISTS student_lexical_mastery_own_read ON student_lexical_mastery;
CREATE POLICY student_lexical_mastery_own_read ON student_lexical_mastery
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS lexical_attempts_own_read ON lexical_attempts;
CREATE POLICY lexical_attempts_own_read ON lexical_attempts
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_admin());

-- 刻意沒有 INSERT / UPDATE / DELETE 政策，也沒有對應的 grant。
-- 兩層都關 = 就算之後有人不小心補了 grant，沒有政策仍然寫不進去。
