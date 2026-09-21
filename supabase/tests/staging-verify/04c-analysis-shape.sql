-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🛑 唯讀。只在 gsat-staging 執行。

-- =====================================================
-- V4c 逐篇檢查分析的形狀（唯讀）
--
-- 為什麼需要這一支：
--
--   04-totals 顯示「零錯誤作文數」> 0 的時候，有兩種完全不同的可能：
--     (a) 真的沒發現錯誤 —— 正常，好作文
--     (b) findings 是空的，但 coverage 說有錯 —— 【形狀有問題，資料在流失】
--   兩者在總量統計上長得一模一樣，必須逐篇看才分得出來。
--
--   coverage 是 SERVER_DERIVED 的，由 findings 推導而來，
--   所以 sum(coverage.count) 理論上應該【等於】findings 的數量。
--
-- 判讀（順序很重要，先看 coverage項數）：
--
--   1. 「coverage項數」全部是 0
--      → 這批分析【根本沒有寫 coverage】，「兩者一致」那一欄就沒有意義，
--        不要當成警訊。改看 findings數 本身，並到 writing_analyses 直接看那幾篇。
--
--   2. 「coverage項數」> 0 時，「兩者一致」必須是 true。
--      false → findings 與 coverage 對不起來，【停下來查清楚】，不要往 production 推。
--
--   3. 「findings數 = 0」且「coverage項數 > 0」且「coverage_count總和 = 0」
--      → 真的零錯誤，正常。⚠️ 但這【不代表學生已精熟】（TR-12／TR-13）。
--
--   4. 「字數」異常小（例如 1）
--      → word_count 是以空白切分的，中文沒有空白會整串算成 1 個字。
--        通常代表那一篇不是英文作文。這種篇數不能拿來算 errors per 100 words。
--
--   5. 「taxonomy」若出現一個以上的版本 → 見下方說明。
--
-- ⚠️ 關於 taxonomy 版本混用
--   跨篇統計會把不同 taxonomy 版本的 findings 放在一起數。
--   code 名稱相同不代表定義相同 —— 同一個 WRITE_ERR_* 在 v1 與 v2 的邊界
--   可能不一樣。若這裡出現多個版本，A4–A7 的查詢需要能夠篩選或標記版本。
-- =====================================================
WITH latest AS (
  SELECT DISTINCT ON (a.essay_id)
         a.essay_id, a.analysis_version, a.error_analysis
    FROM public.writing_analyses a
   WHERE a.status = 'COMPLETED'
   ORDER BY a.essay_id, a.analysis_version DESC)
SELECT l.essay_id,
       l.analysis_version                                  AS "版次",
       l.error_analysis ->> 'taxonomy_version'             AS "taxonomy",
       jsonb_array_length(coalesce(l.error_analysis -> 'findings','[]'::jsonb)) AS "findings數",
       jsonb_array_length(coalesce(l.error_analysis -> 'coverage','[]'::jsonb)) AS "coverage項數",
       coalesce((SELECT sum((c ->> 'count')::int)
                   FROM jsonb_array_elements(
                     coalesce(l.error_analysis -> 'coverage','[]'::jsonb)) c), 0) AS "coverage_count總和",
       (jsonb_array_length(coalesce(l.error_analysis -> 'findings','[]'::jsonb))
        = coalesce((SELECT sum((c ->> 'count')::int)
                      FROM jsonb_array_elements(
                        coalesce(l.error_analysis -> 'coverage','[]'::jsonb)) c), 0)) AS "兩者一致",
       (SELECT wt.word_count FROM public.writing_texts wt
         WHERE wt.essay_id = l.essay_id
         ORDER BY wt.created_at DESC, wt.id DESC LIMIT 1)   AS "字數",
       l.error_analysis ->> 'coverage_source'              AS "coverage來源"
  FROM latest l
 ORDER BY 4 DESC, 1;
