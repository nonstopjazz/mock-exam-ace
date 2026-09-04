-- =====================================================
-- 本機測試替身：套用硬化 migration「之前」的正式環境形狀
--
-- ⚠️ 只給本機臨時資料庫使用，絕對不要在任何真實環境執行。
--
-- 內容：
--   · Supabase 平台替身（auth schema、auth.uid()、三個角色）
--   · mock 考試引擎的八張表 —— 直接引入 bootstrap migration 本身，
--     而不是另外抄一份。抄第二份就會有第二份會過期。
--     bootstrap 是照 ytzspnjmkvrkbztnaomm 的指紋逐項重建的。
--   · iLearn 的 exam_records / exam_types 與其政策、trigger、函式、資料
--     —— 用來證明 migration 不會碰到它們
--
-- 執行方式（psql；本檔使用 \ir，不可貼進 Supabase SQL Editor）：
--   createdb mockx
--   cd supabase/tests
--   psql -v ON_ERROR_STOP=1 -d mockx -f mock_exam_prod_fixture.sql
-- =====================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('app.uid', true), '')
  )::uuid;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────
-- mock 考試引擎（硬化前）—— 唯一來源就是 bootstrap migration
-- ─────────────────────────────────────────────
\ir ../migrations/bootstrap_mock_exam_base_schema.sql


-- ─────────────────────────────────────────────
-- iLearn legacy（不在範圍內；用來證明 migration 不碰它）
-- ─────────────────────────────────────────────
CREATE TABLE exam_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text
);

CREATE TABLE exam_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_type_id uuid REFERENCES exam_types(id),
  total_score numeric, max_score numeric,
  percentage_score numeric, grade varchar(10),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_exam_records_student ON exam_records (student_id);

CREATE OR REPLACE FUNCTION public.calculate_total_score()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.total_score IS NOT NULL AND NEW.max_score IS NOT NULL AND NEW.max_score > 0 THEN
    NEW.percentage_score := round((NEW.total_score / NEW.max_score) * 100, 2);
  END IF;
  RETURN NEW;
END; $function$;

CREATE TRIGGER legacy_calc_percentage
  BEFORE INSERT OR UPDATE ON public.exam_records
  FOR EACH ROW EXECUTE FUNCTION public.calculate_total_score();

ALTER TABLE exam_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_types   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own exam records" ON exam_records FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Exam types viewable by all"     ON exam_types   FOR SELECT USING (true);
GRANT SELECT ON exam_records, exam_types TO authenticated;

-- legacy 的真實資料（正式環境有 5 列）
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','student.a@test'),
  ('bbbbbbbb-0000-0000-0000-000000000002','student.b@test');
INSERT INTO exam_types (name) VALUES ('段考'), ('模擬考');
INSERT INTO exam_records (student_id, exam_type_id, total_score, max_score, grade)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', t.id, s.v, 100, 'A'
FROM exam_types t CROSS JOIN (VALUES (88),(92),(75),(81),(69)) AS s(v)
LIMIT 5;
