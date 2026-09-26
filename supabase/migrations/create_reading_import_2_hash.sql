-- =====================================================
-- Six-Way Reading 匯入（2／4）：canonical 雜湊
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 把一份 canonical payload 正規化之後取 md5，用來判斷
-- 「重新匯入的這一篇跟庫裡那一篇是不是同一份內容」。
--
-- 🛑 為什麼要自己正規化，不能直接 md5(payload::text)
--
--    jsonb 會把物件的鍵排序、去重，所以物件本身是穩定的。
--    但【陣列的順序會原樣保留】——questions、skills、paragraphs、
--    vocabulary 四個陣列只要順序不同，雜湊就不同，而內容其實一樣。
--    那會讓重新匯入變成一片 conflict。
--
--    所以四個陣列都依固定鍵排序之後才計算。
--
-- 🛑 只取 canonical 欄位，不含 filename、batch_id、匯入時間。
--    那些是這一次操作的性質，不是這篇文章的內容。
--
-- 回滾：supabase/migrations/create_reading_import_2_hash.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_canonical_hash(p_payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT md5(jsonb_build_object(
    'passage', p_payload -> 'passage',
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'construct',      q ->> 'construct',
               'question',       q ->> 'question',
               'options',        q -> 'options',
               'correct_answer', q ->> 'correct_answer',
               'explanation',    q ->> 'explanation',
               'skills', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'skill_code', s ->> 'skill_code',
                          'emphasis',   s -> 'emphasis')
                        ORDER BY s ->> 'skill_code')
                   FROM jsonb_array_elements(coalesce(q -> 'skills', '[]'::jsonb)) s
               ), '[]'::jsonb))
             ORDER BY q ->> 'construct')
        FROM jsonb_array_elements(coalesce(p_payload -> 'questions', '[]'::jsonb)) q
    ), '[]'::jsonb),
    'paragraphs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'paragraph_no', pg -> 'paragraph_no',
               'description',  pg ->> 'description')
             ORDER BY (pg ->> 'paragraph_no')::int)
        FROM jsonb_array_elements(coalesce(p_payload -> 'paragraphs', '[]'::jsonb)) pg
    ), '[]'::jsonb),
    'vocabulary', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'tier',         v ->> 'tier',
               'term',         v ->> 'term',
               'definition',   v ->> 'definition',
               'paragraph_no', v -> 'paragraph_no')
             ORDER BY v ->> 'tier', v ->> 'term')
        FROM jsonb_array_elements(coalesce(p_payload -> 'vocabulary', '[]'::jsonb)) v
    ), '[]'::jsonb)
  )::text);
$$;

COMMENT ON FUNCTION reading_canonical_hash IS
  'canonical payload 的內容雜湊。四個陣列先依固定鍵排序——jsonb 會排序物件的鍵，但陣列順序原樣保留，不排序會讓「同樣內容、不同順序」變成 conflict。';

-- 內部函式，不給任何角色。呼叫端是 SECURITY DEFINER，靠所有權執行。
REVOKE ALL ON FUNCTION reading_canonical_hash(JSONB) FROM PUBLIC, anon, authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
-- 預期：兩個雜湊相同（陣列順序不同，內容相同）
SELECT reading_canonical_hash(
         '{"questions":[{"construct":"MI"},{"construct":"SM"}]}'::jsonb)
       = reading_canonical_hash(
         '{"questions":[{"construct":"SM"},{"construct":"MI"}]}'::jsonb)
       AS "陣列順序不影響雜湊";
