-- 🛑 這個檔案【整份就是一個步驟】，可以整份貼進 Supabase SQL Editor。
-- 🛑 只在 gsat-staging 執行，不要在 production。
--
-- 執行順序見 supabase/tests/staging-verify/README.md
--
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
