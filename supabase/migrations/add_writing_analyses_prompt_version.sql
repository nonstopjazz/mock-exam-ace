-- =====================================================
-- writing_analyses 加 prompt_version
--
-- 🟢 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🟢 這支只加欄位，不改任何既有資料、不改任何函式。
--
-- 回滾：supabase/migrations/add_writing_analyses_prompt_version.rollback.sql
--
-- ══════════════════════════════════════════════════════════════
-- 為什麼
-- ══════════════════════════════════════════════════════════════
--
-- 2026-10-08 加 MINIMAL 的那次，有一篇作文（「自習室、課後輔導與時間安排」）
-- 在部署前後【102 秒】內重跑完成：
--
--     07:44:02  自習室             → MINIMAL 0，分數沒變
--     07:45:44  建立自己的專屬人物  → MINIMAL 23，8 → 0
--
-- 第二篇證明了 07:45:44 時新 prompt 已經生效（MINIMAL 不可能存在，
-- 除非 prompt 與契約都部署了 —— 舊契約會把它當 INVALID_STATE 擋掉）。
--
-- 但 102 秒前的那一篇呢？資料庫裡【沒有任何欄位】分得出來：
--
--     model             兩次都是 deepseek-chat
--     taxonomy_version  那次沒動 taxonomy，沒變
--     started_at        只有時間，而部署時間不在資料庫裡
--
-- 於是那筆資料有兩種完全相反的解讀（新 prompt 判斷「沒有任何一項完全
-- 找不到做對的地方」vs 舊 prompt 根本沒有 MINIMAL 這個字彙），
-- 而我們剛好在它上面建了一個結論。
--
-- 這個欄位就是為了讓那件事不再發生。
--
-- ══════════════════════════════════════════════════════════════
-- 存的是什麼
-- ══════════════════════════════════════════════════════════════
--
--   'writing-v2-e780f008946a'
--    └─ taxonomy 版本  └─ 五支 pass 的 system prompt 的 sha256 前 12 碼
--
-- 🛑 是【算出來】的，不是手寫的版本號。
--    由 api/_lib/writingPrompts.ts 的 WRITING_PROMPT_VERSION 在模組載入時
--    對實際送出去的 system prompt 取雜湊。改了任何一個字指紋都會變，忘不掉。
--
--    既然這個欄位的目的是「分得出新舊」，它就不能有機會說謊 ——
--    手寫的常數總有一天會有人改了 prompt 忘記更新，那時欄位會說
--    「同一版」而實際上不是，而我們會像上次那樣相信它。
--
-- ⚠️ 指紋不可逆，看不出改了什麼。它只回答「是不是同一版」。
--    要知道差在哪，去比對 git 歷史。
--
-- ══════════════════════════════════════════════════════════════
-- ⚠️ 語意是「這次分析【開始時】的 prompt 版本」
-- ══════════════════════════════════════════════════════════════
--
--   Stage 1 可以跨請求續跑，而已經通過驗證的 pass【永遠不會重跑】。
--   所以如果部署剛好落在一次分析的中間（約 60–90 秒的窗），
--   已完成的那幾支用的是舊 prompt、重試的那幾支用的是新的 ——
--   這個欄位記的是前者。
--
--   選「開始時」而不是「最後一次請求時」，是因為續跑時大部分 pass
--   都是第一次請求跑完的，那個標籤對資料的主體更準確。
--   但它是【單一標籤】，描述不了混合的情況 —— 這一點要知道。
--
-- 🛑 既有的列會是 NULL，而且【不回填】。
--    回填就要猜，而「猜出來的版本號」正是這個欄位要消滅的東西。
--    NULL 的語意很明確：「這筆分析早於版本追蹤，不知道」。
-- =====================================================

ALTER TABLE public.writing_analyses
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;

COMMENT ON COLUMN public.writing_analyses.prompt_version IS
  '這次分析【開始時】的 prompt 內容指紋，格式 <taxonomy 版本>-<sha256 前 12 碼>，由 api/_lib/writingPrompts.ts 的 WRITING_PROMPT_VERSION 在模組載入時對五支 pass 的 system prompt 計算。🛑 算出來的，不是手寫版本號 —— 手寫的會有人忘記更新，而會說謊的版本欄位比沒有更糟。⚠️ 指紋不可逆，只回答「是不是同一版」。⚠️ Stage 1 跨請求續跑時已通過的 pass 不會重跑，所以部署落在分析中間的話這個欄位記的是開始時那一版，描述不了混合。NULL = 早於版本追蹤，不是「沒有 prompt」。';


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT '1. 欄位存在'                       AS "檢查項",
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'writing_analyses'
           AND column_name = 'prompt_version')                    AS "結果",
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'writing_analyses'
           AND column_name = 'prompt_version') = 1                AS "通過"

UNION ALL
SELECT '2. 可為 NULL（既有列不回填）',
       (SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'writing_analyses'
           AND column_name = 'prompt_version'),
       (SELECT is_nullable = 'YES' FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'writing_analyses'
           AND column_name = 'prompt_version')

UNION ALL
SELECT '3. 目前有版本標記的分析筆數（剛跑完應該是 0）',
       (SELECT count(*)::text FROM public.writing_analyses WHERE prompt_version IS NOT NULL),
       true

UNION ALL
SELECT '4. 既有分析總筆數（這些會是 NULL）',
       (SELECT count(*)::text FROM public.writing_analyses),
       true;
-- 判讀：第 3 列是 0 很正常 —— 要等前端部署後【新批改】的分析才會有值。
--       既有的 N 筆維持 NULL，那是刻意的。
