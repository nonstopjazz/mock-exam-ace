-- =====================================================
-- 選項亂序（1／5）：排列函式
--
-- 🟢 只要在 production 執行一次。
--
-- 題庫的正解分布嚴重偏斜：A 22.1% / 【B 47.2%】 / C 25.4% / D 5.3%
-- （1746 題實際統計）。練 296 篇下來，學生會先學會「不確定就選 B」——
-- 那不是閱讀能力，而我們的分析會把它記成閱讀能力。
--
-- 解法是讓每個人看到的選項位置不同。做法是【算】不是【存】：
-- 排列由 (session_id, question_id) 的 md5 決定，任何時候都重算得出來，
-- 所以不需要任何 schema 改動，也沒有資訊損失。
--
-- 🛑 這三支函式【不可以發給 authenticated】。
--    拿到排列就能把顯示位置映射回原始標籤，再套用上面那個偏斜去猜——
--    等於把剛補好的洞原樣挖回來。它們只在 SECURITY DEFINER 函式內部被呼叫，
--    那些函式以 owner 身分執行，不需要呼叫者有權限。
--
-- 🛑 排列必須對同一個 (session, question)【永遠相同】。
--    重新整理就重排的話，學生已經點選的答案會指到別的選項上——
--    那比答案偏斜嚴重得多。
--
-- 回滾：supabase/migrations/create_reading_shuffle_1_perm.rollback.sql
-- =====================================================

-- perm[i] = 顯示在第 i 個位置（1=A、2=B、3=C、4=D）的【原始】標籤
CREATE OR REPLACE FUNCTION reading_option_permutation(
  p_session_id UUID, p_question_id UUID)
RETURNS CHAR(1)[]
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT string_to_array((ARRAY[
    'ABCD', 'ABDC', 'ACBD', 'ACDB', 'ADBC', 'ADCB',
    'BACD', 'BADC', 'BCAD', 'BCDA', 'BDAC', 'BDCA',
    'CABD', 'CADB', 'CBAD', 'CBDA', 'CDAB', 'CDBA',
    'DABC', 'DACB', 'DBAC', 'DBCA', 'DCAB', 'DCBA'
  ])[
    1 + (
      -- md5 前 8 個十六進位字元 → 32 bit。& 2147483647 只是把負號清掉，
      -- 不是為了取樣：abs() 碰到 int4 最小值會溢位。
      ('x' || substr(md5(p_session_id::TEXT || ':' || p_question_id::TEXT), 1, 8))
        ::BIT(32)::INT & 2147483647
    ) % 24
  ], NULL)::CHAR(1)[];
$$;

-- 學生按下去的位置 → 題庫裡的原始標籤（用來跟答案表比對）
CREATE OR REPLACE FUNCTION reading_option_to_canonical(
  p_session_id UUID, p_question_id UUID, p_display CHAR(1))
RETURNS CHAR(1)
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT (public.reading_option_permutation(p_session_id, p_question_id))
           [ascii(p_display) - 64];
$$;

-- 題庫裡的原始標籤 → 這個學生這次看到的位置（用來回報正解）
CREATE OR REPLACE FUNCTION reading_option_to_display(
  p_session_id UUID, p_question_id UUID, p_canonical CHAR(1))
RETURNS CHAR(1)
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT chr(64 + array_position(
    public.reading_option_permutation(p_session_id, p_question_id), p_canonical))::CHAR(1);
$$;

-- 🛑 這三支一律不發給 authenticated 與 anon。見檔頭。
REVOKE ALL ON FUNCTION reading_option_permutation(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reading_option_to_canonical(UUID, UUID, CHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reading_option_to_display(UUID, UUID, CHAR) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION reading_option_permutation IS
  '由 (session_id, question_id) 決定的選項排列。24 種之一，純函式、可重算，不存任何東西。🛑 不可發給 authenticated：拿到排列就能把顯示位置映射回原始標籤。';


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.provolatile = 'i'                                       AS "IMMUTABLE",
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS "anon可執行",
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "登入者可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'reading_option_%'
 ORDER BY p.proname;
