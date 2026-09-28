-- =====================================================
-- 影片課程：學生端讀取與進度
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_learn_courses.sql。
-- ⚠️ 影片的播放位址【不在這一份】，在 create_learn_course_playback.sql。
--
--
-- 🛑 這一份回傳的任何東西都不含 video_id
--
--   課程大綱要能給學生看（第幾週有哪幾支、多長、看完沒），但「這支片子在
--   哪裡」是另一回事。把 video_id 一起送出去的話，鎖住的單元就等於沒鎖——
--   前端把它藏起來只是視覺上的，F12 一開全部都在。
--
--   所以 video_id 只出現在 learn_course_playback()，而且是在驗完權限之後。
--
-- 🛑 「鎖住」是在資料庫算的，不是前端判斷的
--
--   現有樣板的 locked 是寫死在假資料裡的布林。真的要擋，規則就得跟
--   發影片位址的那支用同一套——否則畫面顯示鎖著、API 照發。
--
-- 回滾：supabase/migrations/create_learn_course_rpcs.rollback.sql
-- =====================================================

-- ── 這門課，這個人看不看得到 ──────────────────────────
CREATE OR REPLACE FUNCTION learn_course_visible(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_status TEXT;
  v_access TEXT;
BEGIN
  IF coalesce(public.is_admin(), false) IS TRUE THEN
    RETURN true;
  END IF;
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 第一層：有沒有「課程」這個功能。沒有的話，免費課也看不到。
  IF coalesce(public.learn_feature_enabled('course'), false) IS NOT TRUE THEN
    RETURN false;
  END IF;

  SELECT status, access INTO v_status, v_access
    FROM public.learn_courses WHERE id = p_course_id;

  IF v_status IS DISTINCT FROM 'PUBLISHED' THEN
    RETURN false;
  END IF;

  -- 第二層：免費課不必個別選課
  IF v_access = 'FREE' THEN
    RETURN true;
  END IF;

  -- 第三層：個別選課，或所屬啟用中班級被授權。
  -- 🛑 left_at IS NULL —— 退出班級的學生不該繼續看得到那班的課。
  RETURN EXISTS (
    SELECT 1 FROM public.learn_course_access a
     WHERE a.course_id = p_course_id AND a.student_id = v_uid
  ) OR EXISTS (
    SELECT 1
      FROM public.learn_course_access a
      JOIN public.learn_class_members m ON m.class_id = a.class_id
      JOIN public.learn_classes c       ON c.id = a.class_id
     WHERE a.course_id = p_course_id
       AND m.student_id = v_uid
       AND m.left_at IS NULL
       AND c.status = 'ACTIVE'
  );
END;
$$;

COMMENT ON FUNCTION learn_course_visible IS
  '目前登入者看不看得到這門課。三層：有課程功能 → 課程已發布 → 免費或已選課。管理員永遠 true。只回布林，不透露名冊。';

REVOKE ALL ON FUNCTION learn_course_visible(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_visible(UUID) TO authenticated, service_role;


-- ── 課程清單 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_course_list()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_admin BOOLEAN := coalesce(public.is_admin(), false);
  v_out   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  -- 管理員看得到草稿（否則沒辦法預覽自己剛建的課）；學生只看得到已發布的。
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_order, t.created_at), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT
        c.id, c.slug, c.title, c.description, c.instructor, c.cover_path,
        c.level, c.category, c.type, c.access, c.status,
        c.sort_order, c.created_at,
        coalesce(agg.lesson_count, 0)     AS lesson_count,
        coalesce(agg.duration_seconds, 0) AS duration_seconds,
        coalesce(done.completed_count, 0) AS completed_count
      FROM public.learn_courses c
      LEFT JOIN LATERAL (
        SELECT count(*) AS lesson_count, sum(l.duration_seconds) AS duration_seconds
          FROM public.learn_course_sections s
          JOIN public.learn_course_lessons  l ON l.section_id = s.id
         WHERE s.course_id = c.id
      ) agg ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS completed_count
          FROM public.learn_course_sections s
          JOIN public.learn_course_lessons  l ON l.section_id = s.id
          JOIN public.learn_lesson_progress p
            ON p.lesson_id = l.id AND p.student_id = v_uid AND p.completed_at IS NOT NULL
         WHERE s.course_id = c.id
      ) done ON true
     WHERE (v_admin OR c.status = 'PUBLISHED')
       AND public.learn_course_visible(c.id)
    ) t;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION learn_course_list IS
  '學生看得到的課程清單，含影片數、總長與已完成數。🛑 不含 video_id。管理員另外看得到草稿。';

REVOKE ALL ON FUNCTION learn_course_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_list() TO authenticated, service_role;


-- ── 課程大綱 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_course_detail(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_admin BOOLEAN := coalesce(public.is_admin(), false);
  v_c     public.learn_courses%ROWTYPE;
  v_out   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_c FROM public.learn_courses WHERE id = p_course_id;

  -- 🛑 看不到與不存在回傳同一個錯誤。分開講就等於告訴外面
  --    「這門課存在，只是你沒有」，那本身就是資訊。
  IF v_c.id IS NULL OR NOT public.learn_course_visible(p_course_id) THEN
    RAISE EXCEPTION '找不到這門課' USING ERRCODE = 'P0002';
  END IF;

  WITH les AS (
    SELECT s.id AS section_id, s.position AS sec_pos,
           l.id, l.position, l.title, l.description, l.duration_seconds, l.is_preview,
           (pr.completed_at IS NOT NULL)                AS completed,
           coalesce(pr.last_position_seconds, 0)        AS last_position_seconds
      FROM public.learn_course_sections s
      JOIN public.learn_course_lessons  l ON l.section_id = s.id
      LEFT JOIN public.learn_lesson_progress pr
        ON pr.lesson_id = l.id AND pr.student_id = v_uid
     WHERE s.course_id = p_course_id
  ),
  sec AS (
    SELECT s.id, s.position, s.title, s.description,
           CASE
             -- 管理員要能預覽整門課
             WHEN v_admin THEN false
             WHEN v_c.type <> 'DRIP' THEN false
             -- 循序課：前面任何一支沒看完，這一段就是鎖的
             ELSE EXISTS (SELECT 1 FROM les e
                           WHERE e.sec_pos < s.position AND NOT e.completed)
           END AS locked
      FROM public.learn_course_sections s
     WHERE s.course_id = p_course_id
  )
  SELECT jsonb_build_object(
    'course', jsonb_build_object(
      'id', v_c.id, 'slug', v_c.slug, 'title', v_c.title,
      'description', v_c.description, 'instructor', v_c.instructor,
      'cover_path', v_c.cover_path, 'level', v_c.level, 'category', v_c.category,
      'type', v_c.type, 'access', v_c.access, 'status', v_c.status
    ),
    'sections', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', sec.id, 'position', sec.position,
               'title', sec.title, 'description', sec.description,
               'locked', sec.locked,
               'lessons', (
                 SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'id', e.id, 'position', e.position, 'title', e.title,
                          'description', e.description,
                          'duration_seconds', e.duration_seconds,
                          'is_preview', e.is_preview,
                          'completed', e.completed,
                          'last_position_seconds', e.last_position_seconds
                        ) ORDER BY e.position), '[]'::jsonb)
                   FROM les e WHERE e.section_id = sec.id
               )
             ) ORDER BY sec.position), '[]'::jsonb)
        FROM sec
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION learn_course_detail IS
  '一門課的大綱：章節、影片、時長、看完沒、鎖住沒。🛑 回傳【不含】video_id——那要另外呼叫 learn_course_playback()，而且會再驗一次權限。';

REVOKE ALL ON FUNCTION learn_course_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_detail(UUID) TO authenticated, service_role;


-- ── 回報進度 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_lesson_progress_set(
  p_lesson_id UUID,
  p_position_seconds INTEGER DEFAULT NULL,
  p_completed BOOLEAN DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_course_id UUID;
  v_dur       INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  SELECT s.course_id, l.duration_seconds INTO v_course_id, v_dur
    FROM public.learn_course_lessons l
    JOIN public.learn_course_sections s ON s.id = l.section_id
   WHERE l.id = p_lesson_id;

  IF v_course_id IS NULL OR NOT public.learn_course_visible(v_course_id) THEN
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.learn_lesson_progress
         (student_id, lesson_id, last_position_seconds, completed_at)
  VALUES (v_uid, p_lesson_id,
          least(greatest(coalesce(p_position_seconds, 0), 0), greatest(v_dur, 0)),
          CASE WHEN p_completed IS TRUE THEN now() END)
  ON CONFLICT (student_id, lesson_id) DO UPDATE SET
    last_position_seconds = CASE
      WHEN p_position_seconds IS NULL THEN public.learn_lesson_progress.last_position_seconds
      ELSE least(greatest(p_position_seconds, 0), greatest(v_dur, 0)) END,
    -- 🛑 已經完成的不會因為再看一次而被清掉。p_completed = false
    --    的意思是「這次沒有要標記完成」，不是「取消完成」。
    completed_at = CASE
      WHEN p_completed IS TRUE THEN coalesce(public.learn_lesson_progress.completed_at, now())
      ELSE public.learn_lesson_progress.completed_at END,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION learn_lesson_progress_set IS
  '回報觀看位置／標記完成。位置會被夾在 0..duration_seconds 之間。🛑 完成之後不會被後續回報清掉。';

REVOKE ALL ON FUNCTION learn_lesson_progress_set(UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_lesson_progress_set(UUID, INTEGER, BOOLEAN) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('learn_course_visible','learn_course_list',
                        'learn_course_detail','learn_lesson_progress_set'))  AS "新函式數（應為 4）",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN ('learn_course_visible','learn_course_list',
                        'learn_course_detail','learn_lesson_progress_set'))  AS "SECURITY DEFINER（應為 4）",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proconfig @> ARRAY['search_path=""']
      AND p.proname IN ('learn_course_visible','learn_course_list',
                        'learn_course_detail','learn_lesson_progress_set'))  AS "search_path 已鎖（應為 4）";
