-- =====================================================
-- 共用授權前置檢查：public.is_admin()
--
-- 可在「任何」專案執行，用途有二：
--   · 正式 ytzspnjmkvrkbztnaomm —— 稽核目前的定義（section A 的稽核）
--   · 測試 cwymrzcovgobfqxtithn —— 決定要不要先跑 bootstrap_is_admin.sql
--
-- ✅ 完全唯讀。✅ 純 SQL，可直接貼進 Supabase SQL Editor。
-- ✅ 結果累積在暫存表，最後以 SELECT 呈現。
--
-- ⚠️ 這個函式被 writing_submissions / writing_texts / premium_memberships 的
--    RLS、essayAuth Edge Function、generate-pack-audio、useUserProfile 共用。
--    它不是 mock 專屬的東西，任何變更都要用這份先看清楚現況。
--
-- 最後一列 verdict：
--   ABSENT_OK   → 沒有 is_admin()，可以執行 bootstrap_is_admin.sql
--   PRESENT_OK  → 已存在且與 repo 一致，跳過 bootstrap，直接做 search_path 硬化
--   HARDENED    → 已存在且已鎖 search_path，兩份 migration 都不用再跑
--   STOP        → 存在但與預期不符，先查清楚再說
-- =====================================================

DROP TABLE IF EXISTS pg_temp.ia;
CREATE TEMP TABLE ia (seq serial, item text, value text, verdict text);

-- 1. 存在與否 + 簽章
INSERT INTO ia (item, value, verdict)
SELECT '1 是否存在',
       CASE WHEN to_regprocedure('public.is_admin()') IS NULL THEN '不存在' ELSE '存在' END,
       'INFO';

INSERT INTO ia (item, value, verdict)
SELECT '1b 簽章與回傳型別',
       'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || ' → ' || pg_get_function_result(p.oid),
       CASE WHEN pg_get_function_result(p.oid) = 'boolean'
             AND pg_get_function_identity_arguments(p.oid) = '' THEN 'OK' ELSE 'STOP' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- 2. 正規化本體指紋（移除 CR、收斂空白）
-- 正式環境的函式是貼進 SQL Editor 建立的，本體可能含 CRLF，
-- 直接比 md5(prosrc) 會因為換行編碼而誤判。
INSERT INTO ia (item, value, verdict)
SELECT '2 正規化本體指紋',
       md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
       || CASE WHEN md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
                    = '4f2510c540d405db752d1a70d5b0cffb'
               THEN '（與 repo 的 create_user_profiles_table.sql 相符）'
               ELSE '（⚠ 與 repo 不符，預期 4f2510c540d405db752d1a70d5b0cffb）' END,
       CASE WHEN md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g'))
                 = '4f2510c540d405db752d1a70d5b0cffb' THEN 'OK' ELSE 'STOP' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

INSERT INTO ia (item, value, verdict)
SELECT '2b 原始 md5 與 CR 數量（僅供對照）',
       md5(p.prosrc) || ' ／ CR × ' ||
       (length(p.prosrc) - length(replace(p.prosrc, chr(13), '')))::text,
       'INFO'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- 3. SECURITY DEFINER
INSERT INTO ia (item, value, verdict)
SELECT '3 SECURITY DEFINER',
       CASE WHEN p.prosecdef THEN '是' ELSE '否' END,
       CASE WHEN p.prosecdef THEN 'OK' ELSE 'STOP' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- 4. search_path 狀態
INSERT INTO ia (item, value, verdict)
SELECT '4 search_path',
       coalesce(array_to_string(p.proconfig, ','), '(未設定 —— 尚未硬化)'),
       CASE WHEN coalesce(array_to_string(p.proconfig, ','), '') LIKE 'search_path=%'
            THEN 'HARDENED' ELSE 'INFO' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- 5. 擁有者與 EXECUTE 授權
INSERT INTO ia (item, value, verdict)
SELECT '5 擁有者', pg_get_userbyid(p.proowner), 'INFO'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

INSERT INTO ia (item, value, verdict)
SELECT '5b EXECUTE 授權', coalesce(array_to_string(p.proacl, ' '), '(預設：PUBLIC 可執行)'), 'INFO'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

INSERT INTO ia (item, value, verdict)
SELECT '5c authenticated 可否 EXECUTE',
       CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN '可以' ELSE '不可以' END,
       CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'OK' ELSE 'STOP' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- 6. 硬編碼的管理員身分是否仍在
INSERT INTO ia (item, value, verdict)
SELECT '6 授權語意',
       CASE WHEN p.prosrc LIKE '%nonstopjazz@gmail.com%'
            THEN '仍以單一硬編碼 email 判斷（與 repo 一致）'
            ELSE '⚠ 找不到預期的硬編碼 email，授權語意可能已被改過' END,
       CASE WHEN p.prosrc LIKE '%nonstopjazz@gmail.com%' THEN 'OK' ELSE 'STOP' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- 7. 誰在依賴它（RLS 政策）
INSERT INTO ia (item, value, verdict)
SELECT '7 依賴它的 RLS 政策',
       coalesce(string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname), '無'),
       'INFO'
FROM pg_policies
WHERE schemaname = 'public'
  AND (coalesce(qual, '') LIKE '%is_admin()%' OR coalesce(with_check, '') LIKE '%is_admin()%');

-- 8. 行為驗證（若有可用的帳號）
DO $$
DECLARE
  v_admin uuid; v_other uuid; v_a text; v_o text;
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    INSERT INTO ia (item, value, verdict)
      VALUES ('8 行為驗證', '略過（函式不存在）', 'INFO');
    RETURN;
  END IF;

  SELECT id INTO v_admin FROM auth.users WHERE email = 'nonstopjazz@gmail.com';
  SELECT id INTO v_other FROM auth.users WHERE email IS DISTINCT FROM 'nonstopjazz@gmail.com'
   ORDER BY created_at LIMIT 1;

  IF v_admin IS NULL THEN
    INSERT INTO ia (item, value, verdict)
      VALUES ('8 admin 帳號存在於 auth.users', '否 —— 這個專案沒有該 email 的帳號', 'INFO');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    v_a := coalesce(public.is_admin()::text, '(null)');
    INSERT INTO ia (item, value, verdict)
      VALUES ('8 現任 admin 呼叫 is_admin()', v_a, CASE WHEN v_a = 'true' THEN 'OK' ELSE 'STOP' END);
  END IF;

  IF v_other IS NULL THEN
    INSERT INTO ia (item, value, verdict)
      VALUES ('9 一般使用者呼叫 is_admin()', '略過（沒有其他帳號可測）', 'INFO');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    v_o := coalesce(public.is_admin()::text, '(null)');
    INSERT INTO ia (item, value, verdict)
      VALUES ('9 一般使用者呼叫 is_admin()', v_o, CASE WHEN v_o = 'false' THEN 'OK' ELSE 'STOP' END);
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- 總結
INSERT INTO ia (item, value, verdict)
SELECT 'Z 總結',
       CASE
         WHEN to_regprocedure('public.is_admin()') IS NULL
           THEN '沒有 is_admin()：先跑 bootstrap_is_admin.sql，再跑 harden_is_admin_search_path.sql'
         WHEN (SELECT count(*) FROM ia WHERE verdict = 'STOP') > 0
           THEN '有 ' || (SELECT count(*) FROM ia WHERE verdict = 'STOP')::text || ' 項異常，先查清楚'
         WHEN EXISTS (SELECT 1 FROM ia WHERE item LIKE '4 %' AND verdict = 'HARDENED')
           THEN '已存在且已鎖 search_path：bootstrap 與硬化都不用再跑'
         ELSE '已存在且與 repo 一致，尚未硬化：跳過 bootstrap，直接跑 harden_is_admin_search_path.sql'
       END,
       CASE
         WHEN (SELECT count(*) FROM ia WHERE verdict = 'STOP') > 0 THEN 'STOP'
         WHEN to_regprocedure('public.is_admin()') IS NULL THEN 'ABSENT_OK'
         WHEN EXISTS (SELECT 1 FROM ia WHERE item LIKE '4 %' AND verdict = 'HARDENED') THEN 'HARDENED'
         ELSE 'PRESENT_OK'
       END;

SELECT seq, item, value, verdict FROM ia ORDER BY seq;
