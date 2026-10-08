-- 測試用的替身資料。🛑 只給本機臨時資料庫用，絕不在任何真實環境執行。
--
-- 只建稽核查詢真正會讀到的欄位與表，不帶 FK（不需要 auth.users）。
-- 型別要跟正式 schema 一致，否則測不到型別相關的問題。
DROP TABLE IF EXISTS public.lexical_attempts;
DROP TABLE IF EXISTS public.student_lexical_mastery;
DROP TABLE IF EXISTS public.lexical_items;
DROP TABLE IF EXISTS public.user_word_progress;

CREATE TABLE public.lexical_items (
  id UUID PRIMARY KEY,
  lemma TEXT NOT NULL,
  legacy_level_word_id TEXT UNIQUE
);

-- 舊表：學生實際看到的複習佇列讀的是這張（getDueWords → wordProgress）。
CREATE TABLE public.user_word_progress (
  user_id UUID NOT NULL,
  word_id TEXT NOT NULL,
  mastery_level INTEGER NOT NULL DEFAULT 0,
  next_review_time BIGINT NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, word_id)
);

CREATE TABLE public.student_lexical_mastery (
  student_id UUID NOT NULL,
  lexical_item_id UUID NOT NULL,
  mastery_level SMALLINT,
  review_count INTEGER,
  correct_count INTEGER,
  PRIMARY KEY (student_id, lexical_item_id)
);

CREATE TABLE public.lexical_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  lexical_item_id UUID NOT NULL,
  exercise_type TEXT NOT NULL,
  skill_dimension TEXT NOT NULL DEFAULT 'meaning',
  correct BOOLEAN,
  self_rating TEXT,
  session_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB,
  affected_mastery BOOLEAN NOT NULL DEFAULT false
);

-- 三個學生、三個字、三場 session
\set S1 '''11111111-1111-1111-1111-111111111111'''
\set S2 '''22222222-2222-2222-2222-222222222222'''
\set W1 '''aaaaaaaa-1111-1111-1111-111111111111'''
\set W2 '''aaaaaaaa-2222-2222-2222-222222222222'''
\set W3 '''aaaaaaaa-3333-3333-3333-333333333333'''
\set SA '''cccc0001-1111-1111-1111-111111111111'''
\set SB '''cccc0002-2222-2222-2222-222222222222'''
\set SC '''cccc0003-3333-3333-3333-333333333333'''

INSERT INTO public.lexical_items (id, lemma, legacy_level_word_id) VALUES
  (:W1::uuid, 'abandon', 'lw-1'),
  (:W2::uuid, 'benefit', 'lw-2'),
  (:W3::uuid, 'crucial', 'lw-3');

-- S1/W3 是 SRS 連點那組（C9）。舊表被多推了一次：
-- 真實複習 1 次（熟練度應為 1 → 10 分鐘），實際記成 2 次（熟練度 2 → 1 天）。
INSERT INTO public.user_word_progress
  (user_id, word_id, mastery_level, next_review_time, review_count) VALUES
  (:S1::uuid, 'lw-3', 2, 1790000000000, 2),
  (:S2::uuid, 'lw-2', 2, 1790000000000, 2);

INSERT INTO public.student_lexical_mastery
  (student_id, lexical_item_id, mastery_level, review_count, correct_count) VALUES
  (:S1::uuid, :W1::uuid, 3, 5, 4),
  (:S1::uuid, :W2::uuid, 2, 4, 2),
  (:S2::uuid, :W1::uuid, 4, 9, 8);

INSERT INTO public.lexical_attempts
  (student_id, lexical_item_id, exercise_type, correct, self_rating, session_id,
   occurred_at, metadata, affected_mastery) VALUES

-- ── 要被抓到的三組 ──────────────────────────────────────────
-- C1 一對一錯：點了兩個不同選項。無法自動判定學生本來要選哪個。
  (:S1::uuid, :W1::uuid, 'quick_quiz', false, NULL, :SA::uuid,
   '2026-09-20 10:00:00.000+00', NULL, true),
  (:S1::uuid, :W1::uuid, 'quick_quiz', true, NULL,  :SA::uuid,
   '2026-09-20 10:00:00.120+00', NULL, true),

-- C2 一對一錯 + 倒數歸零：timeout 那筆可判定。
  (:S1::uuid, :W2::uuid, 'quick_quiz', false, NULL, :SA::uuid,
   '2026-09-20 10:01:00.000+00', '{"event":"timeout"}'::jsonb, true),
  (:S1::uuid, :W2::uuid, 'quick_quiz', true, NULL,  :SA::uuid,
   '2026-09-20 10:01:00.080+00', NULL, true),

-- C3 純重複：同一顆連點三下，對錯一致。
  (:S2::uuid, :W1::uuid, 'fill_blank', true, NULL, :SB::uuid,
   '2026-09-20 10:03:00.000+00', NULL, true),
  (:S2::uuid, :W1::uuid, 'fill_blank', true, NULL, :SB::uuid,
   '2026-09-20 10:03:00.050+00', NULL, true),
  (:S2::uuid, :W1::uuid, 'fill_blank', true, NULL, :SB::uuid,
   '2026-09-20 10:03:00.100+00', NULL, true),

-- ── 對照組：以下【全部都不該被抓到】──────────────────────────
-- C4 同一場裡真的重複遇到同一個字，相隔 15 分鐘。
  (:S2::uuid, :W1::uuid, 'fill_blank', true, NULL, :SB::uuid,
   '2026-09-20 10:05:00.000+00', NULL, true),
  (:S2::uuid, :W1::uuid, 'fill_blank', true, NULL, :SB::uuid,
   '2026-09-20 10:20:00.000+00', NULL, true),

-- C5 同一瞬間但【不同題型】：拼字與選擇是兩題，不是重複。
  (:S1::uuid, :W3::uuid, 'spelling',   true, NULL, :SA::uuid,
   '2026-09-20 10:02:00.000+00', NULL, true),
  (:S1::uuid, :W3::uuid, 'quick_quiz', true, NULL, :SA::uuid,
   '2026-09-20 10:02:00.050+00', NULL, true),

-- C6 同一瞬間但【不同學生】：兩個人各自作答。
  (:S2::uuid, :W3::uuid, 'quick_quiz', true, NULL, :SB::uuid,
   '2026-09-20 10:02:00.050+00', NULL, true),

-- C7 同一瞬間但【不同 session】：兩個分頁，不是同一次連點。
  (:S1::uuid, :W1::uuid, 'quick_quiz', true, NULL, :SA::uuid,
   '2026-09-20 10:30:00.000+00', NULL, true),
  (:S1::uuid, :W1::uuid, 'quick_quiz', true, NULL, :SC::uuid,
   '2026-09-20 10:30:00.100+00', NULL, true),

-- C8 配對遊戲連點：走 recordEvidenceOnly，是證據不是重複。
--    不在四種題型內 → 01 不該看到它；05 對照組應該看得到。
  (:S1::uuid, :W2::uuid, 'match', false, NULL, :SA::uuid,
   '2026-09-20 10:04:00.000+00', NULL, false),
  (:S1::uuid, :W2::uuid, 'match', false, NULL, :SA::uuid,
   '2026-09-20 10:04:00.100+00', NULL, false),
  (:S1::uuid, :W2::uuid, 'match', false, NULL, :SA::uuid,
   '2026-09-20 10:04:00.200+00', NULL, false),

-- C9  🛑 SRS 判定矛盾：forgot 之後 easy。correct 永遠是 NULL，
--     只看 correct 的舊版稽核【完全看不到這一類】。
  (:S1::uuid, :W3::uuid, 'srs', NULL, 'forgot', :SA::uuid,
   '2026-09-20 10:06:00.000+00', NULL, true),
  (:S1::uuid, :W3::uuid, 'srs', NULL, 'easy',   :SA::uuid,
   '2026-09-20 10:06:00.090+00', NULL, true),

-- C10 SRS 純重複：同一顆連點兩下。
  (:S2::uuid, :W2::uuid, 'srs', NULL, 'easy', :SB::uuid,
   '2026-09-20 10:07:00.000+00', NULL, true),
  (:S2::uuid, :W2::uuid, 'srs', NULL, 'easy', :SB::uuid,
   '2026-09-20 10:07:00.060+00', NULL, true),

-- C11 配對【成功】的重複：走 recordPracticeAttempt，會動熟練度。
--     舊版把 match 整個當對照組排除，這一類也漏掉了。
  (:S2::uuid, :W3::uuid, 'match', true, NULL, :SB::uuid,
   '2026-09-20 10:08:00.000+00', NULL, true),
  (:S2::uuid, :W3::uuid, 'match', true, NULL, :SB::uuid,
   '2026-09-20 10:08:00.070+00', NULL, true),

-- C12 🛑 配對的「先點錯、一秒內再點對」—— production 2026-10-07 的真實形狀。
--     false 是證據（recordEvidenceOnly，不算分），true 是成功（算分）。
--     判定確實不同，但【不是】連點：相隔快一秒，人點兩下的速度。
--     第一版把它算成「判定矛盾」，等於每天對正常玩法發警報。
  (:S1::uuid, :W1::uuid, 'match', false, NULL, :SA::uuid,
   '2026-09-20 10:09:00.000+00', NULL, false),
  (:S1::uuid, :W1::uuid, 'match', true,  NULL, :SA::uuid,
   '2026-09-20 10:09:01.000+00', NULL, true);
