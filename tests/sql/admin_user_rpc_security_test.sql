-- =====================================================
-- admin_get_all_users / admin_get_user_stats 的授權測試
--
-- 🛑 本機專用。需要 auth.users、user_profiles、is_admin()，以及重現 Supabase
--    ALTER DEFAULT PRIVILEGES 的環境。
--
-- ⚠️ 身分切換必須在【同一個交易】裡：set_config(..., true) 是交易區域的，
--    分開的 statement 各自是一個交易，設定會消失，測試會假通過。
--    這裡整段包在一個 DO 區塊裡，所以是同一個交易。
--
-- 輸出一張表：項目 / 結果 / 說明。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;

DO $test$
DECLARE
  v_admin   UUID;
  v_student UUID;
  v_n       INTEGER;
  v_json    JSONB;
BEGIN
  SELECT id INTO v_admin   FROM auth.users WHERE email = 'nonstopjazz@gmail.com' LIMIT 1;
  SELECT id INTO v_student FROM auth.users WHERE email <> 'nonstopjazz@gmail.com' LIMIT 1;

  IF v_admin IS NULL OR v_student IS NULL THEN
    INSERT INTO t (name, verdict, detail) VALUES
      ('前置資料', 'FAIL', '需要一個管理員帳號與至少一個非管理員帳號');
    RETURN;
  END IF;

  /* ---------- 1. 未登入：這就是被修掉的破口 ---------- */
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO t (name, verdict, detail) VALUES
    ('is_admin() 對未登入者回傳 NULL（不是 false）',
     CASE WHEN is_admin() IS NULL THEN 'PASS' ELSE 'FAIL' END,
     coalesce(is_admin()::text, 'NULL') || ' —— 這正是 IF NOT is_admin() 會失守的原因');

  v_json := admin_get_all_users()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('未登入者拿不到使用者名單',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' THEN 'PASS' ELSE 'FAIL' END,
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' THEN '已擋下'
          ELSE '⚠️ 外洩 ' || coalesce(jsonb_array_length(v_json -> 'users')::text, '?') || ' 筆' END);

  v_json := admin_get_user_stats()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('未登入者拿不到使用者統計',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' THEN 'PASS' ELSE 'FAIL' END,
     coalesce(v_json ->> 'error', '⚠️ 竟然回傳 total_users=' || coalesce(v_json ->> 'total_users', '?')));

  /* ---------- 2. 已登入的一般使用者 ---------- */
  PERFORM set_config('request.jwt.claim.sub', v_student::text, true);

  INSERT INTO t (name, verdict, detail) VALUES
    ('一般使用者的 is_admin() 是 false',
     CASE WHEN is_admin() IS FALSE THEN 'PASS' ELSE 'FAIL' END, coalesce(is_admin()::text, 'NULL'));

  v_json := admin_get_all_users()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('一般使用者拿不到使用者名單',
     CASE WHEN v_json ->> 'error' = 'UNAUTHORIZED' THEN 'PASS' ELSE 'FAIL' END,
     coalesce(v_json ->> 'error', '⚠️ 竟然成功'));

  /* ---------- 3. 管理員：修補不能把正常功能弄壞 ---------- */
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  v_json := admin_get_all_users()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員仍然拿得到使用者名單（/admin/users 沒被弄壞）',
     CASE WHEN (v_json ->> 'success')::boolean
           AND jsonb_array_length(v_json -> 'users') > 0 THEN 'PASS' ELSE 'FAIL' END,
     coalesce(jsonb_array_length(v_json -> 'users')::text, '0') || ' 筆');

  v_json := admin_get_user_stats()::jsonb;
  INSERT INTO t (name, verdict, detail) VALUES
    ('管理員仍然拿得到使用者統計',
     CASE WHEN (v_json ->> 'success')::boolean THEN 'PASS' ELSE 'FAIL' END,
     '總人數 ' || coalesce(v_json ->> 'total_users', '?'));

  /* ---------- 4. 第二層：anon 連呼叫都不該呼叫得到 ---------- */
  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name IN ('admin_get_all_users', 'admin_get_user_stats')
     AND grantee IN ('anon', 'PUBLIC');
  INSERT INTO t (name, verdict, detail) VALUES
    ('anon 對兩支函式沒有 EXECUTE',
     CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 項授權');

  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name IN ('admin_get_all_users', 'admin_get_user_stats')
     AND grantee = 'authenticated';
  INSERT INTO t (name, verdict, detail) VALUES
    ('authenticated 仍可執行（管理員是登入狀態）',
     CASE WHEN v_n = 2 THEN 'PASS' ELSE 'FAIL' END, v_n || '/2');
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
