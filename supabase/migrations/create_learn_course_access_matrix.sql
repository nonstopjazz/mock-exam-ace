-- =====================================================
-- 課程開放：一頁矩陣（學生 × 課程）
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 只新增兩支函式，不改任何既有函式、不改任何資料。
--
-- 回滾：supabase/migrations/create_learn_course_access_matrix.rollback.sql
--
-- ══════════════════════════════════════════════════════════════
-- 為什麼
-- ══════════════════════════════════════════════════════════════
--
-- 要讓一位學生看到一門課，目前要過四個條件，而它們散在兩個頁面：
--
--   1. 有「影片課程」功能      → /admin/feature-access
--   2. 課程 status = PUBLISHED → 課程編輯頁
--   3. 課程 access = FREE      → 課程編輯頁
--   4. 或被選課（班級／個別）   → 課程編輯頁最下面
--
-- 而第 4 項的「個別開放」在 UI 上【只能收回不能新增】——
-- 後端早就支援（learn_admin_course_access_set 帶 p_student_id 就是新增），
-- 缺的只是一個搜尋框。於是畫面上寫著「現在還要從資料庫加」。
--
-- 更根本的問題是【沒有任何地方看得出全貌】：
-- 「這個學生開放了哪些課」要逐門課點進去比對。
--
-- 這兩支函式讓一頁就做完：讀一次拿到整張矩陣，寫一次處理掉功能閘。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 草稿課程也列出來
-- ══════════════════════════════════════════════════════════════
--
--   2026-10-12 production 實測：2 門課，PUBLISHED 是 0（兩門都還是草稿）。
--   如果矩陣只列已發布的課，這一頁現在會是完全空的 —— 看起來像壞掉。
--
--   而「先設定好開放對象、再發布」本來就是正常順序，
--   所以草稿照列，但標記 status，讓畫面說得出「學生還看不到」。
--   ARCHIVED 的不列 —— 那是已經收起來的課。
--
-- ══════════════════════════════════════════════════════════════
-- 🛑 direct 與 inherited 分開回傳
-- ══════════════════════════════════════════════════════════════
--
--   direct     = learn_course_access 有這位學生的列。這是勾選框控制的東西。
--   inherited  = 他經由班級、或因為課程是 FREE 而看得到。【唯讀】。
--
--   合成一個「看得到嗎」的布林會讓畫面無法解釋原因 ——
--   老師會看到一個勾不掉的勾，然後以為壞了。
--   分開之後畫面可以說「繼承自某班」或「免費課」。
-- =====================================================

-- =====================================================
-- 讀：整張矩陣
-- =====================================================
/**
 * 課程開放矩陣。
 *
 * 納入哪些學生：目前在籍於啟用中班級的人，加上任何已有個別選課或
 * 個別功能授權的人（插班／試用的人可能不在任何班級裡，不能漏掉他們）。
 *
 * 🛑 有上限而且會回報 truncated。學生數上去之後，
 *    一次撈全部會讓這一頁變成最慢的頁；而「只顯示前 N 位」不講出來，
 *    老師會以為某個學生不存在。
 */
CREATE OR REPLACE FUNCTION learn_admin_course_access_matrix(
  p_query    TEXT    DEFAULT NULL,
  p_class_id UUID    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit   INTEGER := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_q       TEXT    := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern TEXT;
  v_total   INTEGER;
  v_result  JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_access_matrix');

  -- 🛑 跳脫 LIKE 的萬用字元。不跳脫的話輸入 % 會比對到全部、
  --    _ 會變成任一字元 —— 兩種都是「看起來正常但其實是錯的」。
  --    反斜線要先處理，否則會把後面補的跳脫字元再跳脫一次。
  v_pattern := CASE WHEN v_q IS NULL THEN NULL
    ELSE '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  WITH candidate AS (
    -- 在籍於啟用中班級的
    SELECT m.student_id
      FROM public.learn_class_members m
      JOIN public.learn_classes c ON c.id = m.class_id
     WHERE m.left_at IS NULL
       AND c.status = 'ACTIVE'
       AND (p_class_id IS NULL OR m.class_id = p_class_id)
    UNION
    -- 已有個別選課的（可能是插班／試用，不在任何班級裡）
    SELECT a.student_id
      FROM public.learn_course_access a
     WHERE a.student_id IS NOT NULL
       AND p_class_id IS NULL
    UNION
    -- 已有個別功能授權的
    SELECT fa.student_id
      FROM public.learn_feature_access fa
     WHERE fa.feature = 'course'
       AND fa.student_id IS NOT NULL
       AND p_class_id IS NULL
  ),
  named AS (
    SELECT c.student_id,
           public.learn_display_name(c.student_id) AS name
      FROM candidate c
     WHERE c.student_id IS NOT NULL
  ),
  matched AS (
    SELECT n.*
      FROM named n
     WHERE v_pattern IS NULL OR n.name ILIKE v_pattern
  ),
  ranked AS (
    SELECT m.*, row_number() OVER (ORDER BY m.name, m.student_id) AS rn
      FROM matched m
  )
  SELECT count(*)::int,
         jsonb_build_object(
           'courses', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'course_id', co.id,
                      'title',     co.title,
                      'slug',      co.slug,
                      'status',    co.status,
                      'access',    co.access)
                      ORDER BY co.sort_order, co.title), '[]'::jsonb)
               FROM public.learn_courses co
              -- 🛑 草稿照列（見檔頭）。ARCHIVED 不列。
              WHERE co.status IN ('DRAFT', 'PUBLISHED')
           ),
           'students', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'student_id', r.student_id,
                      'name',       r.name,
                      -- 他目前在籍的班級名稱，讓老師認得出是誰
                      'classes', (
                        SELECT coalesce(jsonb_agg(cl.name ORDER BY cl.name), '[]'::jsonb)
                          FROM public.learn_class_members mm
                          JOIN public.learn_classes cl ON cl.id = mm.class_id
                         WHERE mm.student_id = r.student_id
                           AND mm.left_at IS NULL
                           AND cl.status = 'ACTIVE'),
                      -- 第 1 道閘：有沒有「影片課程」這個功能
                      'has_feature', EXISTS (
                        SELECT 1 FROM public.learn_feature_access fa
                         WHERE fa.feature = 'course' AND fa.student_id = r.student_id
                      ) OR EXISTS (
                        SELECT 1
                          FROM public.learn_feature_access fa
                          JOIN public.learn_class_members mm ON mm.class_id = fa.class_id
                          JOIN public.learn_classes cl       ON cl.id = fa.class_id
                         WHERE fa.feature = 'course'
                           AND mm.student_id = r.student_id
                           AND mm.left_at IS NULL
                           AND cl.status = 'ACTIVE'),
                      -- 功能是個別給的還是班級帶來的（收回時要講得出差別）
                      'feature_direct', EXISTS (
                        SELECT 1 FROM public.learn_feature_access fa
                         WHERE fa.feature = 'course' AND fa.student_id = r.student_id),
                      -- 每一門課的狀態。direct 是勾選框，inherited 是唯讀說明。
                      'courses', (
                        SELECT coalesce(jsonb_object_agg(co.id::text, jsonb_build_object(
                                 'direct', EXISTS (
                                   SELECT 1 FROM public.learn_course_access a
                                    WHERE a.course_id = co.id
                                      AND a.student_id = r.student_id),
                                 -- 經由班級而來的授權，連班名一起回 ——
                                 -- 沒有班名的話畫面只能說「繼承」，老師得自己猜哪一班
                                 'via_class', (
                                   SELECT cl.name
                                     FROM public.learn_course_access a
                                     JOIN public.learn_class_members mm ON mm.class_id = a.class_id
                                     JOIN public.learn_classes cl       ON cl.id = a.class_id
                                    WHERE a.course_id = co.id
                                      AND mm.student_id = r.student_id
                                      AND mm.left_at IS NULL
                                      AND cl.status = 'ACTIVE'
                                    ORDER BY cl.name
                                    LIMIT 1),
                                 'free', co.access = 'FREE'
                               )), '{}'::jsonb)
                          FROM public.learn_courses co
                         WHERE co.status IN ('DRAFT', 'PUBLISHED'))
                    ) ORDER BY r.name, r.student_id), '[]'::jsonb)
               FROM ranked r
              WHERE r.rn <= v_limit
           ),
           -- 🛑 班級清單一起回。從 students[].classes 反推是錯的 ——
           --    那份資料已經被姓名搜尋與上限篩過，篩完剛好沒人的班級
           --    就會從下拉選單裡消失，而那正是你想切過去看的班。
           'classes', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'class_id', cl.id, 'name', cl.name,
                      'member_count', (SELECT count(*) FROM public.learn_class_members mm
                                        WHERE mm.class_id = cl.id AND mm.left_at IS NULL)::int)
                      ORDER BY cl.name), '[]'::jsonb)
               FROM public.learn_classes cl
              WHERE cl.status = 'ACTIVE'
           ),
           'student_limit', v_limit,
           'query',         v_q
         )
    INTO v_total, v_result
    FROM ranked;

  RETURN v_result
         || jsonb_build_object('student_total', coalesce(v_total, 0),
                               'truncated',     coalesce(v_total, 0) > v_limit);
END;
$$;

COMMENT ON FUNCTION learn_admin_course_access_matrix IS
  '課程開放矩陣：學生 × 課程。納入在籍於啟用中班級的學生，加上已有個別選課或個別功能授權的人（插班／試用可能不在任何班級）。每格分開回傳 direct（勾選框控制）與 via_class / free（唯讀的繼承來源）—— 合成單一布林會讓畫面無法解釋「為什麼這個勾勾不掉」。草稿課程照列並帶 status，因為「先設好開放對象再發布」是正常順序。姓名為不分大小寫子字串比對，萬用字元已跳脫。有上限且回報 truncated。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_course_access_matrix(TEXT, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_access_matrix(TEXT, UUID, INTEGER)
  TO authenticated, service_role;


-- =====================================================
-- 寫：開放一門課給一位學生（必要時一併開放功能）
-- =====================================================
/**
 * 🛑 這支存在的理由是「一個動作」。
 *
 *    學生要看到課，功能閘與選課閘都要過。分成兩次呼叫的話，老師會遇到
 *    「我明明勾了課，學生還是看不到」—— 而那是最難自己想通的狀況。
 *
 * 🛑 收回時【不】動功能授權。
 *    他可能還有其他課。把功能一起收掉會連帶弄掉別的課的可見性，
 *    那是這個動作沒有被要求做的事。
 *
 * 回傳做了什麼，讓畫面講得出「順便也開放了影片課程功能」。
 */
CREATE OR REPLACE FUNCTION learn_admin_course_grant_student(
  p_course_id    UUID,
  p_student_id   UUID,
  p_granted      BOOLEAN DEFAULT true,
  p_with_feature BOOLEAN DEFAULT true,
  p_note         TEXT    DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_feature_added BOOLEAN := false;
  v_had_feature   BOOLEAN;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_course_grant_student');

  IF p_course_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION '課程與學生都必填' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learn_courses WHERE id = p_course_id) THEN
    RAISE EXCEPTION '找不到這門課' USING ERRCODE = 'P0002';
  END IF;
  -- 目標不存在就不要建立一個指向空氣的授權
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_student_id) THEN
    RAISE EXCEPTION '找不到這位學生' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(p_granted, true) THEN
    -- 冪等：管理員連按兩下是常態，不該變成錯誤訊息
    INSERT INTO public.learn_course_access (course_id, class_id, student_id, granted_by, note)
    VALUES (p_course_id, NULL, p_student_id, auth.uid(),
            nullif(btrim(coalesce(p_note, '')), ''))
    ON CONFLICT DO NOTHING;

    IF coalesce(p_with_feature, true) THEN
      -- 已經有功能（個別或在籍班級帶來的）就不必再加一列
      SELECT EXISTS (
        SELECT 1 FROM public.learn_feature_access fa
         WHERE fa.feature = 'course' AND fa.student_id = p_student_id
      ) OR EXISTS (
        SELECT 1
          FROM public.learn_feature_access fa
          JOIN public.learn_class_members m ON m.class_id = fa.class_id
          JOIN public.learn_classes c       ON c.id = fa.class_id
         WHERE fa.feature = 'course'
           AND m.student_id = p_student_id
           AND m.left_at IS NULL
           AND c.status = 'ACTIVE'
      ) INTO v_had_feature;

      IF NOT v_had_feature THEN
        INSERT INTO public.learn_feature_access (feature, class_id, student_id, granted_by, note)
        VALUES ('course', NULL, p_student_id, auth.uid(), '由課程開放一併授予')
        ON CONFLICT DO NOTHING;
        v_feature_added := true;
      END IF;
    END IF;
  ELSE
    DELETE FROM public.learn_course_access
     WHERE course_id = p_course_id
       AND class_id IS NULL
       AND student_id = p_student_id;
    -- 🛑 刻意不收回功能授權（見函式註解）
  END IF;

  RETURN jsonb_build_object(
    'granted',       coalesce(p_granted, true),
    'feature_added', v_feature_added);
END;
$$;

COMMENT ON FUNCTION learn_admin_course_grant_student IS
  '開放或收回一門課給【一位學生】，並在開放時必要地一併授予「影片課程」功能（兩道閘要一起過，否則老師會遇到「勾了課學生還是看不到」）。冪等。🛑 收回只刪選課，不動功能授權 —— 他可能還有其他課。回傳 feature_added 讓畫面講得出有沒有順便開放功能。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_course_grant_student(UUID, UUID, BOOLEAN, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_course_grant_student(UUID, UUID, BOOLEAN, BOOLEAN, TEXT)
  TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname                                                AS "函式",
       count(*) OVER (PARTITION BY p.proname)                   AS "幾個版本",
       p.prosecdef                                              AS "SECURITY_DEFINER",
       coalesce(p.proconfig::text, '（無）')                      AS "search_path",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('learn_admin_course_access_matrix',
                     'learn_admin_course_grant_student')
 ORDER BY 1;
-- 預期：兩列，各 1 個版本、DEFINER=true、search_path 空字串、
--       anon=false、登入者=true
