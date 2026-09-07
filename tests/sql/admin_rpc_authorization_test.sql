-- =====================================================
-- 四支 admin RPC 的授權測試
--   admin_get_all_users / admin_get_user_stats
--   admin_grant_premium / admin_revoke_premium
--
-- 🛑 本機專用。會寫入 premium_memberships。
--    需要 auth.users、user_profiles、premium_memberships、is_admin()，
--    以及重現 Supabase ALTER DEFAULT PRIVILEGES 的環境。
--
-- ⚠️ 身分切換必須在【同一個交易】裡：set_config(..., true) 是交易區域的。
--    分開的 statement 各自是一個交易，設定會消失，未登入路徑會被誤測成
--    「已登入」，測試就會假通過。整段包在一個 DO 區塊裡，所以是同一個交易。
--
-- 輸出一張表：項目 / 結果 / 說明。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;

DO $test$
DECLARE
  v_admin    UUID;
  v_student  UUID;
  v_victim   UUID;
  v_before   INTEGER;
  v_after    INTEGER;
  v_n        INTEGER;
  v_json     JSONB;
  v_ms       UUID;
BEGIN
  SELECT id INTO v_admin   FROM auth.users WHERE email = 'nonstopjazz@gmail.com' LIMIT 1;
  SELECT id INTO v_student FROM auth.users WHERE email <> 'nonstopjazz@gmail.com'
   ORDER BY email LIMIT 1;
  SELECT id INTO v_victim  FROM auth.users WHERE email <> 'nonstopjazz@gmail.com'
     AND id <> v_student ORDER BY email LIMIT 1;

  IF v_admin IS NULL OR v_student IS NULL OR v_victim IS NULL THEN
    INSERT INTO t (name, verdict, detail) VALUES
      ('前置資料', 'FAIL', '需要 1 個管理員帳號與至少 2 個非管理員帳號');
    RETURN;
  END IF;

  /* ================================================================
     1. 未登入（anon key —— 內建於每一份瀏覽器 bundle）
     ================================================================ */
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO t (name, verdict, detail) VALUES
    ('[前提] is_admin() 對未登入者回傳 NULL，不是 false',
     CASE WHEN is_admin() IS NULL THEN 'PASS' ELSE 'FAIL' END,
     coalesce(is_admin()::text, 'NULL') || ' —— 這正是 IF NOT is_admin() 會失守的原因');

  v_json := admin_get_all_users()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('ANON 讀不到使用者名單',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' THEN 'PASS' ELSE 'FAIL' END,
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' THEN '已擋下'
          ELSE '⚠️ 外洩 ' || coalesce(jsonb_array_length(v_json -> 'users')::text, '?') || ' 筆' END);

  v_json := admin_get_user_stats()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('ANON 讀不到使用者統計',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' THEN 'PASS' ELSE 'FAIL' END,
     coalesce(v_json ->> 'error', '⚠️ 竟然回傳 total_users=' || coalesce(v_json ->> 'total_users', '?')));

  SELECT count(*) INTO v_before FROM premium_memberships;
  v_json := admin_grant_premium(v_victim, NULL, 'ANON 嘗試自行開通')::jsonb;
  SELECT count(*) INTO v_after FROM premium_memberships;
  INSERT INTO t (name, verdict, detail) VALUES
    ('ANON 不能授予 premium',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' AND v_after = v_before
          THEN 'PASS' ELSE 'FAIL' END,
     CASE WHEN v_after > v_before
          THEN '⚠️ 真的寫進去了（新增 ' || (v_after - v_before) || ' 列）'
          ELSE '已擋下，未新增任何列' END);

  -- 先用管理員身分造一列，才有東西可以測「未登入者能不能撤銷」
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM admin_grant_premium(v_victim, NULL, '測試用');
  SELECT id INTO v_ms FROM premium_memberships
   WHERE user_id = v_victim AND is_active AND notes = '測試用' LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_json := admin_revoke_premium(v_ms)::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('ANON 不能撤銷 premium',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED'
           AND (SELECT is_active FROM premium_memberships WHERE id = v_ms)
          THEN 'PASS' ELSE 'FAIL' END,
     CASE WHEN (SELECT is_active FROM premium_memberships WHERE id = v_ms)
          THEN '已擋下，會員資格未被動到' ELSE '⚠️ 真的被撤銷了' END);

  /* ================================================================
     2. 已登入的一般使用者
     ================================================================ */
  PERFORM set_config('request.jwt.claim.sub', v_student::text, true);

  INSERT INTO t (name, verdict, detail) VALUES
    ('[前提] 一般使用者的 is_admin() 是 false',
     CASE WHEN is_admin() IS FALSE THEN 'PASS' ELSE 'FAIL' END, coalesce(is_admin()::text, 'NULL'));

  INSERT INTO t (name, verdict, detail) VALUES
    ('一般使用者讀不到使用者名單',
     CASE WHEN admin_get_all_users()::jsonb ->> 'error' = 'UNAUTHORIZED'
          THEN 'PASS' ELSE 'FAIL' END,
     coalesce(admin_get_all_users()::jsonb ->> 'error', '⚠️ 竟然成功'));

  INSERT INTO t (name, verdict, detail) VALUES
    ('一般使用者讀不到使用者統計',
     CASE WHEN admin_get_user_stats()::jsonb ->> 'error' = 'UNAUTHORIZED'
          THEN 'PASS' ELSE 'FAIL' END,
     coalesce(admin_get_user_stats()::jsonb ->> 'error', '⚠️ 竟然成功'));

  SELECT count(*) INTO v_before FROM premium_memberships;
  v_json := admin_grant_premium(v_student, NULL, '學生嘗試自己開通')::jsonb;
  SELECT count(*) INTO v_after FROM premium_memberships;
  INSERT INTO t (name, verdict, detail) VALUES
    ('一般使用者不能替自己授予 premium',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' AND v_after = v_before
          THEN 'PASS' ELSE 'FAIL' END,
     CASE WHEN v_after > v_before THEN '⚠️ 真的寫進去了' ELSE '已擋下' END);

  v_json := admin_revoke_premium(v_ms)::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('一般使用者不能撤銷別人的 premium',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED'
           AND (SELECT is_active FROM premium_memberships WHERE id = v_ms)
          THEN 'PASS' ELSE 'FAIL' END,
     CASE WHEN (SELECT is_active FROM premium_memberships WHERE id = v_ms)
          THEN '已擋下' ELSE '⚠️ 真的被撤銷了' END);

  /* ================================================================
     3. 管理員 —— 修補不能把原本的功能弄壞
     ================================================================ */
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  v_json := admin_get_all_users()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員仍讀得到使用者名單（/admin/users 沒壞）',
     CASE WHEN (v_json ->> 'success')::boolean
           AND jsonb_array_length(v_json -> 'users') > 0 THEN 'PASS' ELSE 'FAIL' END,
     coalesce(jsonb_array_length(v_json -> 'users')::text, '0') || ' 筆');

  v_json := admin_get_user_stats()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員仍讀得到使用者統計',
     CASE WHEN (v_json ->> 'success')::boolean THEN 'PASS' ELSE 'FAIL' END,
     '總人數 ' || coalesce(v_json ->> 'total_users', '?'));

  SELECT count(*) INTO v_before FROM premium_memberships;
  v_json := admin_grant_premium(v_student, now() + interval '180 days', '管理員正常授權')::jsonb;
  SELECT count(*) INTO v_after FROM premium_memberships;
  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員仍能授予 premium，且 granted_by 記錄得到是誰',
     -- granted_at 在同一個交易裡全部相同，不能用它排序取「最新」。
     -- 改成直接斷言：存在一列是這位學生的、且 granted_by 是管理員。
     CASE WHEN (v_json ->> 'success')::boolean AND v_after = v_before + 1
           AND EXISTS (SELECT 1 FROM premium_memberships
                        WHERE user_id = v_student AND granted_by = v_admin)
          THEN 'PASS' ELSE 'FAIL' END,
     '新增 ' || (v_after - v_before) || ' 列');

  INSERT INTO t (name, verdict, detail) VALUES
    ('授權後 is_premium_member() 為 true',
     CASE WHEN is_premium_member(v_student) THEN 'PASS' ELSE 'FAIL' END, '');

  PERFORM admin_revoke_premium(v_ms);
  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員仍能撤銷 premium',
     CASE WHEN NOT (SELECT is_active FROM premium_memberships WHERE id = v_ms)
          THEN 'PASS' ELSE 'FAIL' END, '');

  /* ================================================================
     4. 授權（第二層防線）
     ================================================================ */
  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name IN ('admin_get_all_users', 'admin_get_user_stats',
                          'admin_grant_premium', 'admin_revoke_premium')
     AND grantee IN ('anon', 'PUBLIC');
  INSERT INTO t (name, verdict, detail) VALUES
    ('anon / PUBLIC 對四支函式都沒有 EXECUTE',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 項授權');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name IN ('admin_get_all_users', 'admin_get_user_stats',
                          'admin_grant_premium', 'admin_revoke_premium')
     AND grantee = 'authenticated';
  INSERT INTO t (name, verdict, detail) VALUES
    ('authenticated 對四支函式都有 EXECUTE（管理員是登入狀態）',
     CASE WHEN v_n = 4 THEN 'PASS' ELSE 'FAIL' END, v_n || '/4');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name IN ('admin_get_all_users', 'admin_get_user_stats',
                          'admin_grant_premium', 'admin_revoke_premium')
     AND grantee = 'service_role';
  INSERT INTO t (name, verdict, detail) VALUES
    ('service_role 沒有多餘授權（沒有任何伺服器端呼叫端）',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 項授權');

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('admin_get_all_users', 'admin_get_user_stats',
                       'admin_grant_premium', 'admin_revoke_premium')
     AND p.prosrc ~ 'coalesce\s*\(\s*is_admin';
  INSERT INTO t (name, verdict, detail) VALUES
    ('四支函式的守門都是 NULL-safe 的 coalesce 形式',
     CASE WHEN v_n = 4 THEN 'PASS' ELSE 'FAIL' END, v_n || '/4');
END;
$test$;

INSERT INTO t (name, verdict, detail)
SELECT '總結',
       CASE WHEN count(*) = 0 THEN 'FAIL'
            WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS'
            ELSE 'FAIL' END,
       CASE WHEN count(*) = 0
            THEN '沒有跑到任何一項——上面的 ERROR 就是原因'
            ELSE count(*) FILTER (WHERE verdict = 'PASS') || ' / ' || count(*) END
  FROM t WHERE name <> '總結';

SELECT name AS "項目", verdict AS "結果", detail AS "說明" FROM t ORDER BY seq;
