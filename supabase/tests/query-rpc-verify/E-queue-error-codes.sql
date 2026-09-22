-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- ⚠️ 開頭這一段是【在 SQL Editor 裡取得管理員身分】。
--    SQL Editor 沒有 JWT，auth.uid() 是 NULL、is_admin() 回 NULL，
--    writing_admin_queue() 會回 42501「僅限管理員」—— 看起來像壞了，其實沒有。
--    這一行不改資料、不改權限，只讓應用層的 is_admin() 判斷能通過。
SELECT set_config('request.jwt.claim.sub',
                  (SELECT id::text FROM auth.users WHERE email = 'nonstopjazz@gmail.com'),
                  false) AS "已取得管理員身分";

-- =====================================================
-- E  A8 驗收：writing_admin_queue() 的 error_codes
--
-- 判讀：
--   · 「錯誤資料狀態」不應該出現『🔴 NULL 但分析已完成』—— 那代表
--      有已完成的分析卻拿不到 error_codes，是 bug。
--   · 『⚪ 已完成・未發現錯誤』是正常的（好作文），
--      🛑 但【不代表學生已經精熟】（TR-12／TR-13）。
--   · 『🔴 NULL（沒有已完成的分析）』對還沒分析或分析失敗的作文是正常的。
--   · 「班級」欄位應該還在 —— 確認 A8 沒有把 left_at 修正一起覆蓋掉。
-- =====================================================
SELECT
  CASE
    WHEN q -> 'error_codes' = 'null'::jsonb AND q ->> 'analysis_status' = 'COMPLETED'
      THEN '🔴 NULL 但分析已完成（不該出現）'
    WHEN q -> 'error_codes' = 'null'::jsonb
      THEN '🔴 NULL（沒有已完成的分析）'
    WHEN q -> 'error_codes' = '[]'::jsonb
      THEN '⚪ 已完成・未發現錯誤'
    ELSE '✅ 有錯誤資料'
  END                                                   AS "錯誤資料狀態",
  count(*)::int                                         AS "作文數",
  round(avg(jsonb_array_length(
    CASE WHEN jsonb_typeof(q -> 'error_codes') = 'array'
         THEN q -> 'error_codes' ELSE '[]'::jsonb END)), 1) AS "平均幾種code"
FROM jsonb_array_elements(public.writing_admin_queue()) q
GROUP BY 1
ORDER BY 1;
