-- 🟢 【唯讀】staging 與 production 都可以安全執行。
--
-- =====================================================
-- F  A9 自動同步的健康檢查
--
-- 怎麼分辨「A9 自動同步」與「手動回填」：
--
--   writing_error_findings.created_at 是【物化的時間】，不是作文的時間。
--   · 自動同步 → 分析標記 COMPLETED 之後【馬上】寫入，時間差是秒級
--   · 手動回填 → 全部集中在你按下 backfill 的那一刻，時間差是小時或天
--
--   所以「分析完成時間」與「findings 寫入時間」的差距，就分得出來是誰做的。
--
-- 判讀：
--   · 🔴「已完成但沒有 findings 列」> 0  → 有分析完成了卻沒物化。
--        A9 部署後不該再出現。出現的話看 Vercel log 找
--        「[analyze-writing] findings 同步失敗」。
--        ⚠️ 但「零錯誤的作文」本來就沒有列 —— 這一欄已經排除掉它們，
--           只算 error_analysis 裡真的有 findings 卻沒物化的。
--   · ⏱「秒級」的篇數 → A9 自動同步過的篇數
--   · 📦「小時級以上」的篇數 → 手動回填的篇數（部署前的全部都會是這一類）
-- =====================================================
WITH latest AS (
  SELECT DISTINCT ON (a.essay_id)
         a.essay_id, a.id AS analysis_id, a.completed_at, a.error_analysis
    FROM public.writing_analyses a
   WHERE a.status = 'COMPLETED'
   ORDER BY a.essay_id, a.analysis_version DESC),
shaped AS (
  SELECT l.*,
         CASE WHEN jsonb_typeof(l.error_analysis -> 'findings') = 'array'
              THEN jsonb_array_length(l.error_analysis -> 'findings') ELSE 0 END AS jsonb_findings,
         (SELECT count(*) FROM public.writing_error_findings f
           WHERE f.essay_id = l.essay_id)                                        AS table_findings,
         (SELECT min(f.created_at) FROM public.writing_error_findings f
           WHERE f.essay_id = l.essay_id)                                        AS materialised_at
    FROM latest l)
SELECT CASE
         WHEN s.jsonb_findings > 0 AND s.table_findings = 0
           THEN '🔴 已完成但沒有 findings 列（不該出現）'
         WHEN s.jsonb_findings = 0
           THEN '⚪ 零錯誤的作文（本來就沒有列）'
         WHEN s.completed_at IS NULL OR s.materialised_at IS NULL
           THEN '❓ 缺時間戳，無法判斷'
         WHEN s.materialised_at - s.completed_at < interval '5 minutes'
           THEN '⏱ 秒級 → A9 自動同步'
         ELSE '📦 小時級以上 → 手動回填'
       END                                        AS "物化來源",
       count(*)::int                              AS "作文數",
       min(s.completed_at)::date                  AS "最早分析完成",
       max(s.completed_at)::date                  AS "最晚分析完成"
  FROM shaped s
 GROUP BY 1
 ORDER BY 1;
