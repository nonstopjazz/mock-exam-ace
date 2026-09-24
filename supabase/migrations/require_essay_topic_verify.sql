-- =====================================================
-- 驗證題目必填有沒有裝上（唯讀，不改任何東西）
--
-- 🔴 兩個環境各跑一次：gsat-staging 與 production。
--
-- 在 require_essay_topic_1_text.sql 與 require_essay_topic_2_image.sql
-- 都執行完之後跑這一支。
-- =====================================================

-- ① 兩支函式都要有題目檢查 —— 兩行的「有題目檢查」都必須是 true
SELECT p.proname,
       (pg_get_functiondef(p.oid) LIKE '%請輸入題目說明%') AS "有題目檢查"
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('submit_writing_essay', 'create_writing_image_draft')
 ORDER BY p.proname;

-- ② 既有資料沒有被動到。
--    🛑 這句要在【執行前先跑一次記下數字】，執行後再跑一次比對。
--       這兩支本來就不該改任何一列，數字變了就是有問題。
--    2026-09-24 production 實測：執行前後皆為 39 / 49。
SELECT count(*) FILTER (WHERE essay_topic IS NULL) AS "題目為空",
       count(*)                                    AS "總數"
  FROM public.writing_submissions;
