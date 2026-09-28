-- =====================================================
-- 影片課程：自動進度追蹤
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在合併前端【之前】執行——learn_lesson_progress_set 換了 signature。
--
-- ⚠️ 先執行 create_learn_courses.sql 那一整組。
--
--
-- 【記的是「播過的秒數」，不是「最遠位置」】
--
--   最遠位置擋不住任何東西：把進度條拖到最後，位置就是 100%。
--   所以前端累計的是【實際播放經過的秒數】——播放器每次回報時間，
--   跟上次相差超過 2 秒就當成拖曳，不計入。
--
-- 🛑 這是【客戶端回報的】，不是防作弊機制
--
--   跨網域 iframe 讀不到播放狀態以外的東西，而回報的 JS 跑在學生的瀏覽器裡。
--   會寫程式的人可以偽造。它比「按一個按鈕」嚴謹得多，但不是關卡。
--   說它防得住作弊，是給人一種它沒有的保證。
--
--   伺服器這邊做得到的是一件事：【每次回報的增量不能超過真實經過的時間】。
--   所以「打開影片、直接送 watched = 3600」會被夾掉——想累積一小時，
--   就真的得等一小時。這擋得住最省事的那種作弊，擋不住有耐心的。
--
-- 🛑 learn_courses.require_watch
--
--   false（預設）：學生仍然可以自己按「標記為完成」。播放器載不起來
--                  （擋廣告外掛常常擋掉 YouTube 的 API）時才不會卡死。
--   true         ：只有看到門檻才算完成，按鈕不出現。
--
--   循序課想要「真的看完才解鎖」就開它。開之前要知道上面那條——
--   它擋的是懶得看的人，不是決心要繞過的人。
--
-- 回滾：supabase/migrations/add_learn_lesson_watch_tracking.rollback.sql
-- =====================================================

ALTER TABLE learn_lesson_progress
  ADD COLUMN IF NOT EXISTS watched_seconds INTEGER NOT NULL DEFAULT 0
    CHECK (watched_seconds >= 0);

ALTER TABLE learn_courses
  ADD COLUMN IF NOT EXISTS require_watch BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN learn_lesson_progress.watched_seconds IS
  '實際播放經過的秒數累計（不含拖曳）。🛑 客戶端回報，不是防作弊機制——見 add_learn_lesson_watch_tracking.sql 檔頭。';
COMMENT ON COLUMN learn_courses.require_watch IS
  'true = 只有看到門檻才算完成，「標記為完成」按鈕不出現。false = 學生也可以自己按。';


-- 看到幾成算完成。片尾工作人員名單沒人看，所以不是 100%。
CREATE OR REPLACE FUNCTION learn_watch_complete_ratio() RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$ SELECT 0.90::NUMERIC $$;


-- ── 回報進度 ──────────────────────────────────────────
-- 🛑 多一個參數就是【新的 signature】。CREATE OR REPLACE 會留下舊的那支，
--    然後 supabase.rpc() 會回報 function is not unique。一定要先 DROP。
DROP FUNCTION IF EXISTS learn_lesson_progress_set(UUID, INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION learn_lesson_progress_set(
  p_lesson_id UUID,
  p_position_seconds INTEGER DEFAULT NULL,
  p_completed BOOLEAN DEFAULT NULL,
  p_watched_seconds INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_course_id  UUID;
  v_dur        INTEGER;
  v_require    BOOLEAN;
  v_prev       public.learn_lesson_progress%ROWTYPE;
  v_elapsed    INTEGER;
  v_watched    INTEGER;
  v_threshold  INTEGER;
  v_done       BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  SELECT s.course_id, l.duration_seconds, c.require_watch
    INTO v_course_id, v_dur, v_require
    FROM public.learn_course_lessons l
    JOIN public.learn_course_sections s ON s.id = l.section_id
    JOIN public.learn_courses c ON c.id = s.course_id
   WHERE l.id = p_lesson_id;

  IF v_course_id IS NULL OR NOT public.learn_course_visible(v_course_id) THEN
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_prev FROM public.learn_lesson_progress
   WHERE student_id = v_uid AND lesson_id = p_lesson_id;

  -- 🛑 增量不能超過真實經過的時間。這擋掉「打開影片直接送一小時」。
  --    第一次沒有前一列可以比，給 60 秒的額度。
  v_elapsed := CASE
    WHEN v_prev.lesson_id IS NULL THEN 60
    ELSE greatest(0, extract(epoch FROM (now() - v_prev.updated_at))::INTEGER) + 30
  END;

  v_watched := coalesce(v_prev.watched_seconds, 0);
  IF p_watched_seconds IS NOT NULL THEN
    -- 只增不減，而且一次最多加 v_elapsed，最後夾在影片長度以內
    v_watched := least(
      greatest(v_watched, least(p_watched_seconds, v_watched + v_elapsed)),
      greatest(v_dur, 0));
  END IF;

  v_threshold := ceil(greatest(v_dur, 0) * public.learn_watch_complete_ratio());

  -- 完成的兩條路：看到門檻，或（沒有強制觀看時）學生自己按
  v_done := (v_dur > 0 AND v_watched >= v_threshold)
            OR (p_completed IS TRUE AND coalesce(v_require, false) IS NOT TRUE);

  INSERT INTO public.learn_lesson_progress
         (student_id, lesson_id, last_position_seconds, watched_seconds, completed_at)
  VALUES (v_uid, p_lesson_id,
          least(greatest(coalesce(p_position_seconds, 0), 0), greatest(v_dur, 0)),
          v_watched,
          CASE WHEN v_done THEN now() END)
  ON CONFLICT (student_id, lesson_id) DO UPDATE SET
    last_position_seconds = CASE
      WHEN p_position_seconds IS NULL THEN public.learn_lesson_progress.last_position_seconds
      ELSE least(greatest(p_position_seconds, 0), greatest(v_dur, 0)) END,
    watched_seconds = v_watched,
    -- 🛑 已經完成的不會因為再看一次而被清掉
    completed_at = CASE
      WHEN v_done THEN coalesce(public.learn_lesson_progress.completed_at, now())
      ELSE public.learn_lesson_progress.completed_at END,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'watched_seconds', v_watched,
    'threshold_seconds', v_threshold,
    -- 畫面要能說「再看 N 秒就算完成」，而不是只有一個完成沒完成
    'completed', (SELECT completed_at IS NOT NULL FROM public.learn_lesson_progress
                   WHERE student_id = v_uid AND lesson_id = p_lesson_id));
END;
$$;

COMMENT ON FUNCTION learn_lesson_progress_set IS
  '回報觀看進度。watched_seconds 只增不減，單次增量不得超過真實經過的時間，達 90% 自動完成。🛑 客戶端回報，不是防作弊機制。require_watch = true 時「自己按完成」無效。';

REVOKE ALL ON FUNCTION learn_lesson_progress_set(UUID, INTEGER, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_lesson_progress_set(UUID, INTEGER, BOOLEAN, INTEGER) TO authenticated, service_role;


-- ── 大綱要帶出門檻與已看秒數 ──────────────────────────
-- signature 沒變，CREATE OR REPLACE 即可。
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

  IF v_c.id IS NULL OR NOT public.learn_course_visible(p_course_id) THEN
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
      'require_watch', v_c.require_watch
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

REVOKE ALL ON FUNCTION learn_course_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_detail(UUID) TO authenticated, service_role;


-- ── 管理端存課程時要能設 require_watch ────────────────
CREATE OR REPLACE FUNCTION learn_admin_course_save(p_course JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id   UUID := nullif(p_course ->> 'id', '')::UUID;
  v_slug TEXT := btrim(coalesce(p_course ->> 'slug', ''));
  v_out  public.learn_courses%ROWTYPE;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_save');

  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN
    RAISE EXCEPTION '代號只能用小寫英數與連字號，2–63 個字元（目前：%）', v_slug
      USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_course ->> 'title', ''))) = 0 THEN
    RAISE EXCEPTION '課名不能空白' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learn_courses
              WHERE slug = v_slug AND (v_id IS NULL OR id <> v_id)) THEN
    RAISE EXCEPTION '代號 % 已經被另一門課用了', v_slug USING ERRCODE = '23505';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.learn_courses
      (slug, title, description, instructor, cover_path, level, category,
       type, access, status, sort_order, require_watch, created_by)
    VALUES (
      v_slug, p_course ->> 'title',
      coalesce(p_course ->> 'description', ''),
      coalesce(p_course ->> 'instructor', ''),
      nullif(p_course ->> 'cover_path', ''),
      coalesce(p_course ->> 'level', 'BEGINNER'),
      coalesce(p_course ->> 'category', ''),
      coalesce(p_course ->> 'type', 'STANDARD'),
      coalesce(p_course ->> 'access', 'ENROLLED'),
      coalesce(p_course ->> 'status', 'DRAFT'),
      coalesce((p_course ->> 'sort_order')::INTEGER, 0),
      coalesce((p_course ->> 'require_watch')::BOOLEAN, false),
      auth.uid())
    RETURNING * INTO v_out;
  ELSE
    UPDATE public.learn_courses SET
      slug = v_slug, title = p_course ->> 'title',
      description = coalesce(p_course ->> 'description', ''),
      instructor  = coalesce(p_course ->> 'instructor', ''),
      cover_path  = nullif(p_course ->> 'cover_path', ''),
      level       = coalesce(p_course ->> 'level', level),
      category    = coalesce(p_course ->> 'category', ''),
      type        = coalesce(p_course ->> 'type', type),
      access      = coalesce(p_course ->> 'access', access),
      status      = coalesce(p_course ->> 'status', status),
      sort_order  = coalesce((p_course ->> 'sort_order')::INTEGER, sort_order),
      require_watch = coalesce((p_course ->> 'require_watch')::BOOLEAN, require_watch),
      updated_at  = now()
     WHERE id = v_id
    RETURNING * INTO v_out;

    IF v_out.id IS NULL THEN
      RAISE EXCEPTION '找不到這門課' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN to_jsonb(v_out);
END;
$$;

REVOKE ALL ON FUNCTION learn_admin_course_save(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_save(JSONB) TO authenticated, service_role;


-- ── YouTube 的 embed 要打開 JS API ────────────────────
-- 🛑 沒有 enablejsapi=1 就讀不到播放時間，自動追蹤整個不會動——
--    而且不會報錯，只會永遠停在 0 秒。
-- signature 沒變，CREATE OR REPLACE 即可。
CREATE OR REPLACE FUNCTION learn_course_playback(p_lesson_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_admin   BOOLEAN := coalesce(public.is_admin(), false);
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

  v_allowed := public.learn_course_visible(v_course.id)
    OR (v_l.is_preview
        AND v_course.status = 'PUBLISHED'
        AND coalesce(public.learn_feature_enabled('course'), false));

  IF NOT v_allowed THEN
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

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
    -- enablejsapi=1 讓前端讀得到播放時間；nocookie 仍然保留
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

REVOKE ALL ON FUNCTION learn_course_playback(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_playback(UUID) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'learn_lesson_progress' AND column_name = 'watched_seconds')  AS "watched_seconds（應為 1）",
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'learn_courses' AND column_name = 'require_watch')            AS "require_watch（應為 1）",
  -- 🛑 舊 signature 必須消失，否則 supabase.rpc() 會回 function is not unique
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'learn_lesson_progress_set')          AS "🛑 progress_set 的版本數（必須為 1）",
  (SELECT learn_watch_complete_ratio())                                              AS "完成門檻",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'learn_course_playback'
      AND pg_get_functiondef(p.oid) LIKE '%enablejsapi=1%')                           AS "YouTube 開了 JS API（應為 1）";
