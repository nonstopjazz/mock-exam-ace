-- =====================================================
-- 建一門課的樣板（管理介面做好之前先用這個）
--
-- 🟢 只要在 production 執行一次。執行模式：Run without RLS。
--
-- 用法：把底下 ⬇️ 標記的地方改成你的內容，整份貼進 SQL Editor 執行。
--       可以重複執行——slug 相同的課會被更新，不會變成兩門。
--
-- 🛑 video_id 不是網址
--
--   YOUTUBE：網址 https://www.youtube.com/watch?v=dQw4w9WgXcQ
--            要填的是 dQw4w9WgXcQ（11 碼）
--
--   BUNNY  ：Bunny Stream 後台那支影片的 Video GUID，
--            長得像 8a1b2c3d-4e5f-6789-abcd-ef0123456789
--            🛑 不是 Library ID，Library ID 只設定一次（見最底下）
--
-- 🛑 duration_seconds 是秒數。15 分 30 秒 = 930，不是 "15:30"。
--    填 0 也可以，只是畫面上不會顯示時長。
--
-- 🛑 access 的意思
--     'ENROLLED' 要在 learn_course_access 裡有一列才看得到（預設）
--     'FREE'     有「影片課程」功能的人都看得到，不必逐一選課
--                ⚠️ FREE 不等於公開——沒有那個功能的人還是看不到
--
-- 🛑 status 預設 'DRAFT'。改成 'PUBLISHED' 學生才看得到。
--    建議先 DRAFT，自己用管理員身分把每一支都點過一遍再發布。
-- =====================================================

BEGIN;

-- ── 1. 課程本身 ──────────────────────────────────────
INSERT INTO learn_courses (slug, title, description, instructor, level, category,
                           type, access, status, sort_order, created_by)
VALUES (
  'my-first-course',                    -- ⬇️ slug：小寫英數與連字號，網址用
  '我的第一門課',                        -- ⬇️ 課名
  '這門課在講什麼。',                     -- ⬇️ 說明
  '王老師',                              -- ⬇️ 講師
  'BEGINNER',                           -- ⬇️ BEGINNER / INTERMEDIATE / ADVANCED
  '文法',                                -- ⬇️ 分類（清單頁的篩選鈕會自動出現）
  'STANDARD',                           -- ⬇️ STANDARD = 週次課；DRIP = 循序解鎖
  'ENROLLED',                           -- ⬇️ ENROLLED / FREE
  'DRAFT',                              -- ⬇️ 先 DRAFT，確認過再改 PUBLISHED
  0,                                    -- ⬇️ 排序，小的在前
  (SELECT id FROM auth.users WHERE email = 'nonstopjazz@gmail.com')  -- ⬇️ 你的帳號
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  instructor = EXCLUDED.instructor, level = EXCLUDED.level,
  category = EXCLUDED.category, type = EXCLUDED.type,
  access = EXCLUDED.access, status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order, updated_at = now();


-- ── 2. 章節與影片 ────────────────────────────────────
-- 每一列是一支影片。section_position 相同的會被歸在同一章。
WITH c AS (SELECT id FROM learn_courses WHERE slug = 'my-first-course'),  -- ⬇️ 同上的 slug
plan(section_position, section_title, section_desc,
     lesson_position, lesson_title, lesson_desc,
     provider, video_id, duration_seconds, is_preview) AS (VALUES
  -- ⬇️⬇️⬇️ 從這裡開始改 ⬇️⬇️⬇️
  (1, '第 1 週：入門', '先把觀念建立起來',
   1, '什麼是文法',      '',  'YOUTUBE', 'dQw4w9WgXcQ',  930, true),
  (1, '第 1 週：入門', '先把觀念建立起來',
   2, '句子的基本結構',   '',  'YOUTUBE', 'dQw4w9WgXcQ', 1245, false),
  (2, '第 2 週：時態',   '現在式與過去式',
   1, '現在式',          '',  'BUNNY',   '8a1b2c3d-4e5f-6789-abcd-ef0123456789', 1100, false),
  (2, '第 2 週：時態',   '現在式與過去式',
   2, '過去式',          '',  'BUNNY',   '8a1b2c3d-4e5f-6789-abcd-ef0123456790', 1330, false)
  -- ⬆️⬆️⬆️ 改到這裡 ⬆️⬆️⬆️
),
sections AS (
  INSERT INTO learn_course_sections (course_id, position, title, description)
  SELECT c.id, p.section_position, max(p.section_title), max(p.section_desc)
    FROM plan p CROSS JOIN c
   GROUP BY c.id, p.section_position
  ON CONFLICT (course_id, position) DO UPDATE SET
    title = EXCLUDED.title, description = EXCLUDED.description, updated_at = now()
  RETURNING id, position
)
INSERT INTO learn_course_lessons
  (section_id, position, title, description, provider, video_id, duration_seconds, is_preview)
SELECT s.id, p.lesson_position, p.lesson_title, p.lesson_desc,
       p.provider, p.video_id, p.duration_seconds, p.is_preview
  FROM plan p
  JOIN sections s ON s.position = p.section_position
ON CONFLICT (section_id, position) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  provider = EXCLUDED.provider, video_id = EXCLUDED.video_id,
  duration_seconds = EXCLUDED.duration_seconds,
  is_preview = EXCLUDED.is_preview, updated_at = now();


-- ── 3. 開放給誰（access = 'ENROLLED' 才需要）──────────
-- 整班開放：
-- INSERT INTO learn_course_access (course_id, class_id, granted_by)
-- SELECT (SELECT id FROM learn_courses WHERE slug = 'my-first-course'),
--        (SELECT id FROM learn_classes WHERE name = 'A 班'),
--        (SELECT id FROM auth.users WHERE email = 'nonstopjazz@gmail.com')
-- ON CONFLICT DO NOTHING;
--
-- 個別開放：
-- INSERT INTO learn_course_access (course_id, student_id, granted_by)
-- SELECT (SELECT id FROM learn_courses WHERE slug = 'my-first-course'),
--        (SELECT id FROM auth.users WHERE email = '學生的信箱'),
--        (SELECT id FROM auth.users WHERE email = 'nonstopjazz@gmail.com')
-- ON CONFLICT DO NOTHING;

COMMIT;


-- ── 4. Bunny 的一次性設定（只有用 Bunny 才需要）───────
-- Library ID 不是祕密，直接寫在這裡沒關係：
-- UPDATE learn_course_config SET bunny_library_id = '12345', updated_at = now();
--
-- 🛑 Token Authentication Key【不要】寫進任何 SQL 檔或貼給任何人。
--    在 Supabase Dashboard → Project Settings → Vault → New secret，
--    名稱一字不差填 BUNNY_TOKEN_AUTH_KEY，值貼你的 key。
--    金鑰沒設好之前，Bunny 的影片會【報錯而不是無防護播出】——那是刻意的。


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  c.slug            AS "代號",
  c.title           AS "課名",
  c.status          AS "狀態",
  c.access          AS "開放",
  c.type            AS "型態",
  count(DISTINCT s.id)  AS "章節數",
  count(l.id)           AS "影片數",
  sum(l.duration_seconds) / 60 AS "總分鐘",
  count(*) FILTER (WHERE l.provider = 'BUNNY')   AS "Bunny",
  count(*) FILTER (WHERE l.provider = 'YOUTUBE') AS "YouTube"
FROM learn_courses c
LEFT JOIN learn_course_sections s ON s.course_id = c.id
LEFT JOIN learn_course_lessons  l ON l.section_id = s.id
GROUP BY c.id, c.slug, c.title, c.status, c.access, c.type
ORDER BY c.sort_order, c.title;
