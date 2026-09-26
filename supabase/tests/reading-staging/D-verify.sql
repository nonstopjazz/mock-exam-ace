-- =====================================================
-- 匯入後驗證（小批次之後跑一次，296 篇全匯完再跑一次）
-- 🟢 【唯讀】不改任何資料。
--
-- 判讀：
--   「不變量」那幾列的結果欄【全部】要是 ✅ —— 任何批次大小都必須成立。
--   「實際數量」那幾列在 296 篇匯完之後，要與 dry-run 的預測一致：
--
--     文章 296 · 題目 1746 · 答案 1746 · 段落 1276 · 詞彙 2681
--     micro-skill 5238（其中 emphasis 為 NULL 548）
--     六題完整 282 · 不足六題 14
--
--   小批次階段數字當然比較小，看「不變量」就好。
-- =====================================================

WITH
n AS (
  SELECT
    (SELECT count(*) FROM reading_passages)            AS passages,
    (SELECT count(*) FROM reading_questions)           AS questions,
    (SELECT count(*) FROM reading_question_keys)       AS keys,
    (SELECT count(*) FROM reading_passage_paragraphs)  AS paragraphs,
    (SELECT count(*) FROM reading_passage_vocab)       AS vocab,
    (SELECT count(*) FROM reading_question_skills)     AS skills,
    (SELECT count(*) FROM reading_question_skills WHERE emphasis IS NULL) AS emph_null,
    (SELECT count(*) FROM reading_passages p
      WHERE (reading_publish_readiness(p.passage_id) ->> 'ready')::boolean) AS ready
),

counts(排序, 區塊, 項目, 實際, 「296篇時的預測」) AS (
  SELECT 1,'D1 實際數量','文章 passages',        passages::text,   '296'  FROM n
  UNION ALL SELECT 2,'D1 實際數量','題目 questions',      questions::text, '1746' FROM n
  UNION ALL SELECT 3,'D1 實際數量','答案 question_keys',  keys::text,      '1746' FROM n
  UNION ALL SELECT 4,'D1 實際數量','段落 paragraphs',     paragraphs::text,'1276' FROM n
  UNION ALL SELECT 5,'D1 實際數量','詞彙 vocab',          vocab::text,     '2681' FROM n
  UNION ALL SELECT 6,'D1 實際數量','micro-skill',         skills::text,    '5238' FROM n
  UNION ALL SELECT 7,'D1 實際數量','　其中 emphasis 為 NULL', emph_null::text, '548' FROM n
  UNION ALL SELECT 8,'D1 實際數量','六題完整（可上架）',  ready::text,     '282'  FROM n
  UNION ALL SELECT 9,'D1 實際數量','不足六題（DRAFT）',   (passages - ready)::text, '14' FROM n
  -- ⚠️ 中途一定不是 0：批次要等最後一份帶 p_final 才收尾。
  --    全部匯完之後才該是 0。
  UNION ALL SELECT 10,'D1 實際數量','未收尾的批次（全匯完才該是 0）',
         (SELECT count(*) FROM reading_import_batches WHERE status='IN_PROGRESS')::text, '0'
),

inv(排序, 區塊, 項目, 期望, 實際) AS (
  -- 每一題【剛好】一個答案。少了學生答不了，多了資料壞了。
  SELECT 20,'D2 不變量','每一題都剛好有一個答案','一致',
         CASE WHEN (SELECT questions FROM n) = (SELECT keys FROM n)
              THEN '一致' ELSE '🛑 題目 ' || (SELECT questions FROM n)
                              || ' ≠ 答案 ' || (SELECT keys FROM n) END
  UNION ALL
  -- 🛑 0 題的文章不該存在——那是 blocked，根本不該進來
  SELECT 21,'D2 不變量','沒有任何 0 題的文章','0 篇',
         (SELECT count(*) FROM reading_passages p
           WHERE NOT EXISTS (SELECT 1 FROM reading_questions q
                              WHERE q.passage_id = p.passage_id))::text || ' 篇'
  UNION ALL
  -- 同一篇同一個 construct 不可能兩題（有 UNIQUE，這裡再確認一次）
  SELECT 22,'D2 不變量','沒有一篇的同一個 construct 出現兩題','0 組',
         (SELECT count(*) FROM (
            SELECT passage_id, construct FROM reading_questions
             GROUP BY 1,2 HAVING count(*) > 1) x)::text || ' 組'
  UNION ALL
  -- 匯入不負責上架
  SELECT 23,'D2 不變量','匯入之後沒有任何文章是 PUBLISHED','0 篇',
         (SELECT count(*) FROM reading_passages WHERE status <> 'DRAFT')::text || ' 篇'
  UNION ALL
  -- 段落編號、詞彙層級都在值域內（CHECK 擋得住，這裡確認資料真的乾淨）
  SELECT 24,'D2 不變量','段落編號都在 1–20','0 筆越界',
         (SELECT count(*) FROM reading_passage_paragraphs
           WHERE paragraph_no < 1 OR paragraph_no > 20)::text || ' 筆越界'
  UNION ALL
  -- 🛑 emphasis 的 NULL 沒有被寫成 0
  SELECT 25,'D2 不變量','沒有 emphasis = 0 的 micro-skill（NULL ≠ 0）','0 筆',
         (SELECT count(*) FROM reading_question_skills WHERE emphasis = 0)::text || ' 筆'
  UNION ALL
  -- 🛑 答案表對學生仍然完全不可讀
  SELECT 26,'D3 答案安全','authenticated 讀不到 reading_question_keys','不可讀',
         CASE WHEN has_table_privilege('authenticated','public.reading_question_keys','SELECT')
              THEN '🛑 可讀' ELSE '不可讀' END
  UNION ALL
  SELECT 27,'D3 答案安全','reading_question_keys 沒有 authenticated policy','0 條',
         (SELECT count(*) FROM pg_policies
           WHERE schemaname='public' AND tablename='reading_question_keys'
             AND 'authenticated' = ANY(roles))::text || ' 條'
  UNION ALL
  -- 🛑 正解沒有被抄進學生讀得到的表
  SELECT 28,'D3 答案安全','reading_questions 沒有任何存答案的欄位','0 欄',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='reading_questions'
             AND column_name ~ 'answer|correct|explanation')::text || ' 欄'
)

SELECT 區塊, 項目, 期望 AS "期望／預測", 實際,
       CASE WHEN 期望 = 實際 THEN '✅' ELSE '🛑 FAIL' END AS 結果
  FROM inv
UNION ALL
SELECT 區塊, 項目, 「296篇時的預測」, 實際,
       CASE WHEN 實際 = 「296篇時的預測」 THEN '✅ 與 dry-run 一致'
            ELSE 'ℹ️ 看批次大小' END
  FROM counts
 ORDER BY 1, 2;
