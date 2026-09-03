-- =====================================================
-- mock 模考「基礎 schema」指紋 —— 完全唯讀
--
-- 同一份檔案可在任何環境執行：
--   · 正式 ytzspnjmkvrkbztnaomm  → 取得基準（source of truth）
--   · 測試 cwymrzcovgobfqxtithn  → bootstrap 之後比對
--   · 本機 PostgreSQL 16          → 開發時比對
--
-- ✅ 純 SQL，可直接貼進 Supabase SQL Editor（沒有 \ir、\echo、\set）。
-- ✅ 只讀 system catalog。不 INSERT / UPDATE / DELETE / CREATE / ALTER。
-- ✅ 不顯示任何一列業務資料，也不顯示任何學生可識別資訊。
-- ✅ 範圍嚴格限制在 mock 的八張表；iLearn 的 exam_records / exam_types
--    及其函式、政策、trigger 一律不在查詢範圍內。
--
-- 輸出是「一列一行」的穩定排序文字，設計成可以直接 diff：
--   正式跑一次存起來 → staging bootstrap 後跑一次 → 兩份逐行比對
--
-- 比對哪些面向（對應本次檢查點的第 6 項要求）：
--   COL  欄位／型別／可否為空／預設值／是否 generated
--   CON  主鍵、外鍵、唯一鍵、CHECK 的完整定義
--   IDX  索引定義，含 PG15+ 的 nulls not distinct 旗標
--   RLS  RLS 是否啟用／是否 FORCE
--   POL  政策名稱、指令、角色、USING、WITH CHECK
--   TRG  trigger 名稱與完整定義
--   FUN  函式簽章、回傳型別、volatility、security、search_path、內容雜湊
--   ENU  這些欄位用到的 ENUM 型別與其標籤
--   GRA  表級授權
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

SELECT line FROM fp ORDER BY sort, line;
