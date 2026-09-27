-- =====================================================
-- 任務封存：補上封存時間，並讓班級頁看得到已封存的任務
--
-- 🟢 只要在 production 執行一次。
--
-- 【現況】封存這件事後端早就有了：
--     • learn_tasks.status CHECK (status IN ('ACTIVE','ARCHIVED'))
--     • learn_admin_archive_task(p_task_id, p_archived) 已存在且已授權
--     • 老師端、學生端的查詢都已經濾掉 ARCHIVED
--
--   缺的只有兩件事：
--     1. 沒有【封存時間】，所以畫面上顯示不了「什麼時候封存的」
--     2. learn_admin_class_detail 把 status = 'ACTIVE' 寫死，沒有參數
--        → 封存之後那個任務就永遠消失，RPC 明明支援還原，UI 卻進不去
--
-- 🛑 archived_at 是【補充】status，不是取代它。
--    status 上面掛著老師端與學生端好幾支查詢的條件，換掉就等於
--    同時改動所有那些地方——那是重構，不是這次要做的事。
--    真相仍然只有一個來源：status。archived_at 只回答「什麼時候」。
--
-- 🛑 class_detail 要【先 DROP 再建】：多一個參數就是新 signature，
--    只做 CREATE OR REPLACE 會留下舊的那支，然後
--    supabase.rpc('learn_admin_class_detail', {p_class_id}) 會因為
--    兩支都符合而報 "function is not unique"。
--    DROP 之後權限回到預設，所以下面的 REVOKE/GRANT 是必要的。
--
-- 🛑 【沒有】加硬刪除，這是刻意的。learn_task_assignees.task_id 是
--    ON DELETE CASCADE——刪一筆任務，那份作業所有學生的完成紀錄會一起消失，
--    而且沒有任何提示。封存做得到「不要再出現」，而且救得回來。
--
-- 回滾：supabase/migrations/add_learn_tasks_archived_at.rollback.sql
-- =====================================================

ALTER TABLE learn_tasks
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN learn_tasks.archived_at IS
  '封存的時間。狀態的真相在 status，這一欄只回答「什麼時候」。還原時清成 NULL。';

-- 既有的已封存任務沒有時間可以考證，維持 NULL；畫面顯示「時間不詳」。
-- 🛑 不要拿 updated_at 回填：那個欄位會因為任何一次編輯而變動，
--    填進去會變成一個看起來精確、實際上是編的日期。

-- ── 封存／還原時一併維護 archived_at ──────────────────
CREATE OR REPLACE FUNCTION learn_admin_archive_task(p_task_id UUID, p_archived BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.learn_tasks%ROWTYPE;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_archive_task');

  UPDATE public.learn_tasks
     SET status      = CASE WHEN p_archived THEN 'ARCHIVED' ELSE 'ACTIVE' END,
         -- 重複封存不更新時間：老師點兩次不該讓它看起來是剛剛才封存的
         archived_at = CASE
                         WHEN NOT p_archived THEN NULL
                         WHEN archived_at IS NOT NULL THEN archived_at
                         ELSE now()
                       END,
         updated_at  = now()
   WHERE id = p_task_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這個任務：%', p_task_id USING ERRCODE = '22023';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_archive_task(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_archive_task(UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION learn_admin_archive_task IS
  '封存／還原任務。封存後老師端與學生端都看不到，但 learn_task_assignees 與 learn_task_logs 的紀錄完全不動。p_archived = false 還原。';


-- ── 班級頁：可以選擇要不要一起帶出已封存的任務 ────────
DROP FUNCTION IF EXISTS learn_admin_class_detail(UUID);

CREATE OR REPLACE FUNCTION learn_admin_class_detail(
  p_class_id UUID,
  -- 🛑 預設 false：一般進班級頁看到的仍然只有進行中的任務。
  --    想看已封存的要自己說——封存的意義就是「不要再出現在眼前」。
  p_include_archived BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class   public.learn_classes%ROWTYPE;
  v_today   DATE := public.learn_today();
  v_members JSONB;
  v_tasks   JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_class_detail');

  SELECT * INTO v_class FROM public.learn_classes c WHERE c.id = p_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這個班級：%', p_class_id USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.display_name), '[]'::jsonb)
    INTO v_members
    FROM (
      SELECT
        cm.student_id,
        public.learn_display_name(cm.student_id) AS display_name,
        u.email,
        p.grade,
        cm.joined_at
      FROM public.learn_class_members cm
      JOIN auth.users u ON u.id = cm.student_id
      LEFT JOIN public.user_profiles p ON p.user_id = cm.student_id
     WHERE cm.class_id = p_class_id AND cm.left_at IS NULL
    ) m;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.type, t.created_at DESC), '[]'::jsonb)
    INTO v_tasks
    FROM (
      SELECT
        tk.id AS task_id,
        tk.type,
        tk.title,
        tk.instruction,
        tk.due_type,
        tk.due_date,
        -- ★ NEXT_CLASS 在這裡才解析成班級當下的日期
        CASE WHEN tk.due_type = 'NEXT_CLASS' THEN v_class.next_class_date
             ELSE tk.due_date END AS resolved_due_date,
        tk.recurrence,
        tk.target_per_period,
        tk.status,
        tk.archived_at,
        tk.created_at,
        (
          SELECT coalesce(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.display_name), '[]'::jsonb)
            FROM (
              SELECT
                asg.student_id,
                public.learn_display_name(asg.student_id) AS display_name,
                asg.student_reported,
                asg.student_reported_at,
                asg.teacher_status,
                asg.teacher_percent,
                asg.teacher_note,
                asg.teacher_checked_at,
                -- 常態練習：當期完成次數（HOMEWORK 一律 0）
                CASE WHEN tk.type = 'RECURRING' THEN (
                  SELECT coalesce(sum(l.done_count), 0)
                    FROM public.learn_task_logs l
                   WHERE l.assignee_id = asg.id
                     AND l.log_date >= public.learn_period_start(tk.recurrence, v_today)
                     AND l.log_date <= v_today
                ) ELSE 0 END AS period_count
              FROM public.learn_task_assignees asg
             WHERE asg.task_id = tk.id
            ) a
        ) AS assignees
      FROM public.learn_tasks tk
     WHERE tk.class_id = p_class_id
       AND (p_include_archived OR tk.status = 'ACTIVE')
    ) t;

  RETURN jsonb_build_object(
    'class',   to_jsonb(v_class),
    'members', v_members,
    'tasks',   v_tasks,
    'today',   v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_class_detail(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_class_detail(UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION learn_admin_class_detail IS
  '一次載入整個班級頁：班級 + 在籍名冊 + 任務與每位學生的狀態。p_include_archived = true 時連已封存的任務一起帶出來（給「已封存」區塊用）。僅限管理員。';


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       pg_get_function_arguments(p.oid)                          AS "參數",
       p.prosecdef                                               AS "SECURITY DEFINER",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('learn_admin_class_detail', 'learn_admin_archive_task')
 ORDER BY p.proname;
