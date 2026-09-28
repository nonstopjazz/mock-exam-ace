-- =====================================================
-- 影片課程：管理端
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_learn_courses.sql / _rpcs.sql / _playback.sql。
--
--
-- 🛑 刪影片會連學生的完成紀錄一起刪
--
--   learn_lesson_progress.lesson_id 是 ON DELETE CASCADE。刪掉一支已經
--   有人看完的影片，那些人的完成紀錄就沒了——而且循序課的解鎖是靠它算的，
--   所以下一個單元會在學生眼前重新鎖上，看起來像是系統把進度吃掉了。
--
--   所以 outline_save 在要刪一支【有人看過】的影片時會【報錯】，
--   訊息裡講清楚是哪一支、影響幾個人。不是靜靜地刪掉。
--
-- 🛑 課程沒有硬刪除
--
--   status 有 'ARCHIVED'。整門課刪掉會連所有章節、影片、選課權限與
--   每個學生的進度一起走，而那是救不回來的。下架就夠了。
--
-- 🛑 learn_admin_course_get() 是唯一會回傳 video_id 的讀取 RPC
--
--   管理員要編輯它，所以必須看得到。它一開頭就 learn_require_admin()。
--   學生端那支 learn_course_detail() 仍然不回傳——兩者不要混用。
--
-- 🛑 設定那支【永遠不回傳金鑰本身】，只回傳「讀不讀得到」
--
--   管理畫面需要知道 Vault 設好了沒，不需要知道金鑰是什麼。
--   回傳布林就夠了，回傳字串就是把它送進瀏覽器。
--
-- 回滾：supabase/migrations/create_learn_course_admin.rollback.sql
-- =====================================================

-- ── 讀一門課（含 video_id，僅管理員）──────────────────
CREATE OR REPLACE FUNCTION learn_admin_course_get(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c   public.learn_courses%ROWTYPE;
  v_out JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_get');

  SELECT * INTO v_c FROM public.learn_courses WHERE id = p_course_id;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION '找不到這門課' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'course', to_jsonb(v_c),
    'sections', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'position', s.position,
               'title', s.title, 'description', s.description,
               'lessons', (
                 SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'id', l.id, 'position', l.position, 'title', l.title,
                          'description', l.description,
                          'provider', l.provider, 'video_id', l.video_id,
                          'duration_seconds', l.duration_seconds,
                          'is_preview', l.is_preview,
                          -- 有幾個人看完了。刪之前看得到代價。
                          'completed_by', (SELECT count(*) FROM public.learn_lesson_progress p
                                            WHERE p.lesson_id = l.id AND p.completed_at IS NOT NULL)
                        ) ORDER BY l.position), '[]'::jsonb)
                   FROM public.learn_course_lessons l WHERE l.section_id = s.id
               )
             ) ORDER BY s.position), '[]'::jsonb)
        FROM public.learn_course_sections s WHERE s.course_id = p_course_id
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION learn_admin_course_get IS
  '管理端讀一門課，【含 video_id】供編輯。僅限管理員。🛑 學生端要用 learn_course_detail()，那支不回傳 video_id。';

REVOKE ALL ON FUNCTION learn_admin_course_get(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_get(UUID) TO authenticated, service_role;


-- ── 建課 / 改課 ──────────────────────────────────────
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

  -- 代號撞到【別門課】要講清楚，不要讓 unique violation 冒出原始訊息
  IF EXISTS (SELECT 1 FROM public.learn_courses
              WHERE slug = v_slug AND (v_id IS NULL OR id <> v_id)) THEN
    RAISE EXCEPTION '代號 % 已經被另一門課用了', v_slug USING ERRCODE = '23505';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.learn_courses
      (slug, title, description, instructor, cover_path, level, category,
       type, access, status, sort_order, created_by)
    VALUES (
      v_slug,
      p_course ->> 'title',
      coalesce(p_course ->> 'description', ''),
      coalesce(p_course ->> 'instructor', ''),
      nullif(p_course ->> 'cover_path', ''),
      coalesce(p_course ->> 'level', 'BEGINNER'),
      coalesce(p_course ->> 'category', ''),
      coalesce(p_course ->> 'type', 'STANDARD'),
      coalesce(p_course ->> 'access', 'ENROLLED'),
      coalesce(p_course ->> 'status', 'DRAFT'),
      coalesce((p_course ->> 'sort_order')::INTEGER, 0),
      auth.uid())
    RETURNING * INTO v_out;
  ELSE
    UPDATE public.learn_courses SET
      slug        = v_slug,
      title       = p_course ->> 'title',
      description = coalesce(p_course ->> 'description', ''),
      instructor  = coalesce(p_course ->> 'instructor', ''),
      cover_path  = nullif(p_course ->> 'cover_path', ''),
      level       = coalesce(p_course ->> 'level', level),
      category    = coalesce(p_course ->> 'category', ''),
      type        = coalesce(p_course ->> 'type', type),
      access      = coalesce(p_course ->> 'access', access),
      status      = coalesce(p_course ->> 'status', status),
      sort_order  = coalesce((p_course ->> 'sort_order')::INTEGER, sort_order),
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

COMMENT ON FUNCTION learn_admin_course_save IS
  '建立或修改一門課。沒有 id 就是新建。僅限管理員。🛑 沒有刪除——整門課刪掉會連每個學生的進度一起走，下架（status=ARCHIVED）就夠了。';

REVOKE ALL ON FUNCTION learn_admin_course_save(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_save(JSONB) TO authenticated, service_role;


-- ── 存整份大綱 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_admin_course_outline_save(
  p_course_id UUID,
  p_sections  JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_keep_sections UUID[];
  v_keep_lessons  UUID[];
  v_doomed        RECORD;
  v_sec           JSONB;
  v_les           JSONB;
  v_sec_id        UUID;
  v_les_id        UUID;
  v_sec_pos       INTEGER := 0;
  v_les_pos       INTEGER;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_outline_save');

  IF NOT EXISTS (SELECT 1 FROM public.learn_courses WHERE id = p_course_id) THEN
    RAISE EXCEPTION '找不到這門課' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_sections) <> 'array' THEN
    RAISE EXCEPTION 'p_sections 必須是陣列' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(x), '{}')::UUID[] INTO v_keep_sections
    FROM jsonb_array_elements(p_sections) e,
         LATERAL (SELECT nullif(e ->> 'id', '')) AS t(x) WHERE x IS NOT NULL;

  SELECT coalesce(array_agg(x), '{}')::UUID[] INTO v_keep_lessons
    FROM jsonb_array_elements(p_sections) e,
         jsonb_array_elements(coalesce(e -> 'lessons', '[]'::jsonb)) l,
         LATERAL (SELECT nullif(l ->> 'id', '')) AS t(x) WHERE x IS NOT NULL;

  -- 🛑 先擋下會毀掉學生紀錄的刪除，再動任何一列。
  --    如果先刪一半才報錯，交易雖然會回滾，但訊息會只提到最後那一支。
  FOR v_doomed IN
    SELECT l.id, l.title, s.position AS sec_pos, l.position,
           (SELECT count(*) FROM public.learn_lesson_progress p
             WHERE p.lesson_id = l.id AND p.completed_at IS NOT NULL) AS n
      FROM public.learn_course_lessons l
      JOIN public.learn_course_sections s ON s.id = l.section_id
     WHERE s.course_id = p_course_id
       AND NOT (l.id = ANY (v_keep_lessons))
  LOOP
    IF v_doomed.n > 0 THEN
      RAISE EXCEPTION
        '不能刪「%」——已經有 % 位學生看完它。刪掉會一起刪掉他們的完成紀錄，循序課的下一個單元也會重新鎖上。要移除請先讓它保留，或改成把整門課下架。',
        v_doomed.title, v_doomed.n
        USING ERRCODE = '23503';
    END IF;
  END LOOP;

  -- 刪掉不在這次送來的清單裡的（上面已經確認都沒有人看完）
  DELETE FROM public.learn_course_lessons l
   USING public.learn_course_sections s
   WHERE s.id = l.section_id AND s.course_id = p_course_id
     AND NOT (l.id = ANY (v_keep_lessons));

  DELETE FROM public.learn_course_sections s
   WHERE s.course_id = p_course_id
     AND NOT (s.id = ANY (v_keep_sections));

  -- 🛑 先把現有 position 推高再重排。UNIQUE (course_id, position) 會讓
  --    「第 2 章往上移到第 1 章」在寫到一半時撞號——而那不是資料問題，
  --    是寫入順序問題。推高一次就沒有中途撞號的可能。
  UPDATE public.learn_course_sections
     SET position = position + 10000 WHERE course_id = p_course_id;
  UPDATE public.learn_course_lessons l
     SET position = l.position + 10000
    FROM public.learn_course_sections s
   WHERE s.id = l.section_id AND s.course_id = p_course_id;

  FOR v_sec IN SELECT * FROM jsonb_array_elements(p_sections) LOOP
    v_sec_pos := v_sec_pos + 1;
    v_sec_id  := nullif(v_sec ->> 'id', '')::UUID;

    IF v_sec_id IS NULL THEN
      INSERT INTO public.learn_course_sections (course_id, position, title, description)
      VALUES (p_course_id, v_sec_pos,
              coalesce(nullif(btrim(v_sec ->> 'title'), ''), '未命名章節'),
              coalesce(v_sec ->> 'description', ''))
      RETURNING id INTO v_sec_id;
    ELSE
      UPDATE public.learn_course_sections
         SET position = v_sec_pos,
             title = coalesce(nullif(btrim(v_sec ->> 'title'), ''), '未命名章節'),
             description = coalesce(v_sec ->> 'description', ''),
             updated_at = now()
       WHERE id = v_sec_id AND course_id = p_course_id;
    END IF;

    v_les_pos := 0;
    FOR v_les IN SELECT * FROM jsonb_array_elements(coalesce(v_sec -> 'lessons', '[]'::jsonb)) LOOP
      v_les_pos := v_les_pos + 1;
      v_les_id  := nullif(v_les ->> 'id', '')::UUID;

      IF length(btrim(coalesce(v_les ->> 'video_id', ''))) = 0 THEN
        RAISE EXCEPTION '「%」還沒填影片編號', coalesce(v_les ->> 'title', '(未命名)')
          USING ERRCODE = '22023';
      END IF;
      IF coalesce(v_les ->> 'provider', '') NOT IN ('BUNNY', 'YOUTUBE') THEN
        RAISE EXCEPTION '「%」的影片來源要是 BUNNY 或 YOUTUBE', coalesce(v_les ->> 'title', '(未命名)')
          USING ERRCODE = '22023';
      END IF;

      IF v_les_id IS NULL THEN
        INSERT INTO public.learn_course_lessons
          (section_id, position, title, description, provider, video_id,
           duration_seconds, is_preview)
        VALUES (v_sec_id, v_les_pos,
                coalesce(nullif(btrim(v_les ->> 'title'), ''), '未命名影片'),
                coalesce(v_les ->> 'description', ''),
                v_les ->> 'provider',
                btrim(v_les ->> 'video_id'),
                greatest(coalesce((v_les ->> 'duration_seconds')::INTEGER, 0), 0),
                coalesce((v_les ->> 'is_preview')::BOOLEAN, false));
      ELSE
        UPDATE public.learn_course_lessons SET
          section_id = v_sec_id,              -- 允許把影片搬到別的章節
          position = v_les_pos,
          title = coalesce(nullif(btrim(v_les ->> 'title'), ''), '未命名影片'),
          description = coalesce(v_les ->> 'description', ''),
          provider = v_les ->> 'provider',
          video_id = btrim(v_les ->> 'video_id'),
          duration_seconds = greatest(coalesce((v_les ->> 'duration_seconds')::INTEGER, 0), 0),
          is_preview = coalesce((v_les ->> 'is_preview')::BOOLEAN, false),
          updated_at = now()
         WHERE id = v_les_id;
      END IF;
    END LOOP;
  END LOOP;

  RETURN public.learn_admin_course_get(p_course_id);
END;
$$;

COMMENT ON FUNCTION learn_admin_course_outline_save IS
  '整份大綱一次存好：章節與影片依陣列順序重排，沒送來的就刪掉。🛑 要刪一支已經有人看完的影片會報錯並說明影響幾個人——那會連帶刪掉他們的完成紀錄。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_course_outline_save(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_outline_save(UUID, JSONB) TO authenticated, service_role;


-- ── 選課權限 ──────────────────────────────────────────
-- 形狀刻意對齊 learn_admin_feature_access()，管理畫面才會長得像同一套。
CREATE OR REPLACE FUNCTION learn_admin_course_access(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_out JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_access');

  SELECT jsonb_build_object(
    'course_id', p_course_id,
    'access', (SELECT access FROM public.learn_courses WHERE id = p_course_id),
    'classes', (
      SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.name), '[]'::jsonb)
        FROM (
          SELECT c.id AS class_id, c.name,
                 (SELECT count(*) FROM public.learn_class_members m
                   WHERE m.class_id = c.id AND m.left_at IS NULL)::int AS member_count,
                 EXISTS (SELECT 1 FROM public.learn_course_access a
                          WHERE a.course_id = p_course_id AND a.class_id = c.id) AS granted
            FROM public.learn_classes c WHERE c.status = 'ACTIVE'
        ) x
    ),
    'students', (
      SELECT coalesce(jsonb_agg(row_to_json(y)::jsonb ORDER BY y.name), '[]'::jsonb)
        FROM (
          SELECT a.student_id,
                 public.learn_display_name(a.student_id) AS name,
                 a.granted_at, a.note
            FROM public.learn_course_access a
           WHERE a.course_id = p_course_id AND a.student_id IS NOT NULL
        ) y
    ),
    -- 去重後實際看得到的人數。
    -- 🛑 這個數字【只算選課】，不算「有沒有影片課程這個功能」。
    --    兩者要都成立才看得到，所以實際人數可能比這裡少。UI 要講明白。
    'reach', (
      SELECT count(*)::int FROM (
        SELECT a.student_id AS sid FROM public.learn_course_access a
         WHERE a.course_id = p_course_id AND a.student_id IS NOT NULL
        UNION
        SELECT m.student_id FROM public.learn_course_access a
          JOIN public.learn_class_members m ON m.class_id = a.class_id
          JOIN public.learn_classes c ON c.id = a.class_id
         WHERE a.course_id = p_course_id AND m.left_at IS NULL AND c.status = 'ACTIVE'
      ) u
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION learn_admin_course_access IS
  '一門課的選課狀況：啟用中班級（含是否授權）、個別授權學生、去重後人數。🛑 reach 只算選課，不算「有沒有影片課程功能」——兩者都要成立。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_course_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_access(UUID) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION learn_admin_course_access_set(
  p_course_id UUID,
  p_class_id  UUID DEFAULT NULL,
  p_student_id UUID DEFAULT NULL,
  p_granted   BOOLEAN DEFAULT true,
  p_note      TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_access_set');

  IF num_nonnulls(p_class_id, p_student_id) <> 1 THEN
    RAISE EXCEPTION '一次只能指定一個對象：班級或學生' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learn_courses WHERE id = p_course_id) THEN
    RAISE EXCEPTION '找不到這門課' USING ERRCODE = 'P0002';
  END IF;

  IF p_granted THEN
    -- 冪等：管理員連按兩下是常態，不該變成錯誤訊息
    INSERT INTO public.learn_course_access (course_id, class_id, student_id, granted_by, note)
    VALUES (p_course_id, p_class_id, p_student_id, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.learn_course_access
     WHERE course_id = p_course_id
       AND class_id IS NOT DISTINCT FROM p_class_id
       AND student_id IS NOT DISTINCT FROM p_student_id;
  END IF;

  RETURN public.learn_admin_course_access(p_course_id);
END;
$$;

COMMENT ON FUNCTION learn_admin_course_access_set IS
  '開放或收回一門課。恰好指定一個對象。冪等。🛑 收回只刪授權，不動學生已有的觀看進度。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_course_access_set(UUID, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_access_set(UUID, UUID, UUID, BOOLEAN, TEXT) TO authenticated, service_role;


-- ── Bunny 設定 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_admin_course_config()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_out JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_config');

  SELECT jsonb_build_object(
    'bunny_library_id',        bunny_library_id,
    'bunny_token_ttl_seconds', bunny_token_ttl_seconds,
    'bunny_token_required',    bunny_token_required,
    -- 🛑 只回「讀不讀得到」，【永遠不回金鑰本身】。
    --    畫面要知道 Vault 設好了沒，不需要知道那串字是什麼。
    'vault_key_present',       (public.learn_bunny_token_key() IS NOT NULL),
    -- 有幾支 Bunny 影片正在等這個設定
    'bunny_lesson_count',      (SELECT count(*)::int FROM public.learn_course_lessons
                                 WHERE provider = 'BUNNY')
  ) INTO v_out
  FROM public.learn_course_config WHERE id;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION learn_admin_course_config IS
  'Bunny 的站台設定。🛑 vault_key_present 只是布林——金鑰本身不會離開資料庫。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_course_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_config() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION learn_admin_course_config_set(
  p_library_id TEXT DEFAULT NULL,
  p_ttl_seconds INTEGER DEFAULT NULL,
  p_token_required BOOLEAN DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_config_set');

  IF p_ttl_seconds IS NOT NULL AND p_ttl_seconds NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION '簽章有效期要在 60 秒到 24 小時之間' USING ERRCODE = '22023';
  END IF;

  UPDATE public.learn_course_config SET
    bunny_library_id        = coalesce(nullif(btrim(coalesce(p_library_id, '')), ''), bunny_library_id),
    bunny_token_ttl_seconds = coalesce(p_ttl_seconds, bunny_token_ttl_seconds),
    bunny_token_required    = coalesce(p_token_required, bunny_token_required),
    updated_at = now()
  WHERE id;

  RETURN public.learn_admin_course_config();
END;
$$;

COMMENT ON FUNCTION learn_admin_course_config_set IS
  '改 Bunny 設定。🛑 金鑰不在這裡改——它在 Vault，名稱 BUNNY_TOKEN_AUTH_KEY，由人在 Dashboard 設定。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_course_config_set(TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_config_set(TEXT, INTEGER, BOOLEAN) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'learn_admin_course%')      AS "新函式數（應為 7）",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'learn_admin_course%'
      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])             AS "SECURITY DEFINER + 鎖 search_path（應為 7）",
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name LIKE 'learn_admin_course%'
      AND grantee IN ('anon', 'PUBLIC'))                                      AS "🛑 anon 的授權（必須為 0）";
