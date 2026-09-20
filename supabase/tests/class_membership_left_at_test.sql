-- =====================================================
-- learn_class_members.left_at 修正的資料層測試
--
-- ⚠️ psql 專用（用到 \set / \echo）。不要貼進 Supabase SQL Editor。
-- ⚠️ 只在本機臨時資料庫跑，絕對不要指向 staging 或 production——
--    這支會 UPDATE learn_class_members。
--
-- 執行方式：
--   createdb latfix
--   psql -v ON_ERROR_STOP=1 -d latfix -f supabase/tests/class_membership_left_at_test.sql
--
-- 這支自己建最小 schema，不需要 baseline migration。它驗證的是：
--
--   1. 修正【前】確實會漏（否則這個測試證明不了任何事）
--   2. 已退出班級的學生不再因該班取得 feature access   ← 權限
--   3. 重新加入（left_at 變回 NULL）後權限恢復
--   4. /admin/writing 的 class filter 不再把退出學生算進該班
--   5. writing_pending_digest() 的 by_class 統計同步修正
--   6. learn_admin_feature_access() 的名單與 reach 同步修正
--   7. by_class 與 unclassed 互補，沒有學生兩邊都不算
--   8. grant / SECURITY DEFINER / search_path 沒有被 CREATE OR REPLACE 動到
--   9. 修正可重複執行，rollback 可來回
-- =====================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- 最小重現環境：只建這四支函式真正會碰到的東西
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT nullif(current_setting('test.is_admin', true), '')::boolean
$$;

CREATE OR REPLACE FUNCTION public.learn_require_admin(p_fn TEXT) RETURNS VOID
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION '%：僅限管理員', p_fn USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE public.learn_profiles (
  id UUID PRIMARY KEY, display_name TEXT, email TEXT);

CREATE OR REPLACE FUNCTION public.learn_display_name(p_uid UUID) RETURNS TEXT
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(p.display_name, split_part(p.email, '@', 1), '未命名學生')
    FROM public.learn_profiles p WHERE p.id = p_uid
$$;

CREATE TABLE public.learn_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE');

CREATE TABLE public.learn_class_members (
  class_id UUID NOT NULL REFERENCES public.learn_classes(id),
  student_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (class_id, student_id));

CREATE TABLE public.learn_feature_access (
  feature TEXT NOT NULL,
  class_id UUID REFERENCES public.learn_classes(id),
  student_id UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT);

CREATE TABLE public.writing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  title TEXT, essay_topic TEXT, essay_date DATE,
  status TEXT NOT NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE public.writing_texts (
  essay_id UUID NOT NULL, char_count INT, word_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE public.writing_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id UUID NOT NULL, status TEXT, analysis_version INT DEFAULT 1,
  requested_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  failed_pass TEXT, error_detail TEXT, attempt_count INT,
  synthesis_status TEXT, synthesis_error_detail TEXT, synthesis_attempt_count INT,
  queue_batch_id UUID, queue_attempts INT, lease_expires_at TIMESTAMPTZ);

CREATE TABLE public.writing_teacher_reviews (
  essay_id UUID PRIMARY KEY, reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE public.writing_teacher_feedback (essay_id UUID PRIMARY KEY);

-- 對照 production 實測的形狀：已退出 1、在籍 21、總計 22
-- 這裡縮小成看得懂的規模，但保留同一個關鍵事實：
--   有一位學生在某班的列還在，只是 left_at 有值。

-- 固定 uuid，方便斷言
\set leaver  '''11111111-1111-1111-1111-111111111111'''
\set stay_a  '''22222222-2222-2222-2222-222222222222'''
\set stay_b  '''33333333-3333-3333-3333-333333333333'''
\set solo    '''44444444-4444-4444-4444-444444444444'''
\set clsA    '''aaaaaaaa-0000-0000-0000-000000000001'''
\set clsB    '''bbbbbbbb-0000-0000-0000-000000000002'''

INSERT INTO public.learn_profiles (id, display_name, email) VALUES
  (:leaver, '退出同學',   'leaver@example.com'),
  (:stay_a, '在籍同學A', 'staya@example.com'),
  (:stay_b, '在籍同學B', 'stayb@example.com'),
  (:solo,   '無班同學',   'solo@example.com');

INSERT INTO public.learn_classes (id, name, status) VALUES
  (:clsA, '高二A', 'ACTIVE'),
  (:clsB, '高二B', 'ACTIVE');

-- 退出同學：高二A 已退出（left_at 有值），高二B 仍在籍
INSERT INTO public.learn_class_members (class_id, student_id, left_at) VALUES
  (:clsA, :leaver, now() - interval '10 days'),
  (:clsB, :leaver, NULL),
  (:clsA, :stay_a, NULL),
  (:clsA, :stay_b, NULL);
-- 無班同學：完全沒有任何 membership 列

-- 功能授權：高二A 這個班被授權 speaking
INSERT INTO public.learn_feature_access (feature, class_id, student_id) VALUES
  ('speaking', :clsA, NULL);

-- 每人一篇待處理作文
INSERT INTO public.writing_submissions (id, student_id, title, status, submitted_at) VALUES
  ('e0000000-0000-0000-0000-000000000001', :leaver, '退出同學的作文', 'SUBMITTED', now() - interval '3 days'),
  ('e0000000-0000-0000-0000-000000000002', :stay_a, 'A的作文',       'SUBMITTED', now() - interval '2 days'),
  ('e0000000-0000-0000-0000-000000000003', :stay_b, 'B的作文',       'SUBMITTED', now() - interval '1 days'),
  ('e0000000-0000-0000-0000-000000000004', :solo,   '無班同學的作文', 'SUBMITTED', now());

INSERT INTO public.writing_texts (essay_id, char_count, word_count)
  SELECT id, 900, 180 FROM public.writing_submissions;

-- =====================================================
-- 載入【修正前】的定義，先證明 bug 真的存在
-- =====================================================
\ir ../migrations/fix_class_membership_left_at.rollback.sql
\ir _class_membership_wrappers.sql

\set leaver  '''11111111-1111-1111-1111-111111111111'''
\set stay_a  '''22222222-2222-2222-2222-222222222222'''
\set clsA    '''aaaaaaaa-0000-0000-0000-000000000001'''
\set clsB    '''bbbbbbbb-0000-0000-0000-000000000002'''

SELECT set_config('test.is_admin','false',false), set_config('test.uid', :leaver, false);
SELECT t_assert(public.learn_feature_enabled('speaking') IS TRUE,
  'B0 修正前：已退出高二A的學生【仍然】拿得到 speaking（這就是那個權限漏洞）');

SELECT set_config('test.is_admin','true',false), set_config('test.uid','',false);
SELECT t_assert(
  (public.learn_admin_feature_access('speaking') -> 'classes' -> 0 ->> 'member_count')::int = 3,
  'B1 修正前：高二A 的 member_count 把退出學生算進去 = 3');
SELECT t_assert((public.learn_admin_feature_access('speaking') ->> 'reach')::int = 3,
  'B2 修正前：reach = 3');
SELECT t_assert(
  (SELECT count(*) FROM jsonb_array_elements(public.writing_admin_queue()) q
    WHERE q -> 'class_names' ? '高二A') = 3,
  'B3 修正前：用高二A 篩選會撈到 3 篇（含已退出學生的）');


-- =====================================================
-- 套用修正
-- =====================================================
\ir ../migrations/fix_class_membership_left_at.sql


-- =====================================================
-- 驗收
-- =====================================================
\echo '--- 2. 已退出班級的學生不再因該班取得 feature access（權限）---'
SELECT set_config('test.is_admin','false',false), set_config('test.uid', :leaver, false);
SELECT t_assert(public.learn_feature_enabled('speaking') IS FALSE,
  'A1 已退出高二A → 不再拿得到 speaking');

SELECT set_config('test.uid', :stay_a, false);
SELECT t_assert(public.learn_feature_enabled('speaking') IS TRUE,
  'A2 在籍學生不受影響，照樣拿得到 speaking');

\echo '--- 3. 重新加入後權限恢復 ---'
SELECT set_config('test.uid', :leaver, false);
UPDATE public.learn_class_members SET left_at = NULL
 WHERE class_id = :clsA AND student_id = :leaver;
SELECT t_assert(public.learn_feature_enabled('speaking') IS TRUE,
  'A3 left_at 清回 NULL → 權限恢復');
SELECT t_assert(
  (SELECT count(*) FROM public.learn_class_members
    WHERE class_id = :clsA AND student_id = :leaver) = 1,
  'A4 重新加入沒有產生第二列（軟移除的語意）');
UPDATE public.learn_class_members SET left_at = now() - interval '10 days'
 WHERE class_id = :clsA AND student_id = :leaver;

\echo '--- 4. /admin/writing 的 class filter ---'
SELECT set_config('test.is_admin','true',false), set_config('test.uid','',false);
SELECT t_assert(
  (SELECT count(*) FROM jsonb_array_elements(public.writing_admin_queue()) q
    WHERE q -> 'class_names' ? '高二A') = 2,
  'A5 高二A 篩選只剩 2 篇（退出學生的那篇掉出去了）');
SELECT t_assert(
  (SELECT q -> 'class_names' FROM jsonb_array_elements(public.writing_admin_queue()) q
    WHERE q ->> 'student_name' = '退出同學') = '["高二B"]'::jsonb,
  'A6 退出學生的作文只掛在他還在籍的高二B 底下');
SELECT t_assert(
  (SELECT count(*) FROM jsonb_array_elements(public.writing_admin_queue()) q) = 4,
  'A7 作文總數沒有變——這次改的是歸屬，不是可見性');

\echo '--- 5. writing_pending_digest() 的 by_class ---'
SET ROLE postgres;
SELECT t_assert(
  (SELECT (b ->> 'count')::int FROM jsonb_array_elements(
     public.writing_pending_digest() -> 'by_class') b WHERE b ->> 'name' = '高二A') = 2,
  'A8 by_class 的高二A = 2');
SELECT t_assert(
  (SELECT (b ->> 'count')::int FROM jsonb_array_elements(
     public.writing_pending_digest() -> 'by_class') b WHERE b ->> 'name' = '高二B') = 1,
  'A9 by_class 的高二B = 1（退出學生在這班還在籍）');
SELECT t_assert((public.writing_pending_digest() ->> 'pending_total')::int = 4,
  'A10 pending_total 不變');

\echo '--- 6. learn_admin_feature_access() 的名單 ---'
RESET ROLE;
SELECT set_config('test.is_admin','true',false);
SELECT t_assert(
  (public.learn_admin_feature_access('speaking') -> 'classes' -> 0 ->> 'member_count')::int = 2,
  'A11 高二A 的 member_count = 2（只算在籍）');
SELECT t_assert((public.learn_admin_feature_access('speaking') ->> 'reach')::int = 2,
  'A12 reach = 2，跟 learn_feature_enabled 的結果一致');

\echo '--- 7. by_class 與 unclassed 互補 ---'
SET ROLE postgres;
UPDATE public.learn_class_members SET left_at = now()
 WHERE class_id = :clsB AND student_id = :leaver;
SELECT t_assert((public.writing_pending_digest() ->> 'unclassed')::int = 2,
  'A13 全部班都退出之後，他變成 unclassed（不會兩邊都不算）');
SELECT t_assert(
  (public.writing_pending_digest() ->> 'unclassed')::int
  + (SELECT count(DISTINCT p.id)::int
       FROM public.writing_submissions p
       JOIN public.learn_class_members m ON m.student_id = p.student_id AND m.left_at IS NULL
       JOIN public.learn_classes c ON c.id = m.class_id AND c.status = 'ACTIVE'
      WHERE p.status = 'SUBMITTED')
  = (public.writing_pending_digest() ->> 'pending_total')::int,
  'A14 不變式：有班的 + 沒班的 = 總數');
UPDATE public.learn_class_members SET left_at = NULL
 WHERE class_id = :clsB AND student_id = :leaver;
RESET ROLE;

\echo '--- 8. grant / SECURITY DEFINER / search_path ---'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
REVOKE ALL ON FUNCTION learn_feature_enabled(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_feature_enabled(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION learn_admin_feature_access(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_feature_access(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION writing_admin_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_admin_queue() TO authenticated, service_role;
REVOKE ALL ON FUNCTION writing_pending_summary_internal()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TEMP TABLE acl_before AS
SELECT p.proname, p.proacl::text AS acl, p.prosecdef, p.proconfig::text AS cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('writing_admin_queue','writing_pending_summary_internal',
                     'learn_feature_enabled','learn_admin_feature_access');

\ir ../migrations/fix_class_membership_left_at.sql

SELECT t_assert(NOT EXISTS (
  SELECT 1 FROM acl_before b
    JOIN pg_proc a ON a.proname = b.proname
    JOIN pg_namespace n ON n.oid = a.pronamespace AND n.nspname='public'
   WHERE b.acl IS DISTINCT FROM a.proacl::text
      OR b.prosecdef <> a.prosecdef
      OR b.cfg IS DISTINCT FROM a.proconfig::text),
  'A15 四支函式的 grant / SECURITY DEFINER / search_path 完全沒變');
SELECT t_assert(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proconfig::text = '{"search_path=\"\""}'
      AND p.proname IN ('writing_admin_queue','writing_pending_summary_internal',
                        'learn_feature_enabled','learn_admin_feature_access')) = 4,
  'A16 四支都還是 SECURITY DEFINER + SET search_path = ''''');

\echo '--- 9. 冪等與來回 ---'
SELECT set_config('test.is_admin','false',false), set_config('test.uid', :leaver, false);
SELECT t_assert(public.learn_feature_enabled('speaking') IS FALSE,
  'A17 修正連跑兩次，結果不變（冪等）');
\ir ../migrations/fix_class_membership_left_at.rollback.sql
SELECT set_config('test.is_admin','false',false), set_config('test.uid', :leaver, false);
SELECT t_assert(public.learn_feature_enabled('speaking') IS TRUE,
  'A18 rollback 之後回到舊行為（權限又回來了——這正是不該回滾的理由）');
\ir ../migrations/fix_class_membership_left_at.sql
SELECT set_config('test.is_admin','false',false), set_config('test.uid', :leaver, false);
SELECT t_assert(public.learn_feature_enabled('speaking') IS FALSE,
  'A19 再套一次修正，回到正確行為');

\echo ''
\echo '全部通過。'
