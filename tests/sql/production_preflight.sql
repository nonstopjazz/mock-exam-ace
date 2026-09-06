-- =====================================================
-- 正式環境部署前的檢查（唯讀）
--
-- ✅ 完全唯讀。不寫入、不建立、不修改任何東西。
--    在跑【任何一支 migration 之前】先執行這一份。
--
-- 它回答四個問題：
--   1. 前置物件在不在？（缺了的話 migration 會失敗）
--   2. 要建立的物件是不是還不存在？（已存在代表跑過了，重跑會覆蓋定義）
--   3. 管理員的兩套機制有沒有對齊？（沒對齊的話你進不了老師端）
--   4. 破口現在還在不在？（部署後要能對照）
--
-- 另外印出「回滾會炸掉多少資料」，讓你在開始之前就知道爆炸半徑。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS pf (seq SERIAL, section TEXT, item TEXT, verdict TEXT, detail TEXT);
TRUNCATE pf;

DO $pre$
DECLARE
  v_n     INTEGER;
  v_email TEXT;
  v_src   TEXT;
  v_missing TEXT;
  v_present TEXT;
BEGIN
  /* ---------- 1. 前置物件 ---------- */
  SELECT string_agg(t, '、') INTO v_missing
    FROM unnest(ARRAY['writing_submissions','writing_texts','user_profiles',
                      'premium_memberships','app_admins']) AS t
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables
                      WHERE table_schema = 'public' AND table_name = t);
  INSERT INTO pf (section, item, verdict, detail) VALUES
    ('1 前置', '五張前置表都存在',
     CASE WHEN v_missing IS NULL THEN 'PASS' ELSE 'FAIL' END,
     coalesce('缺：' || v_missing, 'writing_submissions / writing_texts / user_profiles / premium_memberships / app_admins'));

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_admin';
  INSERT INTO pf (section, item, verdict, detail) VALUES
    ('1 前置', 'is_admin() 存在', CASE WHEN v_n >= 1 THEN 'PASS' ELSE 'FAIL' END, v_n || ' 個');

  /* ---------- 2. 待建立的物件應該還不存在 ---------- */
  SELECT string_agg(t, '、') INTO v_present
    FROM unnest(ARRAY['writing_analyses','writing_teacher_feedback','learn_classes',
                      'learn_class_members','learn_tasks','learn_task_assignees',
                      'learn_task_logs']) AS t
   WHERE EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = t);
  INSERT INTO pf (section, item, verdict, detail) VALUES
    ('2 待建立', '七張新表都還不存在',
     CASE WHEN v_present IS NULL THEN 'PASS' ELSE 'INFO' END,
     coalesce('已存在：' || v_present || '（代表這幾支跑過了，重跑會覆蓋定義——請只補跑缺的那幾支）',
              '全部尚未建立，可以依序套用'));

  /* ---------- 3. 管理員身分：兩套機制 ---------- */
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_admin' LIMIT 1;
  v_email := substring(v_src from '''([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)''');

  INSERT INTO pf (section, item, verdict, detail) VALUES
    ('3 管理員', 'is_admin() 比對的 email', 'INFO',
     coalesce(v_email, '（抓不到——它可能改成查表了）'));

  IF v_email IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM auth.users u WHERE u.email = v_email;
    INSERT INTO pf (section, item, verdict, detail) VALUES
      ('3 管理員', 'auth.users 有這個 email',
       CASE WHEN v_n = 1 THEN 'PASS' WHEN v_n = 0 THEN 'FAIL' ELSE 'FAIL' END,
       v_n || ' 筆' || CASE WHEN v_n > 1 THEN '（重複帳號，登入到哪一個不確定）' ELSE '' END);

    SELECT count(*) INTO v_n
      FROM auth.users u JOIN public.app_admins a ON a.user_id = u.id
     WHERE u.email = v_email;
    INSERT INTO pf (section, item, verdict, detail) VALUES
      ('3 管理員', '★ app_admins 裡也有這個帳號（兩套機制對齊）',
       CASE WHEN v_n > 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN v_n > 0 THEN '對齊，老師端可用'
            ELSE '❌ 沒對齊：email 過得了 is_admin()，但前端 RequireAdmin 會擋下你' END);
  END IF;

  /* ---------- 4. 破口現況（部署後要能對照） ---------- */
  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public' AND grantee IN ('anon', 'PUBLIC')
     AND routine_name IN ('admin_get_all_users','admin_get_user_stats',
                          'admin_grant_premium','admin_revoke_premium');
  INSERT INTO pf (section, item, verdict, detail) VALUES
    ('4 破口', 'anon / PUBLIC 對四支 admin RPC 的 EXECUTE 數', 'INFO',
     v_n || ' 項' || CASE WHEN v_n > 0 THEN '（破口存在，部署後應變成 0）'
                          ELSE '（已經是 0——可能先前修過）' END);

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('admin_get_all_users','admin_get_user_stats',
                       'admin_grant_premium','admin_revoke_premium')
     AND p.prosrc ~ 'coalesce\s*\(\s*is_admin';
  INSERT INTO pf (section, item, verdict, detail) VALUES
    ('4 破口', '四支的守門已是 NULL-safe', 'INFO',
     v_n || ' / 4' || CASE WHEN v_n < 4 THEN '（部署後應變成 4/4）' ELSE '' END);

  /* ---------- 5. 回滾的爆炸半徑 ---------- */
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='writing_analyses') THEN
    EXECUTE 'SELECT count(*) FROM public.writing_analyses' INTO v_n;
    INSERT INTO pf (section, item, verdict, detail) VALUES
      ('5 爆炸半徑', '回滾 create_writing_analyses 會刪掉的分析筆數', 'INFO', v_n || ' 列');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='writing_teacher_feedback') THEN
    EXECUTE 'SELECT count(*) FROM public.writing_teacher_feedback' INTO v_n;
    INSERT INTO pf (section, item, verdict, detail) VALUES
      ('5 爆炸半徑', '回滾 teacher_feedback 會刪掉的講評筆數', 'INFO', v_n || ' 列');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='learn_classes') THEN
    EXECUTE 'SELECT count(*) FROM public.learn_classes' INTO v_n;
    INSERT INTO pf (section, item, verdict, detail) VALUES
      ('5 爆炸半徑', '回滾 learn_classes 會刪掉的班級數', 'INFO', v_n || ' 個');
  END IF;

  INSERT INTO pf (section, item, verdict, detail) VALUES
    ('5 爆炸半徑', 'auth.users 總人數', 'INFO', (SELECT count(*)::text FROM auth.users));
END;
$pre$;

INSERT INTO pf (section, item, verdict, detail)
SELECT 'Z 總結', '可以開始部署嗎',
       CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0
            THEN '前置條件齊備'
            ELSE '有 ' || count(*) FILTER (WHERE verdict = 'FAIL') || ' 項 FAIL —— 先處理再部署' END
  FROM pf WHERE verdict IN ('PASS', 'FAIL');

SELECT section AS "區塊", item AS "項目", verdict AS "結果", detail AS "說明"
  FROM pf ORDER BY seq;
