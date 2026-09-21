-- =====================================================
-- 錯誤追蹤的四支查詢 RPC（Phase 1A / A4–A7）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_error_findings{,_sync}.sql 之後執行。
--
-- 計畫：docs/plans/writing-error-intelligence-phase1/04-PHASE-1A-REVISION.md
-- 回滾：supabase/migrations/create_writing_error_query_rpcs.rollback.sql
--
--   writing_error_scoped_findings()      共用 scope（內部）
--   writing_admin_error_overview()       A4 Common Errors
--   writing_admin_error_students()       A5 Error → Students
--   writing_admin_student_errors()       A6 Student → Errors
--   writing_admin_error_findings()       A7 Drill-down
--
--
-- ══════════════════════════════════════════════════════════════════
-- 🛑 最重要的一條規則：沒有任何門檻
-- ══════════════════════════════════════════════════════════════════
--
--   這四支查詢【刻意】沒有 HAVING count(*) >= N，也沒有任何
--   「至少 N 篇」「至少 N 次」的過濾。一次出現就必須列出來。
--
--   這不是疏忽，是這個功能存在的理由。老師的原話是：
--   「不要漏掉某個學生曾經犯過哪些值得 follow-up 的錯。」
--
--   2026-09-21 production 實測（420 筆 findings / 45 篇作文 / 21 位學生）：
--     · WRITE_ERR_ARTICLE 的學生清單裡有【兩位是 1 篇作文 / 1 個 finding】
--     · WRITE_ERR_DISCOURSE_STRUCTURE 全站只有 1 位學生 / 1 篇 / 1 次
--     · WRITE_ERR_THAT 與 WRITE_ERR_COUNTABILITY 各只有 3 次
--
--   任何 HAVING count(*) >= 2 都會讓上面每一項【直接消失】，
--   而那些正是老師最容易漏掉、最想被提醒的案例。
--
--   🛑 如果你之後為了「降噪」想加門檻：不要。
--      要降噪請用 filter（班級／時間／題目／錯誤碼）或排序，不要用門檻。
--      supabase/tests/writing_error_query_rpcs_test.sql 有斷言守住這件事。
-- ══════════════════════════════════════════════════════════════════
-- =====================================================


-- =====================================================
-- 共用 scope —— 四支 RPC 唯一的過濾邏輯
-- =====================================================
/**
 * 依 filter 取出 findings。四支 RPC 全部經過這裡，
 * 所以「三個數字對不起來」在結構上就不可能發生。
 *
 * ⚠️ 這一支【刻意不加 SET search_path】，與這個 repo 其他函式的慣例不同。
 *
 *    理由是實測出來的：帶 SET 的 SQL 函式【無法被 planner inline】，
 *    會變成 Function Scan，索引完全用不到。2026-09-21 在 50,000 列上量測：
 *
 *      不帶 SET → Index Only Scan on idx_wef_code_time（Heap Fetches: 0）  1.1 ms
 *      帶   SET → Function Scan，不走索引                                   5.6 ms
 *
 *    而 production 已經證實 idx_wef_code_time 正在被使用（Bitmap Index Scan），
 *    加上 SET 等於親手把它關掉。
 *
 *    安全性由三件事保證，不靠 search_path：
 *      1. 所有物件都【完全限定】（public.xxx），不依賴任何 search_path
 *      2. 這一支【不給任何角色 EXECUTE】，外界叫不動
 *      3. 四個呼叫端都是 SECURITY DEFINER + SET search_path = ''，
 *         而 SET 在函式執行期間涵蓋巢狀呼叫 —— 它執行時 search_path 本來就是空的
 *
 * 班級語意：S1 = 目前在籍。所以 membership 必須帶 left_at IS NULL。
 * （learn_class_members.left_at 是軟移除；見 PR #128）
 */
CREATE OR REPLACE FUNCTION writing_error_scoped_findings(
  p_class_id    UUID        DEFAULT NULL,
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL,
  p_topic       TEXT        DEFAULT NULL,
  p_error_codes TEXT[]      DEFAULT NULL)
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
     AND (p_to    IS NULL OR f.essay_submitted_at <  p_to)   -- 上界【不含】，避免同一天重複計入
     AND (p_topic IS NULL OR f.essay_topic = p_topic)
     AND (p_class_id IS NULL OR EXISTS (
           SELECT 1
             FROM public.learn_class_members m
            WHERE m.student_id = f.student_id
              AND m.class_id   = p_class_id
              AND m.left_at IS NULL))                     -- ★ S1：目前在籍
$$;

COMMENT ON FUNCTION writing_error_scoped_findings IS
  '錯誤追蹤四支 RPC 共用的 scope。刻意不帶 SET search_path 以保留 planner inlining（否則索引失效，實測 5 倍差距）；物件全部完全限定，且不給任何角色 EXECUTE。';

-- 內部函式。四個呼叫端以擁有者身分執行，靠所有權叫得動。
REVOKE ALL ON FUNCTION writing_error_scoped_findings(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;


-- =====================================================
-- A4  Common Errors
-- =====================================================
/**
 * 「目前範圍內，哪些錯誤有最多【不同學生】犯？」
 *
 * 🛑 排序是 student_count DESC，不是 occurrence_count DESC。
 *    老師要的是「多少人需要聽這堂課」，不是「總共錯了幾次」——
 *    一個學生錯 20 次不構成全班講解的理由。
 *
 *    2026-09-21 production 實測證明這個差別是真的：
 *      · WRITE_ERR_CHINGLISH 是 12 位學生 / 12 篇（每人各一次）——
 *        最乾淨的「值得全班講」訊號，但依作文數排序會把它埋到第 8
 *      · WRITE_ERR_WORD_CLASS 依作文數是第 5，依學生數是第 3
 *      · WRITE_ERR_GRAMMAR_OTHER 依 findings 數（46）會衝到第 3，
 *        依學生數落在第 5 —— 排序本身就在避免老師把傾倒場當成教學主題
 *
 * ⚠️ 第一版【不回傳 errors per 100 words】。D4 已於 2026-09-21 定案只用 raw count。
 */
CREATE OR REPLACE FUNCTION writing_admin_error_overview(
  p_class_id    UUID        DEFAULT NULL,
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL,
  p_topic       TEXT        DEFAULT NULL,
  p_error_codes TEXT[]      DEFAULT NULL,
  p_limit       INTEGER     DEFAULT 20)
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
      p_class_id, p_from, p_to, p_topic, p_error_codes)),
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
                                    'topic', p_topic, 'error_codes', p_error_codes));
END;
$$;

COMMENT ON FUNCTION writing_admin_error_overview IS
  'A4 Common Errors：範圍內每個 error code 的學生數／作文數／出現次數。依【學生數】排序。無任何門檻，只出現一次的 code 也會列出。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_error_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_error_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER)
  TO authenticated, service_role;


-- =====================================================
-- A5  Error → Students
-- =====================================================
/**
 * 「誰犯過這個錯？」—— 老師批改完當下最常問的問題。
 *
 * 🛑 沒有門檻。1 篇 / 1 finding 的學生必須在清單裡。
 *    production 的 WRITE_ERR_ARTICLE 清單尾端就有兩位是這樣。
 *
 * 排序：essay_count DESC（這個錯出現在他幾篇作文裡 = 持續程度），
 *       再 occurrence_count DESC（單篇裡的密集程度）。
 *       與 A4 用「廣度優先」是同一套邏輯。
 *
 * matched_codes：老師若一次選了多個 code，這一欄說明這位學生中的是哪幾個。
 */
CREATE OR REPLACE FUNCTION writing_admin_error_students(
  p_class_id    UUID        DEFAULT NULL,
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL,
  p_topic       TEXT        DEFAULT NULL,
  p_error_codes TEXT[]      DEFAULT NULL,
  p_limit       INTEGER     DEFAULT 100)
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
      p_class_id, p_from, p_to, p_topic, p_error_codes)),
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
                                    'topic', p_topic, 'error_codes', p_error_codes));
END;
$$;

COMMENT ON FUNCTION writing_admin_error_students IS
  'A5 Error → Students：範圍內犯過選定錯誤的學生。無任何門檻，1 篇 / 1 finding 也會列出。多個 error code 採 OR。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_error_students(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_error_students(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER)
  TO authenticated, service_role;


-- =====================================================
-- A6  Student → Errors（D8 = S-b）
-- =====================================================
/**
 * 「這位學生犯過哪些錯？」
 *
 * 🛑 D8 採 S-b，這是整支函式唯一需要小心的地方：
 *
 *    error_codes 只用來決定【哪些學生入列】（內層），
 *    【不】用來決定顯示哪些 code（外層）。
 *
 *    老師選了 ARTICLE → Amy 因為 ARTICLE 而入列，
 *    但畫面上要看到 Amy 在這個 scope 內【全部】的 error code，
 *    其中 ARTICLE 標記 is_selected = true。
 *
 *    為什麼：老師的核心需求是「不要漏掉他犯過哪些錯」。
 *    若外層也套 code filter，等於把老師特地打開的完整清單又砍掉。
 *
 *    ⚠️ 要改成 S-a（只顯示選中的 code），就是把 p_error_codes 也傳進外層那一次
 *       呼叫 —— 一個參數的差別，不需要改 schema。
 *
 * 🛑 沒有門檻。只出現 1 篇 / 1 次的 code 也必須回傳。
 */
CREATE OR REPLACE FUNCTION writing_admin_student_errors(
  p_class_id      UUID        DEFAULT NULL,
  p_from          TIMESTAMPTZ DEFAULT NULL,
  p_to            TIMESTAMPTZ DEFAULT NULL,
  p_topic         TEXT        DEFAULT NULL,
  p_error_codes   TEXT[]      DEFAULT NULL,
  p_student_limit INTEGER     DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit    INTEGER := least(greatest(coalesce(p_student_limit, 50), 1), 200);
  v_total    INTEGER;
  v_students UUID[];
  v_rows     JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_student_errors：僅限管理員' USING ERRCODE = '42501';
  END IF;

  -- 內層：套【完整】scope（含 error_codes）決定哪些學生入列，依相關程度排序後取前 N 位
  WITH picked AS (
    SELECT s.student_id,
           count(DISTINCT s.essay_id) AS ec,
           count(*)                   AS oc,
           max(s.essay_submitted_at)  AS ls
      FROM public.writing_error_scoped_findings(
             p_class_id, p_from, p_to, p_topic, p_error_codes) s
     GROUP BY s.student_id)
  SELECT count(*)::int,
         array_agg(p.student_id ORDER BY p.ec DESC, p.oc DESC, p.ls DESC, p.student_id)
           FILTER (WHERE p.rn <= v_limit)
    INTO v_total, v_students
    FROM (SELECT picked.*,
                 row_number() OVER (ORDER BY ec DESC, oc DESC, ls DESC, student_id) AS rn
            FROM picked) p;

  IF v_students IS NULL THEN
    v_students := ARRAY[]::UUID[];
  END IF;

  -- 外層：對這些學生，列出他們在 scope 內【全部】的 code。
  --        ★ 這一次呼叫【刻意不傳 p_error_codes】—— 這就是 S-b。
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
               p_class_id, p_from, p_to, p_topic, NULL) s   -- ★ NULL = 不套 code filter
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
    'scope',           jsonb_build_object('class_id', p_class_id, 'from', p_from, 'to', p_to,
                                          'topic', p_topic, 'error_codes', p_error_codes));
END;
$$;

COMMENT ON FUNCTION writing_admin_student_errors IS
  'A6 Student → Errors（D8 = S-b）：error_codes 只決定哪些學生入列；入列的學生會列出他在 scope 內全部的 code，選中的標 is_selected。無任何門檻。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_student_errors(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_student_errors(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT[], INTEGER)
  TO authenticated, service_role;


-- =====================================================
-- A7  Drill-down
-- =====================================================
/**
 * 「這位學生的這個錯，實際上是怎麼犯的？」
 *
 * 🛑 【不做代表性抽樣】。Phase 1A 老師要看的是完整的 finding history，
 *    不是被演算法挑過的三則。（02-TRIGGERS-AI-UI.md §H 那套 deterministic
 *    選樣規則是為了餵 AI digest 而設計的，這裡沒有 AI，也不該挑。）
 *
 * ⚠️ correction 原樣回傳，不做任何加工。
 *    2026-09-21 production 實測：約 15% 的 correction 是【整句改寫】而非最小修正
 *    （最小修正 83.1% / 整句改寫 15.2% / 其他 1.7%），
 *    最長的 correction 超過 100 字元。RPC 不負責判斷或截斷 —— 那是 UI 的事。
 *
 * p_student_id 必填：這一支是為「某個人的某個錯」設計的，
 * 不帶學生就等於全表掃描，那不是 drill-down。
 */
CREATE OR REPLACE FUNCTION writing_admin_error_findings(
  p_student_id  UUID,
  p_error_code  TEXT        DEFAULT NULL,
  p_class_id    UUID        DEFAULT NULL,
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL,
  p_topic       TEXT        DEFAULT NULL,
  p_limit       INTEGER     DEFAULT 50)
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
             CASE WHEN p_error_code IS NULL THEN NULL ELSE ARRAY[p_error_code] END) s
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
                                    'topic', p_topic));
END;
$$;

COMMENT ON FUNCTION writing_admin_error_findings IS
  'A7 Drill-down：某位學生某個錯誤的完整 finding history（原文／修正／說明），依時間新到舊。不做代表性抽樣，correction 原樣回傳。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_error_findings(UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_error_findings(UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER)
  TO authenticated, service_role;


-- ── 驗證 ─────────────────────────────────────────────────────────
SELECT p.proname                                                AS "函式",
       p.prosecdef                                              AS "SECURITY_DEFINER",
       coalesce(p.proconfig::text, '（無，刻意的，見註解）')       AS "search_path",
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行",
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS "service_role可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_error_scoped_findings',
                     'writing_admin_error_overview',
                     'writing_admin_error_students',
                     'writing_admin_student_errors',
                     'writing_admin_error_findings')
 ORDER BY p.proname;
-- 預期：四支 admin 函式 SECURITY_DEFINER=true、search_path 為空字串、
--       anon=false、登入者=true、service_role=true
--       writing_error_scoped_findings：SECURITY_DEFINER=false、search_path 無、三個角色皆 false
