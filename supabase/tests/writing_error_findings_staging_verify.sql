-- =====================================================
-- Phase 1A 第 1 批（A1–A3）staging 驗證
-- 純 SQL，可直接貼進 Supabase SQL Editor
--
-- ⚠️ 刻意不使用 psql 反斜線指令（\echo / \set / \ir），也不依賴 RAISE NOTICE
--    —— Supabase SQL Editor 送出的是純 SQL，而且不顯示 NOTICE。
--
-- ⚠️ Supabase SQL Editor【只顯示最後一個查詢的結果】。
--    所以這個檔案分成 V0–V9 九個區塊，請【一次貼一個區塊】。
--
-- 🛑 只在 gsat-staging 執行。V1/V2/V3 會改變資料庫。
--    其餘區塊（V0、V4–V9）都是唯讀。
-- =====================================================


-- =====================================================
-- V0 前置檢查（唯讀）
--
-- 判讀：「通過」欄全部是 true 才往下走。
--       特別注意 findings表已存在 —— 若是 true，代表之前已經跑過，
--       要先確認是不是同一版，不要盲目重跑。
-- =====================================================
SELECT '1. writing_analyses 存在'  AS "檢查項",
       (to_regclass('public.writing_analyses') IS NOT NULL)::text AS "結果",
       (to_regclass('public.writing_analyses') IS NOT NULL)       AS "通過"
UNION ALL SELECT '2. writing_submissions 存在',
       (to_regclass('public.writing_submissions') IS NOT NULL)::text,
       (to_regclass('public.writing_submissions') IS NOT NULL)
UNION ALL SELECT '3. writing_texts 存在',
       (to_regclass('public.writing_texts') IS NOT NULL)::text,
       (to_regclass('public.writing_texts') IS NOT NULL)
UNION ALL SELECT '4. writing_texts.word_count 欄位存在',
       (EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='writing_texts'
                   AND column_name='word_count'))::text,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='writing_texts'
                  AND column_name='word_count')
UNION ALL SELECT '5. findings表已存在（預期 false＝還沒跑過）',
       (to_regclass('public.writing_error_findings') IS NOT NULL)::text,
       (to_regclass('public.writing_error_findings') IS NULL)
UNION ALL SELECT '6. COMPLETED 分析數',
       (SELECT count(*) FROM public.writing_analyses WHERE status='COMPLETED')::text,
       (SELECT count(*) FROM public.writing_analyses WHERE status='COMPLETED') > 0
UNION ALL SELECT '7. 有 COMPLETED 的作文數',
       (SELECT count(DISTINCT essay_id) FROM public.writing_analyses WHERE status='COMPLETED')::text,
       true
UNION ALL SELECT '8. 這些作文的 findings 形狀全部正確',
       (SELECT count(*) FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
         WHERE jsonb_typeof(t.error_analysis -> 'findings') IS DISTINCT FROM 'array')::text
         || ' 篇形狀異常',
       (SELECT count(*) FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
         WHERE jsonb_typeof(t.error_analysis -> 'findings') IS DISTINCT FROM 'array') = 0
UNION ALL SELECT '9. 沒有超出 17 個 code 的錯誤碼',
       (SELECT count(DISTINCT f ->> 'code') FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.error_analysis -> 'findings')='array'
               THEN t.error_analysis -> 'findings' ELSE '[]'::jsonb END) f
        WHERE f ->> 'code' NOT IN (
          'WRITE_ERR_ARTICLE','WRITE_ERR_CHINGLISH','WRITE_ERR_COUNTABILITY',
          'WRITE_ERR_DISCOURSE_STRUCTURE','WRITE_ERR_FRAGMENT','WRITE_ERR_GRAMMAR_OTHER',
          'WRITE_ERR_NUMBER','WRITE_ERR_PREP_CLAUSE','WRITE_ERR_PRONOUN',
          'WRITE_ERR_PUNCTUATION','WRITE_ERR_RUN_ON','WRITE_ERR_SPELLING',
          'WRITE_ERR_SV_AGREEMENT','WRITE_ERR_THAT','WRITE_ERR_TRANSITIVITY',
          'WRITE_ERR_WORD_BOUNDARY','WRITE_ERR_WORD_CLASS'))::text || ' 個未知 code',
       (SELECT count(DISTINCT f ->> 'code') FROM (
          SELECT DISTINCT ON (a.essay_id) a.error_analysis
            FROM public.writing_analyses a WHERE a.status='COMPLETED'
           ORDER BY a.essay_id, a.analysis_version DESC) t
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.error_analysis -> 'findings')='array'
               THEN t.error_analysis -> 'findings' ELSE '[]'::jsonb END) f
        WHERE f ->> 'code' NOT IN (
          'WRITE_ERR_ARTICLE','WRITE_ERR_CHINGLISH','WRITE_ERR_COUNTABILITY',
          'WRITE_ERR_DISCOURSE_STRUCTURE','WRITE_ERR_FRAGMENT','WRITE_ERR_GRAMMAR_OTHER',
          'WRITE_ERR_NUMBER','WRITE_ERR_PREP_CLAUSE','WRITE_ERR_PRONOUN',
          'WRITE_ERR_PUNCTUATION','WRITE_ERR_RUN_ON','WRITE_ERR_SPELLING',
          'WRITE_ERR_SV_AGREEMENT','WRITE_ERR_THAT','WRITE_ERR_TRANSITIVITY',
          'WRITE_ERR_WORD_BOUNDARY','WRITE_ERR_WORD_CLASS')) = 0
ORDER BY 1;


-- =====================================================
-- V1  執行 supabase/migrations/create_writing_error_findings.sql
-- V2  執行 supabase/migrations/create_writing_error_findings_sync.sql
--     （這兩個區塊不在本檔內，直接貼那兩個 migration 檔）
-- =====================================================


-- =====================================================
-- V3 回填（會寫入）
-- 44 篇一批跑得完。若 remaining > 0，帶 last_essay_id 再跑一次。
-- =====================================================
SELECT jsonb_pretty(public.writing_backfill_error_findings(200)) AS "回填結果";


-- =====================================================
-- V4 總量統計（唯讀）
-- =====================================================
SELECT '物化的 findings 總數'        AS "項目", count(*)::text AS "值"
  FROM public.writing_error_findings
UNION ALL SELECT '涵蓋的作文數', count(DISTINCT essay_id)::text
  FROM public.writing_error_findings
UNION ALL SELECT '涵蓋的學生數', count(DISTINCT student_id)::text
  FROM public.writing_error_findings
UNION ALL SELECT '有 COMPLETED 的作文數（分母）',
       (SELECT count(DISTINCT essay_id) FROM public.writing_analyses WHERE status='COMPLETED')::text
UNION ALL SELECT '零錯誤作文數（有分析但 0 findings）',
       ((SELECT count(DISTINCT essay_id) FROM public.writing_analyses WHERE status='COMPLETED')
        - (SELECT count(DISTINCT essay_id) FROM public.writing_error_findings))::text
UNION ALL SELECT 'GRAMMAR_OTHER 筆數（is_fallback_code）',
       (SELECT count(*) FROM public.writing_error_findings WHERE is_fallback_code)::text
UNION ALL SELECT 'essay_word_count 是 NULL 的筆數（應為 0）',
       (SELECT count(*) FROM public.writing_error_findings WHERE essay_word_count IS NULL)::text
UNION ALL SELECT 'essay_topic 是 NULL 的筆數（可能 > 0，題目是選填）',
       (SELECT count(*) FROM public.writing_error_findings WHERE essay_topic IS NULL)::text
UNION ALL SELECT 'taxonomy_version 種類',
       (SELECT string_agg(DISTINCT taxonomy_version, ', ') FROM public.writing_error_findings)
ORDER BY 1;


-- =====================================================
-- V4b 17 個 code 各有多少筆（唯讀）
-- 應與回填前直接查 JSONB 的分布完全相同
-- =====================================================
SELECT error_code                       AS "error_code",
       count(DISTINCT student_id)::int  AS "學生數",
       count(DISTINCT essay_id)::int    AS "作文數",
       count(*)::int                    AS "findings數",
       is_fallback_code                 AS "低訊號"
  FROM public.writing_error_findings
 GROUP BY error_code, is_fallback_code
 ORDER BY 3 DESC, 4 DESC;


-- =====================================================
-- V5 逐筆比對 JSONB 與 findings 表（唯讀）
--
-- 🔴 這是最重要的一段。它【不是抽查】—— 它比對全部 420 筆的每一個欄位。
--    抽查 5 篇只能證明 5 篇；這一段證明沒有任何一筆對不上。
--
-- 判讀：每一列的「筆數」都必須是 0。
-- =====================================================
WITH latest AS (
  SELECT DISTINCT ON (a.essay_id)
         a.essay_id, a.id AS analysis_id, a.analysis_version, a.error_analysis
    FROM public.writing_analyses a
   WHERE a.status = 'COMPLETED'
   ORDER BY a.essay_id, a.analysis_version DESC),
src AS (
  SELECT l.essay_id, l.analysis_id, l.analysis_version,
         (t.ord - 1)::int  AS finding_index,
         t.f ->> 'code'          AS error_code,
         t.f ->> 'quote'         AS quote,
         t.f ->> 'reason'        AS reason,
         t.f ->> 'correction'    AS correction,
         t.f ->> 'primary_skill' AS primary_skill
    FROM latest l
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(l.error_analysis -> 'findings')='array'
           THEN l.error_analysis -> 'findings' ELSE '[]'::jsonb END)
      WITH ORDINALITY AS t(f, ord))
SELECT '01. JSONB 有但表裡沒有'  AS "不一致類型",
       (SELECT count(*) FROM src s
         WHERE NOT EXISTS (SELECT 1 FROM public.writing_error_findings f
                            WHERE f.essay_id=s.essay_id AND f.finding_index=s.finding_index))::int AS "筆數"
UNION ALL SELECT '02. 表裡有但 JSONB 沒有',
       (SELECT count(*) FROM public.writing_error_findings f
         WHERE NOT EXISTS (SELECT 1 FROM src s
                            WHERE s.essay_id=f.essay_id AND s.finding_index=f.finding_index))::int
UNION ALL SELECT '03. error_code 不一致',
       (SELECT count(*) FROM src s JOIN public.writing_error_findings f
          ON f.essay_id=s.essay_id AND f.finding_index=s.finding_index
        WHERE f.error_code IS DISTINCT FROM s.error_code)::int
UNION ALL SELECT '04. quote 不一致',
       (SELECT count(*) FROM src s JOIN public.writing_error_findings f
          ON f.essay_id=s.essay_id AND f.finding_index=s.finding_index
        WHERE f.quote IS DISTINCT FROM s.quote)::int
UNION ALL SELECT '05. correction 不一致',
       (SELECT count(*) FROM src s JOIN public.writing_error_findings f
          ON f.essay_id=s.essay_id AND f.finding_index=s.finding_index
        WHERE f.correction IS DISTINCT FROM s.correction)::int
UNION ALL SELECT '06. reason 不一致',
       (SELECT count(*) FROM src s JOIN public.writing_error_findings f
          ON f.essay_id=s.essay_id AND f.finding_index=s.finding_index
        WHERE f.reason IS DISTINCT FROM s.reason)::int
UNION ALL SELECT '07. primary_skill 不一致',
       (SELECT count(*) FROM src s JOIN public.writing_error_findings f
          ON f.essay_id=s.essay_id AND f.finding_index=s.finding_index
        WHERE f.primary_skill IS DISTINCT FROM s.primary_skill)::int
UNION ALL SELECT '08. analysis_version 不一致',
       (SELECT count(*) FROM src s JOIN public.writing_error_findings f
          ON f.essay_id=s.essay_id AND f.finding_index=s.finding_index
        WHERE f.analysis_version IS DISTINCT FROM s.analysis_version)::int
UNION ALL SELECT '09. analysis_id 不一致',
       (SELECT count(*) FROM src s JOIN public.writing_error_findings f
          ON f.essay_id=s.essay_id AND f.finding_index=s.finding_index
        WHERE f.analysis_id IS DISTINCT FROM s.analysis_id)::int
UNION ALL SELECT '10. student_id 與 submissions 不符',
       (SELECT count(*) FROM public.writing_error_findings f
          JOIN public.writing_submissions w ON w.id=f.essay_id
        WHERE f.student_id IS DISTINCT FROM w.student_id)::int
UNION ALL SELECT '11. essay_topic 與 submissions 不符',
       (SELECT count(*) FROM public.writing_error_findings f
          JOIN public.writing_submissions w ON w.id=f.essay_id
        WHERE f.essay_topic IS DISTINCT FROM w.essay_topic)::int
UNION ALL SELECT '12. essay_submitted_at 與 submissions 不符',
       (SELECT count(*) FROM public.writing_error_findings f
          JOIN public.writing_submissions w ON w.id=f.essay_id
        WHERE f.essay_submitted_at IS DISTINCT FROM coalesce(w.submitted_at, w.created_at))::int
UNION ALL SELECT '13. essay_word_count 與 writing_texts 最新版不符',
       (SELECT count(*) FROM public.writing_error_findings f
        WHERE f.essay_word_count IS DISTINCT FROM (
          SELECT wt.word_count FROM public.writing_texts wt
           WHERE wt.essay_id=f.essay_id ORDER BY wt.created_at DESC LIMIT 1))::int
ORDER BY 1;


-- =====================================================
-- V5b 抽查 5 篇的實際內容（唯讀）
-- V5 已經全量比對過，這一段是給人眼看的
-- =====================================================
WITH pick AS (
  SELECT DISTINCT essay_id FROM public.writing_error_findings
   ORDER BY essay_id LIMIT 5)
SELECT f.essay_id,
       f.finding_index                    AS "序",
       f.error_code                       AS "code",
       left(f.quote, 40)                  AS "原文",
       left(f.correction, 40)             AS "修正",
       left(f.reason, 30)                 AS "說明",
       f.essay_word_count                 AS "字數",
       f.analysis_version                 AS "版次"
  FROM public.writing_error_findings f
  JOIN pick p ON p.essay_id = f.essay_id
 ORDER BY f.essay_id, f.finding_index;


-- =====================================================
-- V6 三個特別驗證（唯讀）
-- 判讀：「通過」全部是 true
-- =====================================================
WITH latest AS (
  SELECT DISTINCT ON (a.essay_id) a.essay_id, a.error_analysis
    FROM public.writing_analyses a WHERE a.status='COMPLETED'
   ORDER BY a.essay_id, a.analysis_version DESC),
src_dup AS (   -- JSONB 裡「同一篇 + 同 code」出現多次的組合
  SELECT l.essay_id, f ->> 'code' AS code, count(*) AS n
    FROM latest l
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(l.error_analysis -> 'findings')='array'
           THEN l.error_analysis -> 'findings' ELSE '[]'::jsonb END) f
   GROUP BY 1,2 HAVING count(*) > 1),
tbl_dup AS (
  SELECT essay_id, error_code AS code, count(*) AS n
    FROM public.writing_error_findings GROUP BY 1,2 HAVING count(*) > 1)
SELECT '6a 同一篇同 code 多筆：JSONB 的組合數' AS "檢查項",
       (SELECT count(*) FROM src_dup)::text    AS "值",
       true                                    AS "通過"
UNION ALL SELECT '6a 同一篇同 code 多筆：表裡的組合數',
       (SELECT count(*) FROM tbl_dup)::text,
       (SELECT count(*) FROM src_dup) = (SELECT count(*) FROM tbl_dup)
UNION ALL SELECT '6a 每一組的筆數都完全相同（沒有被去重）',
       (SELECT count(*) FROM src_dup s FULL JOIN tbl_dup t
          ON t.essay_id=s.essay_id AND t.code=s.code
        WHERE s.n IS DISTINCT FROM t.n)::text || ' 組不符',
       (SELECT count(*) FROM src_dup s FULL JOIN tbl_dup t
          ON t.essay_id=s.essay_id AND t.code=s.code
        WHERE s.n IS DISTINCT FROM t.n) = 0
-- 6b：production 2026-09-20 量到的是 0 —— 這個情境還沒發生過。
--     staging 若也是 0，代表【這一項在真實資料上無從驗證】，
--     由本機測試的 S1 / S17 以構造資料涵蓋（那兩條是決定性的）。
--     若 > 0，則下一列必須 > 0：那些作文的 findings 必須還在。
UNION ALL SELECT '6b 存在「較新 FAILED 蓋過較舊 COMPLETED」的作文數',
       (SELECT count(DISTINCT a.essay_id) FROM public.writing_analyses a
         WHERE a.status <> 'COMPLETED'
           AND EXISTS (SELECT 1 FROM public.writing_analyses b
                        WHERE b.essay_id=a.essay_id AND b.status='COMPLETED'
                          AND b.analysis_version < a.analysis_version))::text,
       true
UNION ALL SELECT '6b 這些作文的 findings 仍然在（沒被清掉）',
       (SELECT count(*) FROM public.writing_error_findings f
         WHERE EXISTS (SELECT 1 FROM public.writing_analyses a
                        WHERE a.essay_id=f.essay_id AND a.status <> 'COMPLETED'
                          AND EXISTS (SELECT 1 FROM public.writing_analyses b
                                       WHERE b.essay_id=a.essay_id AND b.status='COMPLETED'
                                         AND b.analysis_version < a.analysis_version)))::text
       || ' 筆',
       true
UNION ALL SELECT '6c 表裡沒有重複的 (essay_id, finding_index)',
       (SELECT count(*) FROM (SELECT essay_id, finding_index FROM public.writing_error_findings
                               GROUP BY 1,2 HAVING count(*) > 1) d)::text || ' 組',
       (SELECT count(*) FROM (SELECT essay_id, finding_index FROM public.writing_error_findings
                               GROUP BY 1,2 HAVING count(*) > 1) d) = 0
ORDER BY 1;


-- =====================================================
-- V6c 冪等：記下現況，再跑一次回填，比對（會寫入，但結果應該不變）
-- 先跑這一段記下數字 ↓
-- =====================================================
SELECT count(*)::int                                  AS "回填前_總筆數",
       md5(string_agg(essay_id::text || ':' || finding_index::text || ':' || error_code,
                      '|' ORDER BY essay_id, finding_index)) AS "回填前_內容指紋"
  FROM public.writing_error_findings;

-- 然後跑這一段（再回填一次）↓
-- SELECT jsonb_pretty(public.writing_backfill_error_findings(200));

-- 最後再跑一次上面那個指紋查詢，兩次的「總筆數」與「內容指紋」必須【完全相同】。


-- =====================================================
-- V7 老師實際會用的查詢：誰犯過 WRITE_ERR_ARTICLE（唯讀）
-- 這就是 A5 Error → Students 將來要包成 RPC 的核心
-- =====================================================
SELECT f.student_id,
       coalesce(public.learn_display_name(f.student_id), '（查不到姓名）') AS "學生",
       count(DISTINCT f.essay_id)::int AS "幾篇作文出現",
       count(*)::int                   AS "findings總數",
       max(f.essay_submitted_at)::date AS "最近一次",
       min(f.essay_submitted_at)::date AS "最早一次"
  FROM public.writing_error_findings f
 WHERE f.error_code = 'WRITE_ERR_ARTICLE'
 GROUP BY f.student_id
 ORDER BY 4 DESC, 5 DESC;


-- =====================================================
-- V8 Student → Errors：出現最多錯誤的那一位，列出他全部的 code（唯讀）
-- 這就是 A6 將來要包成 RPC 的核心
-- 🔴 重點：只出現一次的 code 也必須在列表裡
-- =====================================================
WITH top_student AS (
  SELECT student_id FROM public.writing_error_findings
   GROUP BY student_id ORDER BY count(*) DESC LIMIT 1)
SELECT coalesce(public.learn_display_name(f.student_id), '（查不到姓名）') AS "學生",
       f.error_code                     AS "error_code",
       count(DISTINCT f.essay_id)::int  AS "篇數",
       count(*)::int                    AS "findings",
       max(f.essay_submitted_at)::date  AS "最近一次",
       f.is_fallback_code               AS "低訊號"
  FROM public.writing_error_findings f
  JOIN top_student t ON t.student_id = f.student_id
 GROUP BY f.student_id, f.error_code, f.is_fallback_code
 ORDER BY 4 DESC, 3 DESC;


-- =====================================================
-- V9 效能（唯讀）
-- 判讀：看 Execution Time，以及有沒有吃到 idx_wef_code_time
-- =====================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT f.student_id,
       count(DISTINCT f.essay_id)::int AS essay_count,
       count(*)::int                   AS occurrence_count,
       max(f.essay_submitted_at)       AS last_seen_at
  FROM public.writing_error_findings f
 WHERE f.error_code = 'WRITE_ERR_ARTICLE'
   AND f.essay_submitted_at >= now() - interval '30 days'
 GROUP BY f.student_id
 ORDER BY occurrence_count DESC;
