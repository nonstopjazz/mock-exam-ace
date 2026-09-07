-- =====================================================
-- learn_classes / learn_class_members / learn_tasks /
-- learn_task_assignees / learn_task_logs
--
-- 老師的班級與任務指派系統（Phase 1）
--
-- 範圍（2026-09-06 決策）
-- ----------------------
-- 只有兩種任務型別：
--   A. HOMEWORK   —— 一次性的作業，有截止語意
--   B. RECURRING  —— 常態練習，有週期與目標次數
-- 🛑 不做 Digital Assignment、不做課表 / 堂次 / 行事曆、不做 per-student 內容例外、
--    不做通知 / 家長 / 附件 / 討論串 / 細部評分表。
--
-- 為什麼是正規化的 tasks + assignees
-- ---------------------------------
-- 指派給全班 = 1 列 learn_tasks + N 列 learn_task_assignees。
-- 任務內容【只有一份】：改標題只改一列，全班同步。指派給部分學生就是少開幾列
-- assignee，內容完全一樣。內容不同的作業是「另一個任務」，不是同一個任務的例外。
--
-- 為什麼 next_class_date 放在班級層級
-- ---------------------------------
-- due_type = 'NEXT_CLASS' 的作業 due_date 保持 NULL，在【讀取時】才解析成班級
-- 當下的 next_class_date。老師改一次日期，全班所有 NEXT_CLASS 作業一起移動。
-- 🛑 絕不把日期快照寫進 task 列，否則一鍵改期就失效。
--
-- 安全模型（比照 writing_teacher_feedback，逐條複製）
-- ------------------------------------------------
--   • 五張表【對所有角色都沒有任何 grant】。唯一入口是下面的 SECURITY DEFINER 函式。
--   • RLS 全部啟用且【沒有任何政策】：萬一哪天 grant 被誤加回來，RLS 還擋著。
--   • 老師端函式一律 coalesce(public.is_admin(), false) IS NOT TRUE 把關。
--   • 學生端函式【不接受 student_id 參數】，一律以 auth.uid() 為唯一過濾條件；
--     學生因此不可能讀到別人的任務、也不可能替別人登記。
--   • 學生能寫的欄位只有 student_reported / student_reported_at 與自己的
--     learn_task_logs。teacher_* 欄位不在任何學生端函式的 SET 清單裡。
--
-- 時區
-- ----
-- 資料庫是 UTC，學生在台灣。所有「今天 / 本週」一律用
-- (now() AT TIME ZONE 'Asia/Taipei')::date，前後端不各自推算。
--
-- 回滾：supabase/migrations/create_learn_classes_tasks.rollback.sql
-- =====================================================

-- 相依檢查：is_admin() 不存在時大聲失敗，而不是安靜地建出沒人守門的函式。
DO $dep$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'learn_classes 需要 public.is_admin()，請先建立它再套用這份 migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'user_profiles'
  ) THEN
    RAISE EXCEPTION 'learn_classes 需要 public.user_profiles（用來解析學生顯示名稱）';
  END IF;
END;
$dep$;


-- =====================================================
-- 1. 班級
-- =====================================================

CREATE TABLE IF NOT EXISTS learn_classes (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),

  -- ★ 班級層級的單一真相。NULL = 還沒排定，學生端顯示「下次上課前」而不是假日期。
  next_class_date DATE,

  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  note   TEXT,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE learn_classes IS
  '一個班（含一對一）。刻意沒有 mode 欄位——一對一 vs 小團班由「目前在籍人數」推導，避免多一個會和名冊不同步的欄位。';
COMMENT ON COLUMN learn_classes.next_class_date IS
  'due_type = NEXT_CLASS 的作業在讀取時解析成這個日期。改一次，全班未結案的作業一起移動。';


-- =====================================================
-- 2. 班級成員（一位學生可以同時屬於多個班）
-- =====================================================

CREATE TABLE IF NOT EXISTS learn_class_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   UUID NOT NULL REFERENCES learn_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ★ 軟移除。學生退出後，他既有的指派與完成紀錄必須留著（assignee 直接指向
  --   student_id，不經 membership），所以移除名冊不會弄丟歷史。
  left_at   TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id),

  UNIQUE (class_id, student_id)
);

COMMENT ON TABLE learn_class_members IS
  '班級名冊。「在籍」= left_at IS NULL。重新加入是清掉 left_at，不是新增一列。同一位學生在不同班各有一列。';

CREATE INDEX IF NOT EXISTS learn_class_members_class_idx
  ON learn_class_members(class_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS learn_class_members_student_idx
  ON learn_class_members(student_id) WHERE left_at IS NULL;


-- =====================================================
-- 3. 任務（內容只有一份）
-- =====================================================

CREATE TABLE IF NOT EXISTS learn_tasks (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES learn_classes(id) ON DELETE CASCADE,

  type  TEXT NOT NULL CHECK (type IN ('HOMEWORK', 'RECURRING')),
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  instruction TEXT,

  -- HOMEWORK 專用
  due_type TEXT CHECK (due_type IN ('NEXT_CLASS', 'CUSTOM_DATE', 'NONE')),
  due_date DATE,

  -- RECURRING 專用。刻意只有 DAILY / WEEKLY 兩種，好查也好顯示。
  -- 指定星期幾（一 / 三 / 五）留給之後的版本化擴充，v1 不做自由文字 cadence。
  recurrence       TEXT CHECK (recurrence IN ('DAILY', 'WEEKLY')),
  target_per_period INTEGER CHECK (target_per_period BETWEEN 1 AND 50),

  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 兩種型別的欄位互斥，資料庫層擋住「半個 HOMEWORK 半個 RECURRING」的列
  CONSTRAINT learn_tasks_type_fields CHECK (
    (type = 'HOMEWORK'
       AND due_type IS NOT NULL
       AND recurrence IS NULL AND target_per_period IS NULL)
    OR
    (type = 'RECURRING'
       AND recurrence IS NOT NULL AND target_per_period IS NOT NULL
       AND due_type IS NULL AND due_date IS NULL)
  ),
  -- CUSTOM_DATE 一定要有日期；其他 due_type 一定不能有日期（NEXT_CLASS 靠班級解析）
  CONSTRAINT learn_tasks_due_date_shape CHECK (
    (due_type = 'CUSTOM_DATE' AND due_date IS NOT NULL)
    OR (due_type IS DISTINCT FROM 'CUSTOM_DATE' AND due_date IS NULL)
  )
);

COMMENT ON COLUMN learn_tasks.due_date IS
  '只有 due_type = CUSTOM_DATE 才有值。NEXT_CLASS 保持 NULL，讀取時才解析成班級的 next_class_date——快照下來就沒辦法一鍵改期了。';
COMMENT ON COLUMN learn_tasks.target_per_period IS
  '每個週期要做幾次。DAILY = 每天幾次，WEEKLY = 每週幾次。例：每天複習單字 1 次 / 每週閱讀 3 次。';

CREATE INDEX IF NOT EXISTS learn_tasks_class_idx ON learn_tasks(class_id, status);


-- =====================================================
-- 4. 指派（每位學生的狀態各自獨立）
-- =====================================================

CREATE TABLE IF NOT EXISTS learn_task_assignees (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES learn_tasks(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 學生自述：學生唯一能寫的兩個欄位
  student_reported    BOOLEAN NOT NULL DEFAULT false,
  student_reported_at TIMESTAMPTZ,

  -- 老師確認：學生【永遠】碰不到。teacher_status IS NULL = 老師還沒檢查。
  teacher_status     TEXT CHECK (teacher_status IN ('DONE', 'PARTIAL', 'NOT_DONE')),
  teacher_percent    INTEGER CHECK (teacher_percent BETWEEN 0 AND 100),
  teacher_note       TEXT,
  teacher_checked_at TIMESTAMPTZ,
  teacher_checked_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (task_id, student_id),
  -- percent 只有 PARTIAL 有意義
  CONSTRAINT learn_task_assignees_percent_shape CHECK (
    teacher_percent IS NULL OR teacher_status = 'PARTIAL'
  )
);

COMMENT ON TABLE learn_task_assignees IS
  '一位學生對一個任務的狀態。三種來源刻意分開存：學生自述 / 老師確認 / （Phase 2 的）系統自動。學生自述 ≠ 老師確認。';

CREATE INDEX IF NOT EXISTS learn_task_assignees_student_idx
  ON learn_task_assignees(student_id);
CREATE INDEX IF NOT EXISTS learn_task_assignees_task_idx
  ON learn_task_assignees(task_id);


-- =====================================================
-- 5. 常態練習的打卡紀錄
-- =====================================================

CREATE TABLE IF NOT EXISTS learn_task_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_id UUID NOT NULL REFERENCES learn_task_assignees(id) ON DELETE CASCADE,

  -- 台灣時區的日期，不是 UTC 的
  log_date   DATE NOT NULL,
  done_count INTEGER NOT NULL DEFAULT 1 CHECK (done_count BETWEEN 1 AND 50),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (assignee_id, log_date)
);

COMMENT ON TABLE learn_task_logs IS
  '常態練習的打卡。一位學生一天一列（done_count 記次數），🛑 不預先產生每日任務列——沒做的日子就是沒有列。';

CREATE INDEX IF NOT EXISTS learn_task_logs_assignee_date_idx
  ON learn_task_logs(assignee_id, log_date DESC);


-- =====================================================
-- updated_at 由資料庫維護
-- =====================================================

CREATE OR REPLACE FUNCTION learn_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.created_at := OLD.created_at;   -- created_at 是事實，不接受改寫
  RETURN NEW;
END;
$$;

-- ⚠️ 觸發器函式也吃得到 ALTER DEFAULT PRIVILEGES 的 EXECUTE，一樣要點名收回。
REVOKE ALL ON FUNCTION learn_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS learn_classes_touch ON learn_classes;
CREATE TRIGGER learn_classes_touch BEFORE UPDATE ON learn_classes
  FOR EACH ROW EXECUTE FUNCTION learn_touch_updated_at();

DROP TRIGGER IF EXISTS learn_tasks_touch ON learn_tasks;
CREATE TRIGGER learn_tasks_touch BEFORE UPDATE ON learn_tasks
  FOR EACH ROW EXECUTE FUNCTION learn_touch_updated_at();

DROP TRIGGER IF EXISTS learn_task_assignees_touch ON learn_task_assignees;
CREATE TRIGGER learn_task_assignees_touch BEFORE UPDATE ON learn_task_assignees
  FOR EACH ROW EXECUTE FUNCTION learn_touch_updated_at();

DROP TRIGGER IF EXISTS learn_task_logs_touch ON learn_task_logs;
CREATE TRIGGER learn_task_logs_touch BEFORE UPDATE ON learn_task_logs
  FOR EACH ROW EXECUTE FUNCTION learn_touch_updated_at();


-- =====================================================
-- 權限：誰都不給，全部走 SECURITY DEFINER 函式
--
-- ⚠️ Supabase 的 ALTER DEFAULT PRIVILEGES 會把新表的 ALL 明確授予
--    anon / authenticated / service_role，所以必須【點名】收回。
--    REVOKE ... FROM PUBLIC 收不掉明確的角色授權。
-- =====================================================

ALTER TABLE learn_classes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_class_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_task_logs      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE learn_classes        FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE learn_class_members  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE learn_tasks          FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE learn_task_assignees FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE learn_task_logs      FROM PUBLIC, anon, authenticated, service_role;

-- 刻意【不】建立任何 RLS 政策：沒有 grant 就進不來，有了政策反而多一條路。


-- =====================================================
-- 內部輔助函式
--
-- 這幾支只在其他 SECURITY DEFINER 函式【內部】被呼叫。函式內部的權限檢查
-- 用的是外層函式擁有者的身分，所以這裡對 anon / authenticated 收回 EXECUTE
-- 不會影響內部呼叫，卻能確保它們不是可以直接打的 API。
-- =====================================================

/** 台灣時區的今天。全站只有這一個定義，前後端不各自推算。 */
CREATE OR REPLACE FUNCTION learn_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Taipei')::date;
$$;

REVOKE ALL ON FUNCTION learn_today() FROM PUBLIC, anon, authenticated;

/**
 * 學生的顯示名稱。
 * 🛑 永遠不要在畫面上顯示裸 uuid——順位：display_name → email 的 @ 前段 → 未命名學生。
 */
CREATE OR REPLACE FUNCTION learn_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
           nullif(btrim(p.display_name), ''),
           nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
           '未命名學生'
         )
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON p.user_id = u.id
   WHERE u.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION learn_display_name(UUID) FROM PUBLIC, anon, authenticated;

/** 常態練習的當期起訖。WEEKLY 用 ISO 週（週一起算）。 */
CREATE OR REPLACE FUNCTION learn_period_start(p_recurrence TEXT, p_date DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_recurrence = 'WEEKLY'
              THEN (date_trunc('week', p_date::timestamp))::date
              ELSE p_date END;
$$;

REVOKE ALL ON FUNCTION learn_period_start(TEXT, DATE) FROM PUBLIC, anon, authenticated;

/** 管理員把關。所有老師端函式的第一行。 */
CREATE OR REPLACE FUNCTION learn_require_admin(p_fn TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  -- is_admin() 對未登入者回傳 NULL，不是 false。IF NOT is_admin() 不會成立，
  -- 因此一律用 coalesce(...) IS NOT TRUE。
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION '%：僅限管理員', p_fn USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION learn_require_admin(TEXT) FROM PUBLIC, anon, authenticated;


-- =====================================================
-- 老師端：班級
-- =====================================================

/** 班級清單 + 每一班的摘要數字。/admin/classes 一次載入。 */
CREATE OR REPLACE FUNCTION learn_admin_classes(p_include_archived BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_classes');

  SELECT coalesce(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.status, c.name), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        cl.id,
        cl.name,
        cl.next_class_date,
        cl.status,
        cl.note,
        cl.created_at,
        (SELECT count(*) FROM public.learn_class_members m
          WHERE m.class_id = cl.id AND m.left_at IS NULL)          AS member_count,
        (SELECT count(*) FROM public.learn_tasks t
          WHERE t.class_id = cl.id AND t.status = 'ACTIVE'
            AND t.type = 'HOMEWORK')                                AS homework_count,
        (SELECT count(*) FROM public.learn_tasks t
          WHERE t.class_id = cl.id AND t.status = 'ACTIVE'
            AND t.type = 'RECURRING')                               AS recurring_count,
        -- 還沒被老師檢查的作業指派數：班級卡片上唯一的「待辦」訊號
        (SELECT count(*)
           FROM public.learn_task_assignees a
           JOIN public.learn_tasks t ON t.id = a.task_id
          WHERE t.class_id = cl.id AND t.status = 'ACTIVE'
            AND t.type = 'HOMEWORK' AND a.teacher_status IS NULL)   AS unchecked_count
      FROM public.learn_classes cl
     WHERE p_include_archived OR cl.status = 'ACTIVE'
    ) c;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION learn_admin_classes IS '班級清單與摘要數字。僅限管理員。';
REVOKE ALL ON FUNCTION learn_admin_classes(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_classes(BOOLEAN) TO authenticated, service_role;


/** 新增或更名班級。p_class_id 為 NULL 代表新增。 */
CREATE OR REPLACE FUNCTION learn_admin_upsert_class(
  p_class_id UUID,
  p_name TEXT,
  p_next_class_date DATE DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_name, ''));
  v_row  public.learn_classes%ROWTYPE;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_upsert_class');

  IF v_name = '' THEN
    RAISE EXCEPTION '班級名稱不能空白' USING ERRCODE = '22023';
  END IF;

  IF p_class_id IS NULL THEN
    INSERT INTO public.learn_classes (name, next_class_date, note, created_by)
    VALUES (v_name, p_next_class_date, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.learn_classes
       SET name = v_name,
           next_class_date = p_next_class_date,
           note = nullif(btrim(coalesce(p_note, '')), '')
     WHERE id = p_class_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION '找不到這個班級：%', p_class_id USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_upsert_class(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_upsert_class(UUID, TEXT, DATE, TEXT) TO authenticated, service_role;


/** 封存 / 取消封存班級。封存的班級不出現在預設清單，學生端也看不到它的任務。 */
CREATE OR REPLACE FUNCTION learn_admin_archive_class(p_class_id UUID, p_archived BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.learn_classes%ROWTYPE;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_archive_class');

  UPDATE public.learn_classes
     SET status = CASE WHEN p_archived THEN 'ARCHIVED' ELSE 'ACTIVE' END
   WHERE id = p_class_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這個班級：%', p_class_id USING ERRCODE = '22023';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_archive_class(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_archive_class(UUID, BOOLEAN) TO authenticated, service_role;


/**
 * 只改下次上課日期。
 * 這是唯一會一次影響全班所有 NEXT_CLASS 作業的動作，所以獨立成一支，
 * 讓 UI 可以做成一個明確的「改期」按鈕，而不是藏在班級編輯表單裡。
 */
CREATE OR REPLACE FUNCTION learn_admin_set_next_class_date(p_class_id UUID, p_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.learn_classes%ROWTYPE;
  v_affected INTEGER;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_set_next_class_date');

  UPDATE public.learn_classes SET next_class_date = p_date
   WHERE id = p_class_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這個班級：%', p_class_id USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_affected
    FROM public.learn_tasks t
   WHERE t.class_id = p_class_id AND t.status = 'ACTIVE'
     AND t.type = 'HOMEWORK' AND t.due_type = 'NEXT_CLASS';

  RETURN jsonb_build_object(
    'class_id', v_row.id,
    'next_class_date', v_row.next_class_date,
    'affected_homework', v_affected
  );
END;
$$;

COMMENT ON FUNCTION learn_admin_set_next_class_date IS
  '改班級的下次上課日期。所有 due_type = NEXT_CLASS 的作業會跟著移動——回傳值會告訴老師影響幾筆。';

REVOKE ALL ON FUNCTION learn_admin_set_next_class_date(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_set_next_class_date(UUID, DATE) TO authenticated, service_role;


-- =====================================================
-- 老師端：名冊
-- =====================================================

/**
 * 搜尋可以加入班級的帳號。
 *
 * 🛑 刻意【不】提供「列出全部使用者」。這個系統沒有 role 欄位，auth.users 裡
 *    混著考試 / 單字 / 試用帳號，整包倒出來既沒有意義也是不必要的資料暴露。
 *    必須輸入至少 2 個字元，最多回 20 筆。
 *
 * 「學生」的定義就是「在某個班的名冊上」——不需要另外加 role 欄位。
 */
CREATE OR REPLACE FUNCTION learn_admin_search_students(p_query TEXT, p_class_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_q TEXT := btrim(coalesce(p_query, ''));
  v_result JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_search_students');

  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.display_name), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        u.id                              AS student_id,
        public.learn_display_name(u.id)   AS display_name,
        u.email,
        p.grade,
        p.school,
        EXISTS (
          SELECT 1 FROM public.learn_class_members m
           WHERE m.student_id = u.id AND m.left_at IS NULL
             AND (p_class_id IS NULL OR m.class_id = p_class_id)
        ) AS already_member
      FROM auth.users u
      LEFT JOIN public.user_profiles p ON p.user_id = u.id
     WHERE u.email ILIKE v_q || '%'
        OR p.display_name ILIKE '%' || v_q || '%'
     LIMIT 20
    ) s;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION learn_admin_search_students IS
  '搜尋要加入班級的帳號。至少 2 字元、最多 20 筆——刻意不提供整包使用者清單。';

REVOKE ALL ON FUNCTION learn_admin_search_students(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_search_students(TEXT, UUID) TO authenticated, service_role;


/** 批次加入名冊。已經在籍的略過；曾經退出的清掉 left_at 而不是新增一列。 */
CREATE OR REPLACE FUNCTION learn_admin_add_class_members(p_class_id UUID, p_student_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_added INTEGER := 0;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_add_class_members');

  IF NOT EXISTS (SELECT 1 FROM public.learn_classes c WHERE c.id = p_class_id) THEN
    RAISE EXCEPTION '找不到這個班級：%', p_class_id USING ERRCODE = '22023';
  END IF;

  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('added', 0);
  END IF;

  -- 曾經退出的：清掉 left_at 並重新計算加入時間，而不是新增第二列
  WITH back AS (
    UPDATE public.learn_class_members m
       SET left_at = NULL, joined_at = now()
     WHERE m.class_id = p_class_id
       AND m.student_id = ANY (p_student_ids)
       AND m.left_at IS NOT NULL
    RETURNING 1
  ),
  fresh AS (
    INSERT INTO public.learn_class_members (class_id, student_id, created_by)
    SELECT p_class_id, sid, auth.uid()
      FROM unnest(p_student_ids) AS sid
      -- 帳號必須真的存在；不存在就靜靜跳過，不要建出指向幽靈的名冊列
     WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = sid)
    ON CONFLICT (class_id, student_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM back) + (SELECT count(*) FROM fresh) INTO v_added;

  RETURN jsonb_build_object('added', v_added);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_add_class_members(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_add_class_members(UUID, UUID[]) TO authenticated, service_role;


/**
 * 從名冊移除（軟移除）。
 * 🛑 不刪除他既有的指派與紀錄——那是已經發生過的事實。
 */
CREATE OR REPLACE FUNCTION learn_admin_remove_class_member(p_class_id UUID, p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.learn_require_admin('learn_admin_remove_class_member');

  UPDATE public.learn_class_members
     SET left_at = now()
   WHERE class_id = p_class_id AND student_id = p_student_id AND left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '這位學生不在這個班的名冊上' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('class_id', p_class_id, 'student_id', p_student_id, 'removed', true);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_remove_class_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_remove_class_member(UUID, UUID) TO authenticated, service_role;


-- =====================================================
-- 老師端：任務與指派
-- =====================================================

/**
 * 新增或修改任務，並同步指派名單。
 *
 * p_student_ids = NULL  → 指派給全班（展開成目前在籍成員）
 * p_student_ids = 陣列  → 只指派給這些人（必須都是這個班的在籍成員）
 *
 * 🛑 任務內容永遠只有一列。指派給誰只影響 learn_task_assignees 的列數。
 *
 * 修改指派名單時的取捨：被移除的學生，如果已經自述完成、已經被老師檢查過、
 * 或已經有打卡紀錄，就【不刪除】那一列——那是已經發生的事實。函式會把這些
 * 保留下來的人回傳在 retained 裡，讓老師知道而不是安靜地留著。
 */
CREATE OR REPLACE FUNCTION learn_admin_upsert_task(
  p_task_id UUID,
  p_class_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_instruction TEXT DEFAULT NULL,
  p_due_type TEXT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_recurrence TEXT DEFAULT NULL,
  p_target_per_period INTEGER DEFAULT NULL,
  p_student_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title TEXT := btrim(coalesce(p_title, ''));
  v_row   public.learn_tasks%ROWTYPE;
  v_desired UUID[];
  v_retained JSONB;
  v_assigned INTEGER;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_upsert_task');

  IF v_title = '' THEN
    RAISE EXCEPTION '任務名稱不能空白' USING ERRCODE = '22023';
  END IF;
  IF p_type NOT IN ('HOMEWORK', 'RECURRING') THEN
    RAISE EXCEPTION '未知的任務型別：%（Phase 1 只有 HOMEWORK 與 RECURRING）', p_type
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learn_classes c WHERE c.id = p_class_id) THEN
    RAISE EXCEPTION '找不到這個班級：%', p_class_id USING ERRCODE = '22023';
  END IF;

  -- 指派名單：NULL 代表全班在籍成員
  IF p_student_ids IS NULL THEN
    SELECT coalesce(array_agg(m.student_id), ARRAY[]::UUID[]) INTO v_desired
      FROM public.learn_class_members m
     WHERE m.class_id = p_class_id AND m.left_at IS NULL;
  ELSE
    -- 去重，並確認每一位都真的在這個班的名冊上
    SELECT coalesce(array_agg(DISTINCT sid), ARRAY[]::UUID[]) INTO v_desired
      FROM unnest(p_student_ids) AS sid;

    IF EXISTS (
      SELECT 1 FROM unnest(v_desired) AS sid
       WHERE NOT EXISTS (
         SELECT 1 FROM public.learn_class_members m
          WHERE m.class_id = p_class_id AND m.student_id = sid AND m.left_at IS NULL
       )
    ) THEN
      RAISE EXCEPTION '指派名單裡有人不是這個班的在籍成員' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_task_id IS NULL THEN
    INSERT INTO public.learn_tasks (
      class_id, type, title, instruction,
      due_type, due_date, recurrence, target_per_period, created_by
    )
    VALUES (
      p_class_id, p_type, v_title, nullif(btrim(coalesce(p_instruction, '')), ''),
      CASE WHEN p_type = 'HOMEWORK'  THEN coalesce(p_due_type, 'NEXT_CLASS') END,
      CASE WHEN p_type = 'HOMEWORK' AND coalesce(p_due_type, 'NEXT_CLASS') = 'CUSTOM_DATE'
           THEN p_due_date END,
      CASE WHEN p_type = 'RECURRING' THEN coalesce(p_recurrence, 'DAILY') END,
      CASE WHEN p_type = 'RECURRING' THEN coalesce(p_target_per_period, 1) END,
      auth.uid()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.learn_tasks
       SET class_id    = p_class_id,
           type        = p_type,
           title       = v_title,
           instruction = nullif(btrim(coalesce(p_instruction, '')), ''),
           due_type    = CASE WHEN p_type = 'HOMEWORK' THEN coalesce(p_due_type, 'NEXT_CLASS') END,
           due_date    = CASE WHEN p_type = 'HOMEWORK'
                                AND coalesce(p_due_type, 'NEXT_CLASS') = 'CUSTOM_DATE'
                              THEN p_due_date END,
           recurrence  = CASE WHEN p_type = 'RECURRING' THEN coalesce(p_recurrence, 'DAILY') END,
           target_per_period = CASE WHEN p_type = 'RECURRING'
                                    THEN coalesce(p_target_per_period, 1) END
     WHERE id = p_task_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION '找不到這個任務：%', p_task_id USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 補上缺少的指派
  INSERT INTO public.learn_task_assignees (task_id, student_id)
  SELECT v_row.id, sid FROM unnest(v_desired) AS sid
  ON CONFLICT (task_id, student_id) DO NOTHING;

  -- 移除不在名單上的——但只移除還沒有任何紀錄的
  DELETE FROM public.learn_task_assignees a
   WHERE a.task_id = v_row.id
     AND NOT (a.student_id = ANY (v_desired))
     AND a.student_reported = false
     AND a.teacher_status IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.learn_task_logs l WHERE l.assignee_id = a.id);

  -- 剩下的就是「想移除但有紀錄，所以保留」的人
  SELECT coalesce(jsonb_agg(public.learn_display_name(a.student_id) ORDER BY a.student_id), '[]'::jsonb)
    INTO v_retained
    FROM public.learn_task_assignees a
   WHERE a.task_id = v_row.id AND NOT (a.student_id = ANY (v_desired));

  SELECT count(*) INTO v_assigned
    FROM public.learn_task_assignees a WHERE a.task_id = v_row.id;

  RETURN jsonb_build_object(
    'task', to_jsonb(v_row),
    'assigned_count', v_assigned,
    'retained', v_retained
  );
END;
$$;

COMMENT ON FUNCTION learn_admin_upsert_task IS
  '新增／修改任務並同步指派名單。p_student_ids 為 NULL = 全班。任務內容只有一列，不會依學生複製。';

REVOKE ALL ON FUNCTION learn_admin_upsert_task(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, INTEGER, UUID[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_upsert_task(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, INTEGER, UUID[])
  TO authenticated, service_role;


/** 封存 / 取消封存任務。封存後學生端就看不到，但紀錄留著。 */
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
     SET status = CASE WHEN p_archived THEN 'ARCHIVED' ELSE 'ACTIVE' END
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


/**
 * 老師檢查某位學生的某個任務。
 * p_status 傳 NULL 代表「取消檢查」，回到未檢查狀態。
 */
CREATE OR REPLACE FUNCTION learn_admin_check_task(
  p_task_id UUID,
  p_student_id UUID,
  p_status TEXT,
  p_percent INTEGER DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.learn_task_assignees%ROWTYPE;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_check_task');

  IF p_status IS NOT NULL AND p_status NOT IN ('DONE', 'PARTIAL', 'NOT_DONE') THEN
    RAISE EXCEPTION '未知的檢查結果：%', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.learn_task_assignees a
     SET teacher_status  = p_status,
         -- percent 只有 PARTIAL 有意義，其他狀態一律清掉
         teacher_percent = CASE WHEN p_status = 'PARTIAL'
                                THEN greatest(0, least(100, coalesce(p_percent, 50))) END,
         teacher_note    = CASE WHEN p_status IS NULL
                                THEN NULL
                                ELSE nullif(btrim(coalesce(p_note, '')), '') END,
         teacher_checked_at = CASE WHEN p_status IS NULL THEN NULL ELSE now() END,
         teacher_checked_by = CASE WHEN p_status IS NULL THEN NULL ELSE auth.uid() END
   WHERE a.task_id = p_task_id AND a.student_id = p_student_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION '這位學生沒有被指派這個任務' USING ERRCODE = '22023';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_check_task(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_check_task(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;


/** 全班一次標記同一個結果。給「整班都交了」這種常見情況用。 */
CREATE OR REPLACE FUNCTION learn_admin_check_task_bulk(p_task_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_check_task_bulk');

  IF p_status IS NOT NULL AND p_status NOT IN ('DONE', 'PARTIAL', 'NOT_DONE') THEN
    RAISE EXCEPTION '未知的檢查結果：%', p_status USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.learn_task_assignees a
       SET teacher_status  = p_status,
           teacher_percent = CASE WHEN p_status = 'PARTIAL' THEN 50 END,
           teacher_note    = NULL,
           teacher_checked_at = CASE WHEN p_status IS NULL THEN NULL ELSE now() END,
           teacher_checked_by = CASE WHEN p_status IS NULL THEN NULL ELSE auth.uid() END
     WHERE a.task_id = p_task_id
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM upd;

  RETURN jsonb_build_object('task_id', p_task_id, 'updated', v_n);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_check_task_bulk(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_check_task_bulk(UUID, TEXT) TO authenticated, service_role;


-- =====================================================
-- 老師端：班級詳情（一次載入整個 /admin/classes/:id）
-- =====================================================

CREATE OR REPLACE FUNCTION learn_admin_class_detail(p_class_id UUID)
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
     WHERE tk.class_id = p_class_id AND tk.status = 'ACTIVE'
    ) t;

  RETURN jsonb_build_object(
    'class',   to_jsonb(v_class),
    'members', v_members,
    'tasks',   v_tasks,
    'today',   v_today
  );
END;
$$;

COMMENT ON FUNCTION learn_admin_class_detail IS
  '一次載入整個班級頁：班級 + 在籍名冊 + 進行中的任務與每位學生的狀態。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_class_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_class_detail(UUID) TO authenticated, service_role;


-- =====================================================
-- 學生端
--
-- 🛑 這兩支【都不接受 student_id 參數】。過濾條件永遠是 auth.uid()，
--    所以學生不可能讀到別人的任務，也不可能替別人登記。
-- 🛑 回傳內容不包含同班同學的名單或進度。
-- =====================================================

CREATE OR REPLACE FUNCTION learn_student_tasks()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_today DATE := public.learn_today();
  v_hw    JSONB;
  v_rec   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'learn_student_tasks：需要登入' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(h)::jsonb
           ORDER BY h.resolved_due_date NULLS LAST, h.created_at), '[]'::jsonb)
    INTO v_hw
    FROM (
      SELECT
        tk.id AS task_id,
        tk.title,
        tk.instruction,
        cl.id   AS class_id,
        cl.name AS class_name,
        tk.due_type,
        CASE WHEN tk.due_type = 'NEXT_CLASS' THEN cl.next_class_date
             ELSE tk.due_date END AS resolved_due_date,
        a.student_reported,
        a.student_reported_at,
        a.teacher_status,
        a.teacher_percent,
        a.teacher_note,
        a.teacher_checked_at,
        tk.created_at
      FROM public.learn_task_assignees a
      JOIN public.learn_tasks   tk ON tk.id = a.task_id
      JOIN public.learn_classes cl ON cl.id = tk.class_id
     WHERE a.student_id = v_uid
       AND tk.type = 'HOMEWORK'
       AND tk.status = 'ACTIVE'
       AND cl.status = 'ACTIVE'
    ) h;

  SELECT coalesce(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.title), '[]'::jsonb)
    INTO v_rec
    FROM (
      SELECT
        tk.id AS task_id,
        tk.title,
        tk.instruction,
        cl.id   AS class_id,
        cl.name AS class_name,
        tk.recurrence,
        tk.target_per_period,
        public.learn_period_start(tk.recurrence, v_today) AS period_start,
        (SELECT coalesce(sum(l.done_count), 0)
           FROM public.learn_task_logs l
          WHERE l.assignee_id = a.id AND l.log_date = v_today)      AS today_count,
        (SELECT coalesce(sum(l.done_count), 0)
           FROM public.learn_task_logs l
          WHERE l.assignee_id = a.id
            AND l.log_date >= public.learn_period_start(tk.recurrence, v_today)
            AND l.log_date <= v_today)                              AS period_count
      FROM public.learn_task_assignees a
      JOIN public.learn_tasks   tk ON tk.id = a.task_id
      JOIN public.learn_classes cl ON cl.id = tk.class_id
     WHERE a.student_id = v_uid
       AND tk.type = 'RECURRING'
       AND tk.status = 'ACTIVE'
       AND cl.status = 'ACTIVE'
    ) r;

  RETURN jsonb_build_object(
    'today',     v_today,
    'homework',  v_hw,
    'recurring', v_rec
  );
END;
$$;

COMMENT ON FUNCTION learn_student_tasks IS
  '學生自己的任務。過濾條件只有 auth.uid()，不接受 student_id 參數，也不回傳同班同學的任何資料。';

REVOKE ALL ON FUNCTION learn_student_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_student_tasks() TO authenticated, service_role;


/**
 * 學生自述完成 / 取消自述。
 *
 * 🛑 SET 清單只有 student_reported 與 student_reported_at。
 *    teacher_status / teacher_percent / teacher_note 不在裡面——
 *    這是資料庫層的保證，不是靠前端藏按鈕。
 */
CREATE OR REPLACE FUNCTION learn_student_report_task(p_task_id UUID, p_done BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.learn_task_assignees%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'learn_student_report_task：需要登入' USING ERRCODE = '42501';
  END IF;

  UPDATE public.learn_task_assignees a
     SET student_reported    = coalesce(p_done, false),
         student_reported_at = CASE WHEN coalesce(p_done, false) THEN now() END
   WHERE a.task_id = p_task_id
     AND a.student_id = v_uid        -- ★ 唯一的過濾條件
     AND EXISTS (
       SELECT 1 FROM public.learn_tasks t
        WHERE t.id = a.task_id AND t.type = 'HOMEWORK' AND t.status = 'ACTIVE'
     )
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到你的這項作業' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'task_id',          v_row.task_id,
    'student_reported', v_row.student_reported,
    'teacher_status',   v_row.teacher_status   -- 唯讀回傳，讓 UI 知道老師是否已經看過
  );
END;
$$;

REVOKE ALL ON FUNCTION learn_student_report_task(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_student_report_task(UUID, BOOLEAN) TO authenticated, service_role;


/**
 * 常態練習打卡。p_delta = +1 / -1。
 *
 * 只能登記今天與過去 6 天（也就是當週之內補登），不能登記未來，
 * 也不能無限往回補——那會讓「本週進度」失去意義。
 * 🛑 不預先產生每日任務列：沒做的日子就是沒有列。
 */
CREATE OR REPLACE FUNCTION learn_student_log_recurring(
  p_task_id UUID,
  p_date DATE DEFAULT NULL,
  p_delta INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_today DATE := public.learn_today();
  v_date  DATE := coalesce(p_date, v_today);
  v_assignee UUID;
  v_recurrence TEXT;
  v_count INTEGER;
  v_period INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'learn_student_log_recurring：需要登入' USING ERRCODE = '42501';
  END IF;

  IF v_date > v_today OR v_date < v_today - 6 THEN
    RAISE EXCEPTION '只能登記今天或過去 6 天之內' USING ERRCODE = '22023';
  END IF;

  SELECT a.id, t.recurrence INTO v_assignee, v_recurrence
    FROM public.learn_task_assignees a
    JOIN public.learn_tasks   t  ON t.id = a.task_id
    JOIN public.learn_classes cl ON cl.id = t.class_id
   WHERE a.task_id = p_task_id
     AND a.student_id = v_uid       -- ★ 唯一的過濾條件
     AND t.type = 'RECURRING'
     AND t.status = 'ACTIVE'
     AND cl.status = 'ACTIVE';

  IF v_assignee IS NULL THEN
    RAISE EXCEPTION '找不到你的這項常態練習' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_delta, 1) >= 0 THEN
    INSERT INTO public.learn_task_logs (assignee_id, log_date, done_count)
    VALUES (v_assignee, v_date, 1)
    ON CONFLICT (assignee_id, log_date) DO UPDATE
      SET done_count = least(50, public.learn_task_logs.done_count + 1),
          updated_at = now();
  ELSE
    UPDATE public.learn_task_logs
       SET done_count = done_count - 1
     WHERE assignee_id = v_assignee AND log_date = v_date AND done_count > 1;

    IF NOT FOUND THEN
      DELETE FROM public.learn_task_logs
       WHERE assignee_id = v_assignee AND log_date = v_date;
    END IF;
  END IF;

  SELECT coalesce(sum(l.done_count), 0) INTO v_count
    FROM public.learn_task_logs l
   WHERE l.assignee_id = v_assignee AND l.log_date = v_today;

  SELECT coalesce(sum(l.done_count), 0) INTO v_period
    FROM public.learn_task_logs l
   WHERE l.assignee_id = v_assignee
     AND l.log_date >= public.learn_period_start(v_recurrence, v_today)
     AND l.log_date <= v_today;

  RETURN jsonb_build_object(
    'task_id',      p_task_id,
    'log_date',     v_date,
    'today_count',  v_count,
    'period_count', v_period
  );
END;
$$;

REVOKE ALL ON FUNCTION learn_student_log_recurring(UUID, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_student_log_recurring(UUID, DATE, INTEGER) TO authenticated, service_role;
