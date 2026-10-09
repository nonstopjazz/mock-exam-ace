-- =====================================================
-- 錯誤追蹤：學生姓名搜尋（A）+ 班級含已離開（B）
--
-- 🔴 先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_error_query_rpcs.sql 之後執行。
--
-- 回滾：supabase/migrations/add_writing_error_tracking_search_and_history.rollback.sql
--
-- ══════════════════════════════════════════════════════════════════
-- 為什麼
-- ══════════════════════════════════════════════════════════════════
--
-- 「依學生查看」目前只能用班級／題目／時間縮小範圍，沒有姓名搜尋。
-- 學生數到五十、上百，加上第二年第三年的學生之後，會同時撞到兩件事：
--
-- 【A】量 —— 依學生查看的上限是 100 位（RPC 最多吃到 200）。
--      超過會截斷，而截斷保留的是【錯誤最多】的前 100 位，
--      也就是被切掉的是寫得比較乾淨的學生。
--      而「依學生查看」的用途是一對一談話前的準備 —— 那恰好反了。
--
-- 【B】屆別 —— 班級篩選的語意是 S1「目前在籍」（m.left_at IS NULL）。
--      學生一旦被標記離開，在【任何】班級篩選下都找不到他，
--      只會出現在「所有班級」裡 —— 而那正是會截斷的那份清單。
--
--      🛑 這兩件事會互相鎖死：截斷時畫面建議「縮小班級或時間範圍」，
--         但對已離開的學生，縮小班級【做不到】。
--         而且這不用等到明年 —— 今天標記任何一位學生離開就會發生。
--
-- ══════════════════════════════════════════════════════════════════
-- 改什麼
-- ══════════════════════════════════════════════════════════════════
--
-- 【A】writing_admin_student_errors 加 p_name_query TEXT
--
--      只加在 A6（依學生查看）。A4／A5 是「哪些錯／誰犯過這個錯」，
--      用姓名去篩那兩支沒有意義，而且會讓三支的數字對不起來。
--
--      🛑 必須做在伺服器端。在前端對已載入的陣列搜尋，是在一份
--         【已經被截斷到 100 筆】的資料上過濾 —— 搜不到的學生會看起來像
--         「沒有錯誤紀錄」，實際上是沒被撈回來。那比沒有搜尋更危險。
--
--      🛑 student_total 會跟著姓名條件縮小，所以「只顯示前 N 位，共 M 位」
--         那句話在搜尋狀態下仍然是真的。
--
-- 【B】writing_error_scoped_findings 與四支 RPC 都加 p_include_left BOOLEAN
--
--      false（預設）＝ 維持現狀 S1「目前在籍」。
--      true          ＝ 曾在籍即算，包含已離開的。
--
--      加在【共用 scope】而不是單一支，四支的數字才對得起來 ——
--      這是原本那份 migration 的核心設計，不能破壞。
--
-- ══════════════════════════════════════════════════════════════════
-- 🛑 這【不是】加門檻
-- ══════════════════════════════════════════════════════════════════
--
--   原檔頭那條「沒有任何門檻」的規則仍然完整成立：
--   這裡沒有新增任何 HAVING count(*) >= N。
--
--   姓名是【老師主動給的 filter】，跟班級／時間／題目同一類；
--   門檻是【系統偷偷丟掉低頻資料】。前者老師知道自己在縮小範圍，
--   後者老師不知道自己漏掉了什麼。原檔頭說的
--   「要降噪請用 filter 或排序，不要用門檻」指的就是這個。
--
-- ══════════════════════════════════════════════════════════════════
-- 🛑 為什麼是 DROP 而不是 CREATE OR REPLACE
-- ══════════════════════════════════════════════════════════════════
--
--   加參數會改變函式簽章。CREATE OR REPLACE 在簽章不同時不會取代舊的，
--   而是【多建一個 overload】—— 兩個版本並存，而且因為新參數都有預設值，
--   用舊參數呼叫會變成 "function is not unique" 而直接失敗。
--
--   所以先 DROP 舊簽章。已確認沒有其他 migration 呼叫這五支（只有註解提到），
--   所以 DROP 不會連帶弄壞別的東西。
-- =====================================================

DROP FUNCTION IF EXISTS public.writing_admin_error_findings(UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.writing_admin_student_errors(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.writing_admin_error_students(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.writing_admin_error_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER);
-- 共用 scope 最後 drop：上面四支依賴它
DROP FUNCTION IF EXISTS public.writing_error_scoped_findings(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[]);


-- =====================================================
-- 共用 scope
-- =====================================================
/**
 * ⚠️ 這一支【刻意不加 SET search_path】，與這個 repo 其他函式的慣例不同。
 *
 *    帶 SET 的 SQL 函式【無法被 planner inline】，會變成 Function Scan，
 *    索引完全用不到。2026-09-21 在 50,000 列上實測：
 *      不帶 SET → Index Only Scan on idx_wef_code_time   1.1 ms
 *      帶   SET → Function Scan，不走索引                 5.6 ms
 *
 *    安全性由三件事保證，不靠 search_path：
 *      1. 所有物件都【完全限定】（public.xxx）
 *      2. 這一支【不給任何角色 EXECUTE】
 *      3. 四個呼叫端都是 SECURITY DEFINER + SET search_path = ''，
 *         而 SET 涵蓋巢狀呼叫 —— 它執行時 search_path 本來就是空的
 *
 *    🛑 加 p_include_left 之後仍然是單一 SELECT 的 SQL 函式，inlining 不受影響。
 *       不要為了可讀性把它改成 plpgsql —— 那會把索引關掉。
 *
 * 班級語意：
 *   p_include_left = false（預設）→ S1「目前在籍」，m.left_at IS NULL
 *   p_include_left = true          → 曾在籍即算，包含已離開
 */
CREATE FUNCTION writing_error_scoped_findings(
  p_class_id     UUID        DEFAULT NULL,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_topic        TEXT        DEFAULT NULL,
  p_error_codes  TEXT[]      DEFAULT NULL,
  p_include_left BOOLEAN     DEFAULT false)
RETURNS SETOF public.writing_error_findings
LANGUAGE sql
STABLE
AS $$
  SELECT f.*
    FROM public.writing_error_findings f
   WHERE (p_error_codes IS NULL
          OR cardinality(p_error_codes) = 0
          OR f.error_code = ANY (p_error_codes))          -- 多個 code 的語意是 OR
     AND (p_from  IS NULL OR f.essay_submitted_at >= p_from)
     AND (p_to    IS NULL OR f.essay_submitted_at <  p_to)   -- 上界【不含】
     AND (p_topic IS NULL OR f.essay_topic = p_topic)
     AND (p_class_id IS NULL OR EXISTS (
           SELECT 1
             FROM public.learn_class_members m
            WHERE m.student_id = f.student_id
              AND m.class_id   = p_class_id
              -- ★ 班級語意的開關。false 時與改版前完全相同。
              AND (coalesce(p_include_left, false) OR m.left_at IS NULL)))
$$;

COMMENT ON FUNCTION writing_error_scoped_findings IS
  '錯誤追蹤四支 RPC 共用的 scope。刻意不帶 SET search_path 以保留 planner inlining（否則索引失效，實測 5 倍差距）；物件全部完全限定，且不給任何角色 EXECUTE。p_include_left = false 時班級語意是「目前在籍」，true 時包含已離開。';

REVOKE ALL ON FUNCTION writing_error_scoped_findings(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;


-- =====================================================
-- A4  Common Errors
-- =====================================================
CREATE FUNCTION writing_admin_error_overview(
  p_class_id     UUID        DEFAULT NULL,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_topic        TEXT        DEFAULT NULL,
  p_error_codes  TEXT[]      DEFAULT NULL,
  p_limit        INTEGER     DEFAULT 20,
  p_include_left BOOLEAN     DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_total INTEGER;
  v_rows  JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_error_overview：僅限管理員' USING ERRCODE = '42501';
  END IF;

  WITH scoped AS (
    SELECT * FROM public.writing_error_scoped_findings(
      p_class_id, p_from, p_to, p_topic, p_error_codes, p_include_left)),
  agg AS (
    SELECT s.error_code,
           count(DISTINCT s.student_id)::int AS student_count,
           count(DISTINCT s.essay_id)::int   AS essay_count,
           count(*)::int                     AS occurrence_count,
           bool_or(s.is_fallback_code)       AS is_fallback_code,
           min(s.essay_submitted_at)         AS first_seen_at,
           max(s.essay_submitted_at)         AS last_seen_at
      FROM scoped s
     GROUP BY s.error_code
     -- 🛑 這裡【沒有 HAVING】。只出現一次的 code 也要列。
    )
  SELECT count(*)::int,
         coalesce(jsonb_agg(row_to_json(t)::jsonb) FILTER (WHERE t.rn <= v_limit), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (SELECT a.*,
                 row_number() OVER (ORDER BY a.student_count DESC,
                                             a.occurrence_count DESC,
                                             a.error_code) AS rn
            FROM agg a) t;

  RETURN jsonb_build_object(
    'rows',      v_rows,
    'total',     v_total,
    'limit',     v_limit,
    'truncated', v_total > v_limit,
    'scope',     jsonb_build_object('class_id', p_class_id, 'from', p_from, 'to', p_to,
                                    'topic', p_topic, 'error_codes', p_error_codes,
                                    'include_left', coalesce(p_include_left, false)));
END;
$$;

COMMENT ON FUNCTION writing_admin_error_overview IS
  'A4 Common Errors：範圍內每個 error code 的學生數／作文數／出現次數。依【學生數】排序。無任何門檻，只出現一次的 code 也會列出。p_include_left = true 時班級篩選含已離開的學生。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_error_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_error_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER, BOOLEAN)
  TO authenticated, service_role;


-- =====================================================
-- A5  Error → Students
-- =====================================================
CREATE FUNCTION writing_admin_error_students(
  p_class_id     UUID        DEFAULT NULL,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_topic        TEXT        DEFAULT NULL,
  p_error_codes  TEXT[]      DEFAULT NULL,
  p_limit        INTEGER     DEFAULT 100,
  p_include_left BOOLEAN     DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_total INTEGER;
  v_rows  JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_error_students：僅限管理員' USING ERRCODE = '42501';
  END IF;

  WITH scoped AS (
    SELECT * FROM public.writing_error_scoped_findings(
      p_class_id, p_from, p_to, p_topic, p_error_codes, p_include_left)),
  agg AS (
    SELECT s.student_id,
           public.learn_display_name(s.student_id)               AS student_name,
           count(DISTINCT s.essay_id)::int                       AS essay_count,
           count(*)::int                                         AS occurrence_count,
           min(s.essay_submitted_at)                             AS first_seen_at,
           max(s.essay_submitted_at)                             AS last_seen_at,
           array_agg(DISTINCT s.error_code ORDER BY s.error_code) AS matched_codes
      FROM scoped s
     GROUP BY s.student_id
     -- 🛑 這裡【沒有 HAVING】。1 篇 / 1 finding 的學生要在清單裡。
    )
  SELECT count(*)::int,
         coalesce(jsonb_agg(row_to_json(t)::jsonb) FILTER (WHERE t.rn <= v_limit), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (SELECT a.*,
                 row_number() OVER (ORDER BY a.essay_count DESC,
                                             a.occurrence_count DESC,
                                             a.last_seen_at DESC,
                                             a.student_id) AS rn
            FROM agg a) t;

  RETURN jsonb_build_object(
    'rows',      v_rows,
    'total',     v_total,
    'limit',     v_limit,
    'truncated', v_total > v_limit,
    'scope',     jsonb_build_object('class_id', p_class_id, 'from', p_from, 'to', p_to,
                                    'topic', p_topic, 'error_codes', p_error_codes,
                                    'include_left', coalesce(p_include_left, false)));
END;
$$;

COMMENT ON FUNCTION writing_admin_error_students IS
  'A5 Error → Students：範圍內犯過選定錯誤的學生。無任何門檻，1 篇 / 1 finding 也會列出。多個 error code 採 OR。p_include_left = true 時班級篩選含已離開的學生。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_error_students(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_error_students(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER, BOOLEAN)
  TO authenticated, service_role;


-- =====================================================
-- A6  Student → Errors（D8 = S-b）＋ 姓名搜尋
-- =====================================================
/**
 * 🛑 D8 採 S-b，這是整支函式最需要小心的地方：
 *
 *    error_codes 只用來決定【哪些學生入列】（內層），
 *    【不】用來決定顯示哪些 code（外層）。
 *    老師的核心需求是「不要漏掉他犯過哪些錯」。
 *
 * 🛑 p_name_query 同樣只作用在【內層】（決定哪些學生入列）。
 *    一旦學生入列，他在 scope 內的 code 就全部列出 —— 跟 error_codes 一樣的道理。
 *
 * 🛑 student_total 會跟著姓名條件縮小。
 *    所以畫面上「只顯示前 N 位，共 M 位」在搜尋狀態下仍然是真的。
 *    如果 total 保持全域、limit 卻套在搜尋結果上，那句話就會說謊。
 */
CREATE FUNCTION writing_admin_student_errors(
  p_class_id      UUID        DEFAULT NULL,
  p_from          TIMESTAMPTZ DEFAULT NULL,
  p_to            TIMESTAMPTZ DEFAULT NULL,
  p_topic         TEXT        DEFAULT NULL,
  p_error_codes   TEXT[]      DEFAULT NULL,
  p_student_limit INTEGER     DEFAULT 50,
  p_name_query    TEXT        DEFAULT NULL,
  p_include_left  BOOLEAN     DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit    INTEGER := least(greatest(coalesce(p_student_limit, 50), 1), 200);
  v_name     TEXT    := nullif(btrim(coalesce(p_name_query, '')), '');
  v_pattern  TEXT;
  v_total    INTEGER;
  v_students UUID[];
  v_rows     JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_student_errors：僅限管理員' USING ERRCODE = '42501';
  END IF;

  -- 🛑 跳脫 LIKE 的萬用字元。不跳脫的話：
  --      輸入 %  → 比對到【全部】學生，看起來像搜尋壞了
  --      輸入 _  → 變成「任一字元」，多撈出不該出現的人
  --    兩種都是「結果看起來正常但其實是錯的」，所以在進 pattern 之前處理。
  --    反斜線要先處理，否則會把後面補上的跳脫字元再跳脫一次。
  v_pattern := CASE
    WHEN v_name IS NULL THEN NULL
    ELSE '%' || replace(replace(replace(v_name, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  END;

  -- 內層：套【完整】scope（含 error_codes 與姓名）決定哪些學生入列
  WITH picked AS (
    SELECT s.student_id,
           count(DISTINCT s.essay_id) AS ec,
           count(*)                   AS oc,
           max(s.essay_submitted_at)  AS ls
      FROM public.writing_error_scoped_findings(
             p_class_id, p_from, p_to, p_topic, p_error_codes, p_include_left) s
     GROUP BY s.student_id),
  matched AS (
    -- 🛑 display_name 在【聚合之後】才算，一位學生只算一次。
    --    放進 picked 的 WHERE 會變成每一筆 finding 都算一次 ——
    --    同樣的結果，但要多做幾百次 auth.users 查詢。
    SELECT p.*
      FROM picked p
     WHERE v_pattern IS NULL
        OR public.learn_display_name(p.student_id) ILIKE v_pattern)
  SELECT count(*)::int,
         array_agg(m.student_id ORDER BY m.ec DESC, m.oc DESC, m.ls DESC, m.student_id)
           FILTER (WHERE m.rn <= v_limit)
    INTO v_total, v_students
    FROM (SELECT matched.*,
                 row_number() OVER (ORDER BY ec DESC, oc DESC, ls DESC, student_id) AS rn
            FROM matched) m;

  IF v_students IS NULL THEN
    v_students := ARRAY[]::UUID[];
  END IF;

  -- 外層：對這些學生，列出他們在 scope 內【全部】的 code。
  --        ★ 這一次呼叫【刻意不傳 p_error_codes】—— 這就是 S-b。
  --        ★ p_include_left 要照傳，不然外層會比內層少撈到已離開學生的資料。
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb
                            ORDER BY t.student_rank, t.occurrence_count DESC,
                                     t.essay_count DESC, t.error_code), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT s.student_id,
             public.learn_display_name(s.student_id) AS student_name,
             s.error_code,
             count(DISTINCT s.essay_id)::int         AS essay_count,
             count(*)::int                           AS occurrence_count,
             min(s.essay_submitted_at)               AS first_seen_at,
             max(s.essay_submitted_at)               AS last_seen_at,
             bool_or(s.is_fallback_code)             AS is_fallback_code,
             (p_error_codes IS NOT NULL
              AND cardinality(p_error_codes) > 0
              AND s.error_code = ANY (p_error_codes))  AS is_selected,
             array_position(v_students, s.student_id)  AS student_rank
        FROM public.writing_error_scoped_findings(
               p_class_id, p_from, p_to, p_topic, NULL, p_include_left) s
       WHERE s.student_id = ANY (v_students)
       GROUP BY s.student_id, s.error_code
       -- 🛑 這裡【沒有 HAVING】。1 篇 / 1 次的 code 也要列。
      ) t;

  RETURN jsonb_build_object(
    'rows',            v_rows,
    'student_total',   v_total,
    'student_limit',   v_limit,
    'truncated',       v_total > v_limit,
    'selection_mode',  'S-b',
    -- 🛑 把伺服器【實際套用】的姓名條件回傳。
    --    畫面要顯示的是這個值，不是輸入框裡的字 ——
    --    兩者不同時（例如還在輸入、或只打了空白）使用者要看得出來。
    'name_query',      v_name,
    'scope',           jsonb_build_object('class_id', p_class_id, 'from', p_from, 'to', p_to,
                                          'topic', p_topic, 'error_codes', p_error_codes,
                                          'name_query', v_name,
                                          'include_left', coalesce(p_include_left, false)));
END;
$$;

COMMENT ON FUNCTION writing_admin_student_errors IS
  'A6 Student → Errors（D8 = S-b）：error_codes 與 name_query 只決定哪些學生入列；入列的學生會列出他在 scope 內全部的 code，選中的標 is_selected。姓名為不分大小寫的子字串比對，萬用字元已跳脫，student_total 會跟著縮小。無任何門檻。p_include_left = true 時班級篩選含已離開的學生。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_student_errors(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER, TEXT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_student_errors(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER, TEXT, BOOLEAN)
  TO authenticated, service_role;


-- =====================================================
-- A7  Drill-down
-- =====================================================
/**
 * p_include_left 也要有：老師在「含已離開」狀態下點開一位已離開學生的錯誤時，
 * 若這一支還套 S1，findings 會是空的 —— 清單上有、點開卻沒有，
 * 那是最難查的一種不一致。
 */
CREATE FUNCTION writing_admin_error_findings(
  p_student_id   UUID,
  p_error_code   TEXT        DEFAULT NULL,
  p_class_id     UUID        DEFAULT NULL,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_topic        TEXT        DEFAULT NULL,
  p_limit        INTEGER     DEFAULT 50,
  p_include_left BOOLEAN     DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_total INTEGER;
  v_rows  JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_error_findings：僅限管理員' USING ERRCODE = '42501';
  END IF;
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'writing_admin_error_findings：p_student_id 必填' USING ERRCODE = '22023';
  END IF;

  WITH scoped AS (
    SELECT * FROM public.writing_error_scoped_findings(
             p_class_id, p_from, p_to, p_topic,
             CASE WHEN p_error_code IS NULL THEN NULL ELSE ARRAY[p_error_code] END,
             p_include_left) s
     WHERE s.student_id = p_student_id)
  SELECT count(*)::int,
         coalesce(jsonb_agg(
           jsonb_build_object(
             'finding_id',         t.id,
             'essay_id',           t.essay_id,
             'essay_submitted_at', t.essay_submitted_at,
             'essay_topic',        t.essay_topic,
             'finding_index',      t.finding_index,
             'error_code',         t.error_code,
             'primary_skill',      t.primary_skill,
             'quote',              t.quote,
             'correction',         t.correction,
             'reason',             t.reason,
             'is_fallback_code',   t.is_fallback_code)
           ORDER BY t.rn) FILTER (WHERE t.rn <= v_limit), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (SELECT sc.*,
                 row_number() OVER (ORDER BY sc.essay_submitted_at DESC,
                                             sc.essay_id,
                                             sc.finding_index) AS rn
            FROM scoped sc) t;

  RETURN jsonb_build_object(
    'rows',      v_rows,
    'total',     v_total,
    'limit',     v_limit,
    'truncated', v_total > v_limit,
    'scope',     jsonb_build_object('student_id', p_student_id, 'error_code', p_error_code,
                                    'class_id', p_class_id, 'from', p_from, 'to', p_to,
                                    'topic', p_topic,
                                    'include_left', coalesce(p_include_left, false)));
END;
$$;

COMMENT ON FUNCTION writing_admin_error_findings IS
  'A7 Drill-down：某位學生某個錯誤的完整 finding history（原文／修正／說明），依時間新到舊。不做代表性抽樣，correction 原樣回傳。p_include_left 要與清單那一支一致，否則清單上有、點開卻沒有。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_error_findings(UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_error_findings(UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, BOOLEAN)
  TO authenticated, service_role;


-- ── 驗證（唯讀）─────────────────────────────────────────────────
-- 🛑 第一列要確認【沒有留下舊的 overload】。
--    每支函式都應該只有一個版本；出現兩個就是 DROP 沒生效，
--    之後用舊參數呼叫會變成 "function is not unique"。
SELECT p.proname                                                AS "函式",
       count(*) OVER (PARTITION BY p.proname)                   AS "幾個版本",
       p.prosecdef                                              AS "SECURITY_DEFINER",
       coalesce(p.proconfig::text, '（無，刻意的，見註解）')       AS "search_path",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行",
       (pg_get_function_arguments(p.oid) LIKE '%p_include_left%') AS "有_include_left",
       (pg_get_function_arguments(p.oid) LIKE '%p_name_query%')   AS "有_name_query"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_error_scoped_findings',
                     'writing_admin_error_overview',
                     'writing_admin_error_students',
                     'writing_admin_student_errors',
                     'writing_admin_error_findings')
 ORDER BY p.proname;
-- 預期：五列，每列「幾個版本」都是 1
--       四支 admin：SECURITY_DEFINER=true、search_path 空字串、anon=false、登入者=true
--       writing_error_scoped_findings：SECURITY_DEFINER=false、search_path 無、anon=false
--       有_include_left 五支皆 true；有_name_query 只有 writing_admin_student_errors 是 true
