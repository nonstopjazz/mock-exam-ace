-- 測試 07 用的替身資料。🛑 只給本機臨時資料庫，絕不在真實環境執行。
--
-- 🛑 刻意用 production 的 UUID，這樣 07 可以【一字不改】地被測試 ——
--    不需要任何 sed 代換，測到的就是要跑在 production 上的那份。
--
-- 數值完全照 2026-09-30 的 06 輸出鋪設，所以預期結果就是人核可過的那組：
--
--   interact  舊表 5/5，last 09-27 13:08:58.047 → 修完 2/2，next 09-28 13:08:58.047（+1 天）
--   airline   舊表 6/6，last 09-23 05:45:25.962 → 修完 5/5，next 10-07 05:45:25.962（+14 天）
--   armchair  舊表 2/2，last 09-28 07:53:46.493 → 修完 1/1，next 09-28 08:03:46.493（+10 分）
--
-- 🛑 舊表的 correct_count 必須等於 review_count，不能填 0。
--    vocabularyStore 的 updateWordProgress 是
--      correctCount: isCorrect ? correctCount + 1 : correctCount
--    而 SRS 的 easy / hard 都送 legacyCorrect = true，所以每次複習都加一。
--    新表不一樣：record_lexical_attempt 看 p_correct，而 SRS 的 p_correct 是 NULL，
--    所以新表的 correct_count 是 0。
--    第一版 fixture 兩張表都填 0 —— 那是拿新表的值去鋪舊表，
--    結果測試全過而 production 三列全被擋掉。
--
-- 另外鋪一列【不在名單內】的資料（zzz 學生 / decoy 單字），用來證明 07 的範圍
-- 真的只有那三個 pair —— 它被動到就是 WHERE 寫錯了。
DROP TABLE IF EXISTS public.student_lexical_mastery;
DROP TABLE IF EXISTS public.user_word_progress;
DROP TABLE IF EXISTS public.lexical_items;

CREATE TABLE public.lexical_items (
  id UUID PRIMARY KEY,
  lemma TEXT NOT NULL,
  legacy_level_word_id TEXT UNIQUE
);

CREATE TABLE public.user_word_progress (
  user_id UUID NOT NULL,
  word_id TEXT NOT NULL,
  mastery_level INTEGER NOT NULL DEFAULT 0,
  next_review_time BIGINT NOT NULL DEFAULT 0,
  last_review_time BIGINT,
  review_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word_id)
);

CREATE TABLE public.student_lexical_mastery (
  student_id UUID NOT NULL,
  lexical_item_id UUID NOT NULL,
  mastery_level SMALLINT NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 6),
  next_review_at TIMESTAMPTZ,
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  last_review_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, lexical_item_id),
  CHECK (correct_count <= review_count)
);

INSERT INTO public.lexical_items (id, lemma, legacy_level_word_id) VALUES
  ('764d93f7-6410-4fbc-870c-ffae445e85cb', 'interact', 'lw-interact'),
  ('45c02f6d-ce48-43f2-9f5a-77c53d0ff07a', 'airline',  'lw-airline'),
  ('124da150-81f9-42da-9c0b-8d84bd83c6a0', 'armchair', 'lw-armchair'),
  ('99999999-9999-9999-9999-999999999999', 'decoy',    'lw-decoy');

INSERT INTO public.user_word_progress
  (user_id, word_id, mastery_level, review_count, correct_count,
   last_review_time, next_review_time) VALUES
  -- interact：5/5，最後複習 09-27 13:08:58.047，next = +14 天 = 10-11 13:08:58.047
  ('bb34c69e-b7a4-4127-baa6-5a25bf3c6770', 'lw-interact', 5, 5, 5,
   (extract(epoch FROM '2026-09-27 13:08:58.047+00'::timestamptz) * 1000)::bigint,
   (extract(epoch FROM '2026-10-11 13:08:58.047+00'::timestamptz) * 1000)::bigint),
  -- airline：6/6，最後複習 09-23 05:45:25.962，next = +30 天 = 10-23 05:45:25.962
  ('0aea72e3-26d5-409e-9992-a59936fd3abd', 'lw-airline', 6, 6, 6,
   (extract(epoch FROM '2026-09-23 05:45:25.962+00'::timestamptz) * 1000)::bigint,
   (extract(epoch FROM '2026-10-23 05:45:25.962+00'::timestamptz) * 1000)::bigint),
  -- armchair：2/2，最後複習 09-28 07:53:46.493，next = +1 天 = 09-29 07:53:46.493
  ('dbe40a1f-9594-4f8c-b49f-e874ef1ef292', 'lw-armchair', 2, 2, 2,
   (extract(epoch FROM '2026-09-28 07:53:46.493+00'::timestamptz) * 1000)::bigint,
   (extract(epoch FROM '2026-09-29 07:53:46.493+00'::timestamptz) * 1000)::bigint),
  -- 🛑 名單外：不該被動到
  ('99999999-9999-9999-9999-999999999999', 'lw-decoy', 6, 6, 6,
   (extract(epoch FROM '2026-09-23 00:00:00+00'::timestamptz) * 1000)::bigint,
   (extract(epoch FROM '2026-10-23 00:00:00+00'::timestamptz) * 1000)::bigint);

INSERT INTO public.student_lexical_mastery
  (student_id, lexical_item_id, mastery_level, review_count, correct_count,
   last_review_at, next_review_at) VALUES
  ('bb34c69e-b7a4-4127-baa6-5a25bf3c6770', '764d93f7-6410-4fbc-870c-ffae445e85cb',
   5, 5, 0, '2026-09-27 13:08:58.047+00', '2026-10-11 13:08:58.047+00'),
  -- 🛑 airline 新表只有 2/2（舊表 6/6）——兩張表的起算時間不同，不是筆誤
  ('0aea72e3-26d5-409e-9992-a59936fd3abd', '45c02f6d-ce48-43f2-9f5a-77c53d0ff07a',
   2, 2, 0, '2026-09-23 05:45:25.962+00', '2026-09-24 05:45:25.962+00'),
  ('dbe40a1f-9594-4f8c-b49f-e874ef1ef292', '124da150-81f9-42da-9c0b-8d84bd83c6a0',
   2, 2, 0, '2026-09-28 07:53:46.493+00', '2026-09-29 07:53:46.493+00'),
  -- 🛑 名單外：不該被動到
  ('99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999',
   2, 2, 0, '2026-09-23 00:00:00+00', '2026-09-24 00:00:00+00');
