-- =====================================================
-- 學生看自己的錯誤統計（1／2）：總覽
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 一個檔案一支函式。2026-09-24 有一支兩函式的 migration 在 Supabase
--    SQL Editor 整份執行失敗、分段執行成功（原因未查明，見
--    docs/writing/2026-09-24-essay-topic-and-corrections.md §5）。
--    這裡先避開。
--
-- 這是什麼
--
--   老師端的 writing_admin_error_overview（A4）同一份資料，換成學生只看自己。
--
-- 🛑 這一支【沒有】student_id 參數，也不可以加。
--    對象一律是 auth.uid()。沒有參數，就沒有「傳別人的 id」這回事——
--    授權不是靠檢查參數，是靠參數不存在。
--
-- 🛑 排序不能照抄 A4。
--    A4 是 student_count DESC（「多少人需要聽這堂課」）。對單一學生來說
--    student_count 永遠是 1，照抄等於沒有排序。
--    這裡用 A5 的邏輯：essay_count DESC（這個錯出現在我幾篇作文裡
--    ＝ 持續程度），再 occurrence_count DESC（單篇裡的密集程度）。
--    同樣是「廣度優先」，只是尺度換成一個人。
--
--   也因此回傳裡【沒有 student_count】—— 永遠是 1 的欄位只會佔位置。
--
-- 🛑 沒有任何「至少出現 N 次」的門檻，與老師版一致。
--    只犯過一次的錯也要列出來。
--
-- writing_error_findings 對 authenticated 是 REVOKE ALL ＋ RLS 只放行
-- service_role，所以學生【只能】透過這支函式讀到自己的資料。
--
-- 回滾：supabase/migrations/create_writing_my_errors_1_overview.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION writing_my_error_overview(
  p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID    := auth.uid();
  v_limit INTEGER := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_total INTEGER;
  v_rows  JSONB;
  v_essays INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  -- 我有幾篇作文出現過 findings。分母，讓「4 篇」有意義。
  SELECT count(DISTINCT f.essay_id)::int
    INTO v_essays
    FROM public.writing_error_findings f
   WHERE f.student_id = v_uid;

  WITH agg AS (
    SELECT f.error_code,
           count(DISTINCT f.essay_id)::int AS essay_count,
           count(*)::int                   AS occurrence_count,
           bool_or(f.is_fallback_code)     AS is_fallback_code,
           min(f.essay_submitted_at)       AS first_seen_at,
           max(f.essay_submitted_at)       AS last_seen_at
      FROM public.writing_error_findings f
     WHERE f.student_id = v_uid
     GROUP BY f.error_code
     -- 🛑 這裡【沒有 HAVING】。只犯過一次的也要列。
  )
  SELECT count(*)::int,
         coalesce(jsonb_agg(row_to_json(t)::jsonb) FILTER (WHERE t.rn <= v_limit), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (SELECT a.*,
                 row_number() OVER (ORDER BY a.essay_count DESC,
                                             a.occurrence_count DESC,
                                             a.error_code) AS rn
            FROM agg a) t;

  RETURN jsonb_build_object(
    'rows',         v_rows,
    'total',        v_total,
    'limit',        v_limit,
    'truncated',    v_total > v_limit,
    'essay_total',  coalesce(v_essays, 0));
END;
$$;

COMMENT ON FUNCTION writing_my_error_overview IS
  '學生看自己的錯誤總覽。對象是 auth.uid()，沒有 student_id 參數。依【出現在幾篇作文】排序，無門檻。';

REVOKE ALL ON FUNCTION writing_my_error_overview(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_my_error_overview(INTEGER) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
-- 預期：SECURITY DEFINER = t、search_path 被設成空、anon 不可執行、authenticated 可以
SELECT p.proname,
       p.prosecdef                                          AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',')                    AS "設定",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'writing_my_error_overview';
