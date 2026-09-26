-- =====================================================
-- 閱讀題庫上架（1／2）：後台清單
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_publish_guard.sql（要用 reading_publish_readiness）。
--
-- 🛑 「完整」的定義【不在這裡】。這支呼叫 reading_publish_readiness()，
--    跟 trigger 用的是同一支函式。在這裡自己寫一份「六題都有就算完整」的
--    SQL 會快一點，但那一刻起就有兩個定義，而它們遲早會分岔——
--    畫面說可以上架、trigger 說不行，然後沒有人知道該相信哪一個。
--
-- 回滾：supabase/migrations/create_reading_admin_publish_1_list.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_admin_passage_list()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'reading_admin_passage_list：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row ORDER BY row ->> 'passage_id'), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT jsonb_build_object(
        'passage_id',     p.passage_id,
        'title',          p.title,
        'status',         p.status,
        'cefr_level',     p.cefr_level,
        'content_family', p.content_family,
        'subdomain',      p.subdomain,
        'question_count', (SELECT count(*) FROM public.reading_questions q
                            WHERE q.passage_id = p.passage_id),
        -- 🛑 已經有人作答過的文章，下架要想一下：紀錄還在，但學生
        --    會突然找不到那一篇。所以清單上直接把這個數字講出來。
        'attempt_count',  (SELECT count(*) FROM public.reading_attempts a
                             JOIN public.reading_questions q ON q.id = a.question_id
                            WHERE q.passage_id = p.passage_id),
        'ready',          (r.j ->> 'ready')::boolean,
        'missing',        r.j -> 'missing'
      ) AS row
      FROM public.reading_passages p
      CROSS JOIN LATERAL (SELECT public.reading_publish_readiness(p.passage_id) AS j) r
    ) s;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION reading_admin_passage_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_admin_passage_list() TO authenticated, service_role;

COMMENT ON FUNCTION reading_admin_passage_list IS
  '後台的文章清單：狀態、題數、作答數、能不能上架與缺哪幾個 construct。僅限管理員。「完整」的判斷呼叫 reading_publish_readiness()，與 trigger 同一份定義。';

-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                      AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',')                AS "設定",
       has_function_privilege('anon', p.oid, 'EXECUTE') AS "anon可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'reading_admin_passage_list';
