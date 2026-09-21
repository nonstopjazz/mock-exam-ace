-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🛑 唯讀。

-- =====================================================
-- V10 Common Errors —— 「哪些錯誤值得下一堂課全班統一講解」
--
-- 這是 A4 (writing_admin_error_overview) 將來要包成 RPC 的核心查詢。
--
-- ⚠️ 排序刻意用「學生數」而不是「findings 數」：
--    老師要的是「多少人需要聽這堂課」，不是「總共錯了幾次」。
--    一個學生錯 20 次不構成全班講解的理由。
--
-- ⚠️ WRITE_ERR_GRAMMAR_OTHER 照常列出，只標記為低訊號。
--    它是已知被濫用的 fallback（混了多種真實錯誤類別），
--    但老師的需求是「不要漏掉任何錯」，所以【標記而不隱藏】。
--    看到它排前面時，正確的反應是點開看實際例句，不是當成一個教學主題。
-- =====================================================
SELECT error_code                       AS "error_code",
       count(DISTINCT student_id)::int  AS "學生數",
       count(DISTINCT essay_id)::int    AS "作文數",
       count(*)::int                    AS "findings數",
       round(count(*)::numeric
             / nullif(count(DISTINCT essay_id), 0), 2) AS "每篇密度",
       max(essay_submitted_at)::date    AS "最近一次",
       is_fallback_code                 AS "低訊號"
  FROM public.writing_error_findings
 GROUP BY error_code, is_fallback_code
 ORDER BY 2 DESC, 4 DESC, 1;
