-- =====================================================
-- 診斷：為什麼登入後不被認為是管理員（唯讀）
--
-- ✅ 完全唯讀。不寫入、不建立、不修改任何東西。
--    可以安全地在 staging 或正式環境的 SQL Editor 直接貼上執行。
--
-- 這個專案有【兩套彼此不相通】的管理員判斷：
--   [1] 前端 RequireAdmin → useAdmin → 查 app_admins 表有沒有你的 user_id
--   [2] 資料庫 is_admin() → 比對 auth.users.email 是否等於硬編碼的那個 email
-- 兩套都要成立，老師端才會完整可用。這份腳本把兩套各自的狀態攤開來。
--
-- ⚠️ 不要在這裡直接呼叫 is_admin()。SQL Editor 沒有 JWT，auth.uid() 是 NULL，
--    它一定回 NULL —— 那不代表你的帳號有問題。這裡改成【重現它的判斷邏輯】。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS d (seq SERIAL, item TEXT, value TEXT, note TEXT);
TRUNCATE d;

DO $diag$
DECLARE
  v_src   TEXT;
  v_email TEXT;
  v_n     INTEGER;
  v_has_app_admins BOOLEAN;
BEGIN
  /* ---------- 1. is_admin() 在【這個環境】的真正定義 ---------- */
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_admin' LIMIT 1;

  INSERT INTO d (item, value, note) VALUES
    ('is_admin() 是否存在', CASE WHEN v_src IS NULL THEN '❌ 不存在' ELSE '✅ 存在' END, '');

  -- 從函式原始碼裡把被硬編碼的 email 抓出來
  v_email := substring(v_src from '''([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)''');
  INSERT INTO d (item, value, note) VALUES
    ('is_admin() 硬編碼比對的 email', coalesce(v_email, '（抓不到——它可能改成查表了，看下一列）'),
     '這是【這個資料庫實際上】在比對的值');

  INSERT INTO d (item, value, note) VALUES
    ('is_admin() 是否改成查 app_admins',
     CASE WHEN v_src ILIKE '%app_admins%' THEN '是' ELSE '否（還是比對 email）' END, '');

  INSERT INTO d (item, value, note) VALUES
    ('is_admin() 原始碼（前 400 字）', left(coalesce(v_src, '-'), 400), '');

  /* ---------- 2. auth.users 裡符合的帳號 ---------- */
  IF v_email IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM auth.users u WHERE u.email = v_email;
    INSERT INTO d (item, value, note) VALUES
      ('auth.users 中 email 完全相符的筆數', v_n::text,
       CASE WHEN v_n = 0 THEN '❌ 一筆都沒有 —— is_admin() 永遠不會是 true'
            WHEN v_n = 1 THEN '✅ 剛好一筆'
            ELSE '⚠️ 超過一筆，登入到哪一個會不確定' END);

    -- 大小寫 / 前後空白造成的不相符：最常見的假失敗
    SELECT count(*) INTO v_n FROM auth.users u
     WHERE lower(btrim(u.email)) = lower(btrim(v_email)) AND u.email <> v_email;
    INSERT INTO d (item, value, note) VALUES
      ('大小寫或空白不同而比不到的筆數', v_n::text,
       CASE WHEN v_n > 0 THEN '⚠️ 有帳號長得像但字元不完全相同 —— 見下一列'
            ELSE '沒有' END);
  END IF;

  -- 把所有長得像的帳號攤開（用 [] 包住 email，一眼看得出空白）
  -- 用 to_jsonb 取欄位，這樣不論這個環境的 auth.users 有沒有某個欄位都不會炸掉
  INSERT INTO d (item, value, note)
  SELECT '候選帳號', '[' || u.email || ']',
         'id=' || u.id
         || ' · 已驗證=' || CASE WHEN to_jsonb(u) ->> 'email_confirmed_at' IS NULL
                                THEN '否（未驗證的帳號登入不了）' ELSE '是' END
         || ' · 最後登入=' || coalesce(to_jsonb(u) ->> 'last_sign_in_at', '從未')
    FROM auth.users u
   WHERE u.email ILIKE '%nonstopjazz%'
      OR (v_email IS NOT NULL AND lower(btrim(u.email)) = lower(btrim(v_email)));

  /* ---------- 3. app_admins（前端那一套） ---------- */
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'app_admins')
    INTO v_has_app_admins;

  INSERT INTO d (item, value, note) VALUES
    ('app_admins 表是否存在', CASE WHEN v_has_app_admins THEN '✅ 存在' ELSE '❌ 不存在' END,
     '前端的 RequireAdmin 查的就是這張表');

  IF v_has_app_admins THEN
    EXECUTE 'SELECT count(*) FROM public.app_admins' INTO v_n;
    INSERT INTO d (item, value, note) VALUES
      ('app_admins 目前有幾列', v_n::text,
       CASE WHEN v_n = 0 THEN '❌ 空的 —— 前端會一律顯示「權限不足」' ELSE '' END);

    INSERT INTO d (item, value, note)
    SELECT 'app_admins 成員', coalesce(u.email, '(查無此 auth 使用者)'), 'user_id=' || a.user_id
      FROM public.app_admins a
      LEFT JOIN auth.users u ON u.id = a.user_id;

    -- 關鍵一列：硬編碼的那個 email，在 app_admins 裡有沒有對應列？
    IF v_email IS NOT NULL THEN
      SELECT count(*) INTO v_n
        FROM auth.users u JOIN public.app_admins a ON a.user_id = u.id
       WHERE u.email = v_email;
      INSERT INTO d (item, value, note) VALUES
        ('★ 兩套機制是否都指向同一個帳號', CASE WHEN v_n > 0 THEN '✅ 是' ELSE '❌ 否' END,
         CASE WHEN v_n > 0
              THEN '兩套都成立，老師端應該可用'
              ELSE '這就是原因：email 對得上 is_admin()，但 app_admins 裡沒有這個 user_id，'
                   || '所以前端的 RequireAdmin 擋下你' END);
    END IF;

    -- app_admins 自己的 RLS：讀不到也會讓前端判定為非管理員
    INSERT INTO d (item, value, note) VALUES
      ('app_admins 的 RLS',
       (SELECT CASE WHEN relrowsecurity THEN 'ON' ELSE 'OFF' END
          FROM pg_class WHERE relname = 'app_admins' AND relnamespace = 'public'::regnamespace),
       '政策數 ' || (SELECT count(*) FROM pg_policies
                      WHERE schemaname='public' AND tablename='app_admins')::text
       || ' · authenticated 授權 ' || (SELECT count(*) FROM information_schema.role_table_grants
                                        WHERE table_schema='public' AND table_name='app_admins'
                                          AND grantee='authenticated')::text
       || ' —— 前端讀不到這張表時，會靜靜地判定成「不是管理員」');
  END IF;

  /* ---------- 4. 這個資料庫是誰 ---------- */
  INSERT INTO d (item, value, note) VALUES
    ('目前連到的資料庫', current_database(), '對照 Preview 的 VITE_SUPABASE_URL 是否為同一個專案');
  INSERT INTO d (item, value, note) VALUES
    ('auth.users 總人數', (SELECT count(*)::text FROM auth.users),
     '正式環境稽核時是 22 人；staging 應該明顯少於這個數字');
END;
$diag$;

SELECT item AS "項目", value AS "值", note AS "說明" FROM d ORDER BY seq;
