-- =====================================================
-- 「以學生身分預覽」：讓管理員看得到學生會被鎖住的樣子
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在合併前端【之前】執行——兩支 RPC 都換了 signature。
--
-- ⚠️ 先執行 create_learn_courses.sql 那一整組、add_learn_lesson_watch_tracking.sql
--    與 add_learn_lesson_duration_autofill.sql。
--
--
-- 【為什麼需要】
--
--   管理員本來就會跳過循序解鎖——不然要預覽第 20 支影片得先把前 19 支
--   看到 90%，內容管理做不下去。那是刻意的。
--
--   但後果是管理員【沒有辦法驗證鎖有沒有在運作】。畫面上單元二是開的，
--   看起來就像功能壞掉——而那正是它被回報的方式。
--
--   p_as_student = true 時，只把【管理員的解鎖豁免】關掉，其餘照舊。
--
-- 🛑 這個參數只會【減少】權限，永遠不會增加
--
--   學生本來就沒有豁免，所以傳 true 對他們沒有任何作用；傳 false 也不會
--   讓任何人拿到他原本沒有的東西。一個只能把自己權限調低的開關是安全的。
--
-- 🛑 它【不】改變草稿的可見性
--
--   草稿課程本來就只有管理員看得到。連這個也一起關掉的話，
--   預覽功能對還沒發布的課就沒用了——而那正是最需要預覽的時候。
--   這個參數只管一件事：循序解鎖。
--
-- 🛑 多一個參數就是新的 signature
--
--   CREATE OR REPLACE 會留下舊的那支，然後 supabase.rpc() 會回
--   function is not unique。兩支都要先 DROP。
--
-- 回滾：supabase/migrations/add_learn_course_student_preview.rollback.sql
-- =====================================================

DROP FUNCTION IF EXISTS learn_course_detail(UUID);
DROP FUNCTION IF EXISTS learn_course_playback(UUID);


CREATE OR REPLACE FUNCTION learn_course_detail(
  p_course_id UUID,
  p_as_student BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  -- 🛑 p_as_student 只把豁免關掉。它不會讓非管理員變成管理員。
  v_admin BOOLEAN := coalesce(public.is_admin(), false) AND NOT coalesce(p_as_student, false);
  v_real_admin BOOLEAN := coalesce(public.is_admin(), false);
  v_c     public.learn_courses%ROWTYPE;
  v_out   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_c FROM public.learn_courses WHERE id = p_course_id;

  -- 🛑 可見性用【真的】管理員身分判斷。預覽模式不該讓草稿課程消失——
  --    還沒發布的時候正是最需要預覽的時候。
  IF v_c.id IS NULL OR NOT (v_real_admin OR public.learn_course_visible(p_course_id)) THEN
    RAISE EXCEPTION '找不到這門課' USING ERRCODE = 'P0002';
  END IF;

  WITH les AS (
    SELECT s.id AS section_id, s.position AS sec_pos,
           l.id, l.position, l.title, l.description, l.duration_seconds, l.is_preview,
           (pr.completed_at IS NOT NULL)                AS completed,
           coalesce(pr.last_position_seconds, 0)        AS last_position_seconds,
           coalesce(pr.watched_seconds, 0)              AS watched_seconds
      FROM public.learn_course_sections s
      JOIN public.learn_course_lessons  l ON l.section_id = s.id
      LEFT JOIN public.learn_lesson_progress pr
        ON pr.lesson_id = l.id AND pr.student_id = v_uid
     WHERE s.course_id = p_course_id
  ),
  sec AS (
    SELECT s.id, s.position, s.title, s.description,
           CASE
             WHEN v_admin THEN false
             WHEN v_c.type <> 'DRIP' THEN false
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
      'type', v_c.type, 'access', v_c.access, 'status', v_c.status,
      'require_watch', v_c.require_watch,
      -- 畫面要據此顯示「你看到的是特權視角」。少了它，管理員會以為鎖壞了。
      'viewer_is_admin', v_real_admin,
      'previewing_as_student', coalesce(p_as_student, false) AND v_real_admin
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
                          'last_position_seconds', e.last_position_seconds,
                          'watched_seconds', e.watched_seconds,
                          'threshold_seconds',
                            ceil(e.duration_seconds * public.learn_watch_complete_ratio())
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
  '一門課的大綱。🛑 不含 video_id。p_as_student = true 時關掉管理員的解鎖豁免（只減不增），但草稿仍然看得到——還沒發布正是最需要預覽的時候。';

REVOKE ALL ON FUNCTION learn_course_detail(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_detail(UUID, BOOLEAN) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION learn_course_playback(
  p_lesson_id UUID,
  p_as_student BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_real_admin BOOLEAN := coalesce(public.is_admin(), false);
  v_admin   BOOLEAN := v_real_admin AND NOT coalesce(p_as_student, false);
  v_l       public.learn_course_lessons%ROWTYPE;
  v_sec_pos INTEGER;
  v_course_id UUID;
  v_course  public.learn_courses%ROWTYPE;
  v_allowed BOOLEAN;
  v_locked  BOOLEAN;
  v_expires BIGINT;
  v_ttl     INTEGER;
  v_url     TEXT;
  v_last    INTEGER;
  v_watched INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  SELECT l.* INTO v_l FROM public.learn_course_lessons l WHERE l.id = p_lesson_id;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.position, s.course_id INTO v_sec_pos, v_course_id
    FROM public.learn_course_sections s WHERE s.id = v_l.section_id;
  SELECT * INTO v_course FROM public.learn_courses WHERE id = v_course_id;

  v_allowed := v_real_admin
    OR public.learn_course_visible(v_course.id)
    OR (v_l.is_preview
        AND v_course.status = 'PUBLISHED'
        AND coalesce(public.learn_feature_enabled('course'), false));

  IF NOT v_allowed THEN
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

  -- 🛑 解鎖規則必須跟 learn_course_detail 的 locked 一致，
  --    包含 p_as_student。畫面說鎖著、這支照發，等於沒鎖。
  v_locked := NOT v_admin
    AND NOT v_l.is_preview
    AND v_course.type = 'DRIP'
    AND EXISTS (
      SELECT 1
        FROM public.learn_course_sections s2
        JOIN public.learn_course_lessons  l2 ON l2.section_id = s2.id
        LEFT JOIN public.learn_lesson_progress p2
          ON p2.lesson_id = l2.id AND p2.student_id = v_uid
       WHERE s2.course_id = v_course.id
         AND s2.position < v_sec_pos
         AND p2.completed_at IS NULL
    );

  IF v_locked THEN
    RAISE EXCEPTION '這個單元還沒解鎖，請先完成前面的單元' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(last_position_seconds, 0), coalesce(watched_seconds, 0)
    INTO v_last, v_watched
    FROM public.learn_lesson_progress
   WHERE student_id = v_uid AND lesson_id = p_lesson_id;

  IF v_l.provider = 'BUNNY' THEN
    SELECT bunny_token_ttl_seconds INTO v_ttl FROM public.learn_course_config WHERE id;
    v_expires := extract(epoch FROM now())::BIGINT + coalesce(v_ttl, 14400);
    v_url := public.learn_bunny_embed_url(v_l.video_id, v_expires);
  ELSE
    v_expires := NULL;
    v_url := format(
      'https://www.youtube-nocookie.com/embed/%s?rel=0&modestbranding=1&enablejsapi=1',
      v_l.video_id);
  END IF;

  RETURN jsonb_build_object(
    'lesson_id',             v_l.id,
    'title',                 v_l.title,
    'description',           v_l.description,
    'provider',              v_l.provider,
    'duration_seconds',      v_l.duration_seconds,
    'last_position_seconds', coalesce(v_last, 0),
    'watched_seconds',       coalesce(v_watched, 0),
    'threshold_seconds',     ceil(v_l.duration_seconds * public.learn_watch_complete_ratio()),
    'require_watch',         v_course.require_watch,
    'embed_url',             v_url,
    'expires_at', CASE WHEN v_expires IS NULL THEN NULL
                       ELSE to_jsonb(to_timestamp(v_expires)) END
  );
END;
$$;

COMMENT ON FUNCTION learn_course_playback IS
  '發一支影片的播放位址。會重新驗權限與解鎖，規則與 learn_course_detail 一致（含 p_as_student）。Bunny 走 Vault 裡的金鑰簽章；YouTube 走 nocookie。';

REVOKE ALL ON FUNCTION learn_course_playback(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_playback(UUID, BOOLEAN) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'learn_course_detail')     AS "🛑 detail 的版本數（必須為 1）",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'learn_course_playback')   AS "🛑 playback 的版本數（必須為 1）",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('learn_course_detail', 'learn_course_playback')
      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])         AS "SECURITY DEFINER + 鎖 search_path（應為 2）";
