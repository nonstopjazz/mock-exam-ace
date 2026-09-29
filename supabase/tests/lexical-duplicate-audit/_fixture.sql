-- 測試用的替身資料。🛑 只給本機臨時資料庫用，絕不在任何真實環境執行。
--
-- 只建稽核查詢真正會讀到的欄位與表，不帶 FK（不需要 auth.users）。
-- 型別要跟正式 schema 一致，否則測不到型別相關的問題。
DROP TABLE IF EXISTS public.lexical_attempts;
DROP TABLE IF EXISTS public.student_lexical_mastery;
DROP TABLE IF EXISTS public.lexical_items;

CREATE TABLE public.lexical_items (
  id UUID PRIMARY KEY,
  lemma TEXT NOT NULL
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

INSERT INTO public.lexical_items (id, lemma) VALUES
  (:W1::uuid, 'abandon'), (:W2::uuid, 'benefit'), (:W3::uuid, 'crucial');

INSERT INTO public.student_lexical_mastery
  (student_id, lexical_item_id, mastery_level, review_count, correct_count) VALUES
  (:S1::uuid, :W1::uuid, 3, 5, 4),
  (:S1::uuid, :W2::uuid, 2, 4, 2),
  (:S2::uuid, :W1::uuid, 4, 9, 8);

INSERT INTO public.lexical_attempts
  (student_id, lexical_item_id, exercise_type, correct, session_id, occurred_at,
   metadata, affected_mastery) VALUES

-- ── 要被抓到的三組 ──────────────────────────────────────────
-- C1 一對一錯：點了兩個不同選項。無法自動判定學生本來要選哪個。
  (:S1::uuid, :W1::uuid, 'quick_quiz', false, :SA::uuid,
   '2026-09-20 10:00:00.000+00', NULL, true),
  (:S1::uuid, :W1::uuid, 'quick_quiz', true,  :SA::uuid,
   '2026-09-20 10:00:00.120+00', NULL, true),

-- C2 一對一錯 + 倒數歸零：timeout 那筆可判定。
  (:S1::uuid, :W2::uuid, 'quick_quiz', false, :SA::uuid,
   '2026-09-20 10:01:00.000+00', '{"event":"timeout"}'::jsonb, true),
  (:S1::uuid, :W2::uuid, 'quick_quiz', true,  :SA::uuid,
   '2026-09-20 10:01:00.080+00', NULL, true),

-- C3 純重複：同一顆連點三下，對錯一致。
  (:S2::uuid, :W1::uuid, 'fill_blank', true, :SB::uuid,
   '2026-09-20 10:03:00.000+00', NULL, true),
  (:S2::uuid, :W1::uuid, 'fill_blank', true, :SB::uuid,
   '2026-09-20 10:03:00.050+00', NULL, true),
  (:S2::uuid, :W1::uuid, 'fill_blank', true, :SB::uuid,
   '2026-09-20 10:03:00.100+00', NULL, true),

-- ── 對照組：以下【全部都不該被抓到】──────────────────────────
-- C4 同一場裡真的重複遇到同一個字，相隔 15 分鐘。
  (:S2::uuid, :W1::uuid, 'fill_blank', true, :SB::uuid,
   '2026-09-20 10:05:00.000+00', NULL, true),
  (:S2::uuid, :W1::uuid, 'fill_blank', true, :SB::uuid,
   '2026-09-20 10:20:00.000+00', NULL, true),

-- C5 同一瞬間但【不同題型】：拼字與選擇是兩題，不是重複。
  (:S1::uuid, :W3::uuid, 'spelling',   true, :SA::uuid,
   '2026-09-20 10:02:00.000+00', NULL, true),
  (:S1::uuid, :W3::uuid, 'quick_quiz', true, :SA::uuid,
   '2026-09-20 10:02:00.050+00', NULL, true),

-- C6 同一瞬間但【不同學生】：兩個人各自作答。
  (:S2::uuid, :W3::uuid, 'quick_quiz', true, :SB::uuid,
   '2026-09-20 10:02:00.050+00', NULL, true),

-- C7 同一瞬間但【不同 session】：兩個分頁，不是同一次連點。
  (:S1::uuid, :W1::uuid, 'quick_quiz', true, :SA::uuid,
   '2026-09-20 10:30:00.000+00', NULL, true),
  (:S1::uuid, :W1::uuid, 'quick_quiz', true, :SC::uuid,
   '2026-09-20 10:30:00.100+00', NULL, true),

-- C8 配對遊戲連點：走 recordEvidenceOnly，是證據不是重複。
--    不在四種題型內 → 01 不該看到它；05 對照組應該看得到。
  (:S1::uuid, :W2::uuid, 'match', false, :SA::uuid,
   '2026-09-20 10:04:00.000+00', NULL, false),
  (:S1::uuid, :W2::uuid, 'match', false, :SA::uuid,
   '2026-09-20 10:04:00.100+00', NULL, false),
  (:S1::uuid, :W2::uuid, 'match', false, :SA::uuid,
   '2026-09-20 10:04:00.200+00', NULL, false);
