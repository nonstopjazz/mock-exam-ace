-- =====================================================
-- 學生端的「已結束的作業」
--
-- 🟢 只要在 production 執行一次。
--
-- 【現況】封存之後，那份作業對學生【完全消失】：
--     learn_student_tasks() 兩個分支都寫死 tk.status = 'ACTIVE'，
--     而學生端只有這一支讀取 RPC，沒有歷史頁。
--
--   但資料一直都在 —— learn_task_assignees 的學生回報與老師評語、
--   learn_task_logs 的每日紀錄，封存都不會動到它們
--   （封存只改 learn_tasks.status）。缺的只是一個入口。
--
-- 🛑 【不】改 learn_student_tasks() 的 signature。
--    加一個 p_include_archived 就是新 signature，得先 DROP 再建，
--    而那支是學生端每次進站都會打的熱路徑。更重要的是意義會混：
--    「現在要做什麼」跟「以前做過什麼」是兩件事，混在同一份回傳裡，
--    畫面就得到處寫 filter，漏掉一處就是「已結束的還排在待辦裡」。
--    另開一支，兩邊的意義不會互相汙染。
--    （老師端的班級頁也是這樣處理的，見 useAdminClassDetail 的註解。）
--
-- 🛑 【不】過濾班級狀態。
--    learn_student_tasks() 要求 cl.status = 'ACTIVE'，那是對的 ——
--    已封存的班級不該再出現待辦。但歷史相反：班級結束了，
--    那學期的作業紀錄更應該留得住。整個班消失才是最該保留的那一種歷史。
--
-- 🛑 NEXT_CLASS 的截止日【不】解析。
--    cl.next_class_date 是會往前走的值。對一份三個月前就結束的作業，
--    把它算成「下次上課」是個看起來精確、實際上是錯的日期。
--    只有 CUSTOM_DATE 是當初就釘死的，才回傳。
--    due_type 一併回傳，讓畫面自己決定要不要顯示。
--
-- 回滾：supabase/migrations/add_learn_student_task_history.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION learn_student_task_history(p_limit INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_limit INTEGER := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_total INTEGER;
  v_items JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'learn_student_task_history：需要登入' USING ERRCODE = '42501';
  END IF;

  -- 總數先算，才知道有沒有被 limit 截斷。
  SELECT count(*) INTO v_total
    FROM public.learn_task_assignees a
    JOIN public.learn_tasks tk ON tk.id = a.task_id
   WHERE a.student_id = v_uid
     AND tk.status = 'ARCHIVED';

  SELECT coalesce(jsonb_agg(row_to_json(h)::jsonb
           ORDER BY h.archived_at DESC NULLS LAST, h.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT
        tk.id    AS task_id,
        tk.type,
        tk.title,
        tk.instruction,
        cl.id    AS class_id,
        cl.name  AS class_name,
        tk.archived_at,
        tk.due_type,
        -- 只有 CUSTOM_DATE 是當初釘死的日期；NEXT_CLASS 現在算出來會是錯的。
        CASE WHEN tk.due_type = 'CUSTOM_DATE' THEN tk.due_date END AS due_date,
        tk.recurrence,
        tk.target_per_period,
        a.student_reported,
        a.student_reported_at,
        a.teacher_status,
        a.teacher_percent,
        a.teacher_note,
        a.teacher_checked_at,
        -- 週期任務：整段期間一共記了幾次。作業型別沒有 log，會是 0。
        (SELECT coalesce(sum(l.done_count), 0)
           FROM public.learn_task_logs l
          WHERE l.assignee_id = a.id) AS total_logged,
        tk.created_at
      FROM public.learn_task_assignees a
      JOIN public.learn_tasks   tk ON tk.id = a.task_id
      JOIN public.learn_classes cl ON cl.id = tk.class_id
     WHERE a.student_id = v_uid
       AND tk.status = 'ARCHIVED'
     ORDER BY tk.archived_at DESC NULLS LAST, tk.created_at DESC
     LIMIT v_limit
    ) h;

  RETURN jsonb_build_object(
    'items',     v_items,
    'total',     v_total,
    'truncated', v_total > v_limit
  );
END;
$$;

COMMENT ON FUNCTION learn_student_task_history(INTEGER) IS
  '學生自己已結束（封存）的任務，唯讀回顧。過濾條件只有 auth.uid()，不接受 student_id 參數，也不回傳同班同學的任何資料。刻意不濾班級狀態——班級結束了，那學期的紀錄更該留得住。';

REVOKE ALL ON FUNCTION learn_student_task_history(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_student_task_history(INTEGER) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       pg_get_function_arguments(p.oid) AS "參數",
       pg_get_function_result(p.oid)    AS "回傳"
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'learn_student_task_history';

SELECT grantee, privilege_type
  FROM information_schema.role_routine_grants
 WHERE routine_schema = 'public'
   AND routine_name = 'learn_student_task_history'
 ORDER BY grantee;
