-- 🛑 唯讀。可以在 staging 也可以在 production 跑。
-- 🛑 這個檔案有【兩段】查詢，Supabase SQL Editor 只顯示最後一段的結果。
--    請分開貼：先貼 ①，看完結果再貼 ②。

-- =====================================================
-- V4d ① 各 taxonomy 版本的分佈（唯讀）
--
-- 為什麼要看：
--   跨篇統計會把不同 taxonomy 版本的 findings 加在一起數。
--   code 名稱相同【不代表定義相同】—— 同一個 WRITE_ERR_* 在不同版本的邊界
--   可能不一樣，而且舊版本可能根本偵測不到某些錯誤。
--   若舊版本系統性地少抓，那些學生會在「錯誤追蹤」裡看起來很乾淨，
--   而那是工具的問題，不是學生的程度。
--
-- 判讀：
--   * 只有一個版本 → 沒有這個問題，可以往下走。
--   * 有多個版本 → 比較各版本的「平均每篇 findings」。
--     差距很大就代表不能混在一起統計，A4–A7 需要能篩選或標記版本。
--   * 「沒有coverage_source的筆數」> 0 → 那些分析產生於
--     coverage 改成伺服器推導之前，屬於更舊的管線。
-- =====================================================
SELECT coalesce(a.error_analysis ->> 'taxonomy_version', '（沒有這個欄位）') AS "taxonomy版本",
       count(*)::int                        AS "分析數",
       count(DISTINCT a.essay_id)::int      AS "作文數",
       sum(jsonb_array_length(coalesce(a.error_analysis -> 'findings','[]'::jsonb)))::int
                                            AS "findings總數",
       round(sum(jsonb_array_length(coalesce(a.error_analysis -> 'findings','[]'::jsonb)))::numeric
             / nullif(count(*), 0), 1)      AS "平均每篇findings",
       min(a.completed_at)::date            AS "最早",
       max(a.completed_at)::date            AS "最晚",
       count(*) FILTER (WHERE a.error_analysis ->> 'coverage_source' IS NULL)::int
                                            AS "沒有coverage_source的筆數"
  FROM public.writing_analyses a
 WHERE a.status = 'COMPLETED'
 GROUP BY 1
 ORDER BY 2 DESC;


-- =====================================================
-- V4d ② 舊版本的 coverage 少了哪些 code（唯讀）
--
-- 只有在 ① 顯示存在 writing-v1 時才需要跑。
-- 少掉的 code 代表：那個版本的分析【不可能】回報這一類錯誤，
-- 所以在跨篇統計裡，舊分析的那一類永遠是 0 —— 那是缺資料，不是沒犯錯。
-- =====================================================
-- WITH all17(code) AS (VALUES
--   ('WRITE_ERR_ARTICLE'),('WRITE_ERR_CHINGLISH'),('WRITE_ERR_COUNTABILITY'),
--   ('WRITE_ERR_DISCOURSE_STRUCTURE'),('WRITE_ERR_FRAGMENT'),('WRITE_ERR_GRAMMAR_OTHER'),
--   ('WRITE_ERR_NUMBER'),('WRITE_ERR_PREP_CLAUSE'),('WRITE_ERR_PRONOUN'),
--   ('WRITE_ERR_PUNCTUATION'),('WRITE_ERR_RUN_ON'),('WRITE_ERR_SPELLING'),
--   ('WRITE_ERR_SV_AGREEMENT'),('WRITE_ERR_THAT'),('WRITE_ERR_TRANSITIVITY'),
--   ('WRITE_ERR_WORD_BOUNDARY'),('WRITE_ERR_WORD_CLASS')),
-- v1cov AS (
--   SELECT DISTINCT c ->> 'code' AS code
--     FROM public.writing_analyses a
--     CROSS JOIN LATERAL jsonb_array_elements(
--       coalesce(a.error_analysis -> 'coverage','[]'::jsonb)) c
--    WHERE a.status='COMPLETED'
--      AND a.error_analysis ->> 'taxonomy_version' = 'writing-v1')
-- SELECT a.code AS "v2 有但 v1 的 coverage 沒有的 code"
--   FROM all17 a LEFT JOIN v1cov v ON v.code = a.code
--  WHERE v.code IS NULL ORDER BY 1;
