-- =====================================================
-- mock 模考基礎 schema 指紋「摘要版」—— 完全唯讀
--
-- ⚠️ 本檔是由 supabase/tests/mock_exam_schema_fingerprint.sql 產生的：
--    蒐集邏輯逐字相同，只有最後一句 SELECT 不同。
--    改動 mock_exam_schema_fingerprint.sql 時，必須同步重新產生本檔。
--
-- 逐行版輸出約 270 列，含多行的政策定義與函式原始碼，用肉眼比對不切實際。
-- 本檔改為輸出「每個區段的 md5 + 筆數」，只要比對 11 個雜湊值即可。
-- 任何一個雜湊不同，再回頭用逐行版把那一段撈出來看。
--
-- 刻意排除在雜湊之外的三類（已核可的環境差異）：
--   · ILN(env) —— legacy iLearn 表在正式環境存在、在 staging 不存在
--   · GRA … | postgres —— owner 名稱依專案而異
--   · SRC / B64 / FUN —— 硬化前判分函式的原始碼，
--     正式環境含有貼上時會被吃掉的尾端空白（已知且已核可的差異）
--     這三項改為單獨列出實際值，供人工判讀
-- =====================================================

DROP TABLE IF EXISTS pg_temp.fp;
CREATE TEMP TABLE fp (sort text, line text);

-- mock 基礎 schema 的八張表。這份清單就是本檔的範圍邊界。
DROP TABLE IF EXISTS pg_temp.scope;
CREATE TEMP TABLE scope (t text);
INSERT INTO scope VALUES
  ('exams'), ('question_groups'), ('group_questions'), ('vocabulary_questions'),
  ('translation_questions'), ('essay_questions'), ('exam_attempts'), ('exam_user_answers');

-- ── TAB：資料表是否存在 ──
INSERT INTO fp
SELECT '1:' || s.t,
       'TAB ' || s.t || ' = ' ||
       CASE WHEN to_regclass('public.' || s.t) IS NULL THEN 'MISSING' ELSE 'present' END
FROM scope s;

-- ── COL：欄位 ──
INSERT INTO fp
SELECT '2:' || c.relname || ':' || lpad(a.attnum::text, 4, '0'),
       'COL ' || c.relname || '.' || a.attname
       || ' | ' || format_type(a.atttypid, a.atttypmod)
       || ' | ' || CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END
       || ' | default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
       || ' | generated=' || CASE a.attgenerated WHEN 's' THEN 'STORED' ELSE '-' END
       || ' | identity=' || CASE a.attidentity WHEN '' THEN '-' ELSE a.attidentity::text END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public';

-- ── CON：約束（PK / FK / UNIQUE / CHECK / EXCLUDE）──
INSERT INTO fp
SELECT '3:' || c.relname || ':' || con.conname,
       'CON ' || c.relname || ' | ' || con.conname
       || ' | ' || con.contype::text || ' | ' || pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
WHERE n.nspname = 'public';

-- ── IDX：索引 ──
INSERT INTO fp
SELECT '4:' || c.relname || ':' || ic.relname,
       'IDX ' || c.relname || ' | ' || ic.relname
       || ' | ' || pg_get_indexdef(i.indexrelid)
       || ' | nulls_not_distinct=' || i.indnullsnotdistinct::text
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_class c ON c.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
WHERE n.nspname = 'public';

-- ── RLS：是否啟用／是否 FORCE ──
INSERT INTO fp
SELECT '5:' || c.relname,
       'RLS ' || c.relname
       || ' | enabled=' || c.relrowsecurity::text
       || ' | forced='  || c.relforcerowsecurity::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
WHERE n.nspname = 'public';

-- ── POL：RLS 政策 ──
INSERT INTO fp
SELECT '6:' || p.tablename || ':' || p.policyname,
       'POL ' || p.tablename || ' | ' || p.policyname
       || ' | ' || p.cmd
       || ' | permissive=' || p.permissive
       || ' | roles=' || coalesce(array_to_string(p.roles, ','), '-')
       || ' | using=' || coalesce(p.qual, '-')
       || ' | check=' || coalesce(p.with_check, '-')
FROM pg_policies p
JOIN scope s ON s.t = p.tablename
WHERE p.schemaname = 'public';

-- ── TRG：trigger（不含系統內部的 FK trigger）──
INSERT INTO fp
SELECT '7:' || c.relname || ':' || t.tgname,
       'TRG ' || c.relname || ' | ' || t.tgname
       || ' | ' || pg_get_triggerdef(t.oid)
       || ' | enabled=' || t.tgenabled::text
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
WHERE n.nspname = 'public' AND NOT t.tgisinternal;

-- ── FUN：上述 trigger 實際呼叫到的函式（只看這些，不掃整個 schema）──
INSERT INTO fp
SELECT '8:' || p.proname || ':' || p.oid::text,
       'FUN ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || ' | returns=' || pg_get_function_result(p.oid)
       || ' | volatility=' || p.provolatile::text
       || ' | security_definer=' || p.prosecdef::text
       || ' | config=' || coalesce(array_to_string(p.proconfig, ','), '-')
       || ' | body_md5=' || md5(coalesce(p.prosrc, ''))
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid IN (
    SELECT t.tgfoid
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace nn ON nn.oid = c.relnamespace
    JOIN scope s ON s.t = c.relname
    WHERE nn.nspname = 'public' AND NOT t.tgisinternal);

-- ── SRC：上述函式的完整原始碼
-- body_md5 只能告訴你「有沒有不同」，不能告訴你「差在哪」。
-- 這幾行是要照抄進 bootstrap 的東西，所以整段輸出。
INSERT INTO fp
SELECT '8b:' || p.proname || ':' || p.oid::text,
       'SRC ' || p.proname || ' >>>' || pg_get_functiondef(p.oid) || '<<<'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid IN (
    SELECT t.tgfoid
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace nn ON nn.oid = c.relnamespace
    JOIN scope s ON s.t = c.relname
    WHERE nn.nspname = 'public' AND NOT t.tgisinternal);

-- ── B64：函式本體的 base64
-- 尾端空白在複製貼上時會被吃掉，SRC 於是無法保證位元組等價，
-- 但 body_md5 會照實不同。base64 讓原始位元組可以安全地搬運與比對。
INSERT INTO fp
SELECT '8c:' || p.proname || ':' || p.oid::text,
       'B64 ' || p.proname || ' = ' || replace(encode(convert_to(p.prosrc, 'UTF8'), 'base64'), chr(10), '')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid IN (
    SELECT t.tgfoid
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace nn ON nn.oid = c.relnamespace
    JOIN scope s ON s.t = c.relname
    WHERE nn.nspname = 'public' AND NOT t.tgisinternal);

-- ── ENU：這八張表的欄位用到的 ENUM 型別 ──
INSERT INTO fp
SELECT DISTINCT '9:' || tt.typname,
       'ENU ' || tt.typname || ' = ' || (
         SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
         FROM pg_enum e WHERE e.enumtypid = tt.oid)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_type tt ON tt.oid = a.atttypid
WHERE n.nspname = 'public' AND tt.typtype = 'e';

-- ── GRA：表級授權 ──
INSERT INTO fp
SELECT 'A:' || g.table_name || ':' || g.grantee,
       'GRA ' || g.table_name || ' | ' || g.grantee || ' | '
       || string_agg(g.privilege_type, ',' ORDER BY g.privilege_type)
FROM information_schema.role_table_grants g
JOIN scope s ON s.t = g.table_name
WHERE g.table_schema = 'public'
GROUP BY g.table_name, g.grantee;

-- ── ACL：欄位級授權（硬化前應該一欄都沒有）──
INSERT INTO fp
SELECT 'B:' || c.relname,
       'ACL ' || c.relname || ' | 有明確欄位級授權的欄位數 = '
       || count(*) FILTER (WHERE a.attacl IS NOT NULL)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
GROUP BY c.relname;

-- ── ILN：iLearn legacy 邊界檢查（只計數，不讀資料、不修改）──
INSERT INTO fp
SELECT 'C:1',
       'ILN 範圍內的八張表對 legacy 表有外鍵參照數 = ' || count(*)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_class rc ON rc.oid = con.confrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN scope s ON s.t = c.relname
WHERE n.nspname = 'public' AND con.contype = 'f'
  AND rc.relname IN ('exam_records','exam_types');

INSERT INTO fp
SELECT 'C:2',
       'ILN(env) legacy 表存在狀況（僅供對照，本檔不碰它）：exam_records='
       || CASE WHEN to_regclass('public.exam_records') IS NULL THEN 'absent' ELSE 'present' END
       || ' exam_types='
       || CASE WHEN to_regclass('public.exam_types') IS NULL THEN 'absent' ELSE 'present' END;


-- ─────────────────────────────────────────────
-- 摘要輸出
-- ─────────────────────────────────────────────
DROP TABLE IF EXISTS pg_temp.digest;
CREATE TEMP TABLE digest (ord int, section text, n bigint, md5 text);

INSERT INTO digest
SELECT CASE k
         WHEN 'TAB' THEN 1 WHEN 'COL' THEN 2 WHEN 'CON' THEN 3 WHEN 'IDX' THEN 4
         WHEN 'RLS' THEN 5 WHEN 'POL' THEN 6 WHEN 'TRG' THEN 7 WHEN 'ENU' THEN 8
         WHEN 'GRA' THEN 9 WHEN 'ACL' THEN 10 WHEN 'ILN' THEN 11 END,
       k, count(*), md5(string_agg(line, chr(10) ORDER BY line COLLATE "C"))
FROM (
  SELECT split_part(line, ' ', 1) AS k, line
  FROM fp
  WHERE split_part(line, ' ', 1) IN
        ('TAB','COL','CON','IDX','RLS','POL','TRG','ENU','GRA','ACL','ILN')
    AND line NOT LIKE 'ILN(env)%'
    AND line NOT LIKE 'GRA % | postgres | %'
) x
GROUP BY k;

-- 已核可的環境差異：單獨列出實際值，不進雜湊
INSERT INTO digest
SELECT 90, 'FUN body_md5（正式為 5770eadfefd9ee364e850023a1422f52）', 1,
       coalesce((SELECT substring(line from 'body_md5=([0-9a-f]+)') FROM fp WHERE line LIKE 'FUN %'), '缺少');
INSERT INTO digest
SELECT 91, 'ILN(env)', 1,
       coalesce((SELECT substring(line from 'exam_records=(\w+)') FROM fp WHERE line LIKE 'ILN(env)%'), '缺少');
INSERT INTO digest
SELECT 92, 'GRA … | postgres 筆數', count(*), 'n/a'
FROM fp WHERE line LIKE 'GRA % | postgres | %';

-- 總筆數（不含上面三類例外）
INSERT INTO digest
SELECT 99, '納入雜湊的記錄總數', sum(n), md5(string_agg(md5, chr(10) ORDER BY ord))
FROM digest WHERE ord <= 11;

SELECT ord, section, n, md5 FROM digest ORDER BY ord;
