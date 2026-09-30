-- 測試 06 / 07 用的替身資料。🛑 只給本機臨時資料庫，絕不在真實環境執行。
--
-- 三位學生刻意涵蓋三種情況：
--   R1 多算 3、熟練度=複習次數 → 可反推，且修完已到期
--   R2 多算 1、熟練度 6（上限）→ 可反推，修完還沒到期
--   R2 的新表另外測第三道防線：複習次數不大於多算次數 → 不可反推
--   R3 熟練度 ≠ 複習次數，且實際多算數與檔案裡的觀測值不符
--      → 兩道防線都該亮：🛑 不可反推 + 🛑 分析已過期
DROP TABLE IF EXISTS public.lexical_attempts;
DROP TABLE IF EXISTS public.student_lexical_mastery;
DROP TABLE IF EXISTS public.user_word_progress;
DROP TABLE IF EXISTS public.lexical_items;

CREATE TABLE public.lexical_items (
  id UUID PRIMARY KEY, lemma TEXT NOT NULL, legacy_level_word_id TEXT UNIQUE
);
CREATE TABLE public.user_word_progress (
  user_id UUID NOT NULL, word_id TEXT NOT NULL,
  mastery_level INTEGER NOT NULL DEFAULT 0,
  next_review_time BIGINT NOT NULL DEFAULT 0,
  last_review_time BIGINT,
  review_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, word_id)
);
CREATE TABLE public.student_lexical_mastery (
  student_id UUID NOT NULL, lexical_item_id UUID NOT NULL,
  mastery_level SMALLINT, review_count INTEGER, correct_count INTEGER,
  PRIMARY KEY (student_id, lexical_item_id)
);
CREATE TABLE public.lexical_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL, lexical_item_id UUID NOT NULL,
  exercise_type TEXT NOT NULL, correct BOOLEAN, self_rating TEXT,
  session_id UUID, occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB, affected_mastery BOOLEAN NOT NULL DEFAULT false
);

\set R1 '''aaaa0001-0000-0000-0000-000000000001'''
\set R2 '''aaaa0002-0000-0000-0000-000000000002'''
\set R3 '''aaaa0003-0000-0000-0000-000000000003'''
\set WA '''bbbb0001-0000-0000-0000-000000000001'''
\set WB '''bbbb0002-0000-0000-0000-000000000002'''
\set WC '''bbbb0003-0000-0000-0000-000000000003'''
\set SS '''cccc0001-0000-0000-0000-000000000001'''

INSERT INTO public.lexical_items (id, lemma, legacy_level_word_id) VALUES
  (:WA::uuid, 'interact', 'lw-a'),
  (:WB::uuid, 'airline',  'lw-b'),
  (:WC::uuid, 'armchair', 'lw-c');

-- R1：一組 4 筆 → 多算 3。最後複習在 20 天前。
INSERT INTO public.lexical_attempts
  (student_id, lexical_item_id, exercise_type, correct, self_rating, session_id,
   occurred_at, metadata, affected_mastery) VALUES
  (:R1::uuid, :WA::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '20 days', NULL, true),
  (:R1::uuid, :WA::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '20 days' + interval '50 ms', NULL, true),
  (:R1::uuid, :WA::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '20 days' + interval '100 ms', NULL, true),
  (:R1::uuid, :WA::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '20 days' + interval '150 ms', NULL, true),
-- R2：一組 2 筆 → 多算 1。最後複習在 1 天前。
  (:R2::uuid, :WB::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '1 day', NULL, true),
  (:R2::uuid, :WB::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '1 day' + interval '60 ms', NULL, true),
-- R3：一組 3 筆 → 多算 2（檔案裡的觀測值是 1，刻意不符）
  (:R3::uuid, :WC::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '2 days', NULL, true),
  (:R3::uuid, :WC::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '2 days' + interval '40 ms', NULL, true),
  (:R3::uuid, :WC::uuid, 'srs', NULL, 'easy', :SS::uuid, now() - interval '2 days' + interval '80 ms', NULL, true);

INSERT INTO public.user_word_progress
  (user_id, word_id, mastery_level, review_count, last_review_time, next_review_time) VALUES
  -- R1：5/5 可反推 → 應為 2/2；修正後 next = 20天前 + 1天 → 已到期
  (:R1::uuid, 'lw-a', 5, 5,
   (extract(epoch FROM now() - interval '20 days') * 1000)::bigint,
   (extract(epoch FROM now() - interval '6 days')  * 1000)::bigint),
  -- R2：6/6 可反推 → 應為 5/5；修正後 next = 1天前 + 14天 → 還沒到期
  (:R2::uuid, 'lw-b', 6, 6,
   (extract(epoch FROM now() - interval '1 day')  * 1000)::bigint,
   (extract(epoch FROM now() + interval '29 days') * 1000)::bigint),
  -- R3：3/7 熟練度 ≠ 複習次數 → 🛑 不可反推
  (:R3::uuid, 'lw-c', 3, 7,
   (extract(epoch FROM now() - interval '2 days') * 1000)::bigint,
   (extract(epoch FROM now() + interval '1 day')  * 1000)::bigint);

INSERT INTO public.student_lexical_mastery
  (student_id, lexical_item_id, mastery_level, review_count, correct_count) VALUES
  (:R1::uuid, :WA::uuid, 4, 4, 0),
  -- 🛑 R2 的新表刻意設成 1/1，而多算是 1 → 複習次數不大於多算。
  --    反推會算出 0（甚至負數），那不是「正確值」而是算式失效。
  --    下限保護必須讓它變成「不可反推」，不是硬算。
  --    兩張表本來就會不一致（production 實測有一列舊表 6/6、新表 2/2），
  --    所以這不是假想情況。
  (:R2::uuid, :WB::uuid, 1, 1, 0),
  (:R3::uuid, :WC::uuid, 3, 3, 0);
