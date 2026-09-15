-- =====================================================
-- 口說練習（題庫 / 練習紀錄 / 開放控制 / 清理）的安全與行為測試
--
-- 🛑 本機專用。不要在 staging 或正式環境執行——它會寫入資料，
--    而且依賴 tests/sql/_writing_local_harness.sql 把 auth.uid() / is_admin()
--    換成讀 GUC 的替身。
--
-- 前置：
--   createdb sp
--   psql -d sp -f tests/sql/_writing_local_harness.sql
--   psql -d sp -c "CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES auth.users(id), display_name TEXT, email TEXT);"
--   psql -d sp -f supabase/migrations/create_learn_classes_tasks.sql
--   psql -d sp -f supabase/migrations/create_learn_feature_access.sql
--   psql -d sp -f supabase/migrations/create_speaking_prompts.sql
--   psql -d sp -f supabase/migrations/create_speaking_recordings.sql
--   psql -d sp -f supabase/migrations/create_speaking_rpcs.sql
--   psql -d sp -f tests/sql/speaking_test.sql
--
-- （create_speaking_bucket.sql 不在此測——本機沒有 storage schema。）
--
-- 重點在兩件事：
--   1. 預設關閉 —— 沒有 grant 就沒有學生看得到
--   2. 路徑歸屬 —— 學生不能讓系統去碰別人的檔案
--
-- 輸出一張表：項目 / 結果 / 說明。FAIL = 0 才算通過。
-- =====================================================

-- 🛑 先清乾淨再跑。
--    這份測試會真的寫資料，同一個資料庫連跑兩次就會有兩份夾具——
--    「應該 2 筆」變成 4 筆，看起來像 FAIL，其實只是上一輪的殘留。
TRUNCATE speaking_recordings, speaking_prompts, learn_feature_access,
         learn_class_members, learn_classes CASCADE;
-- user_profiles 的外鍵沒有 ON DELETE CASCADE，要先清它，
-- 不然下面那句會 ERROR——而 psql 預設不會停，錯誤就這樣被吞掉。
DELETE FROM user_profiles
 WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'sp-%@test');
DELETE FROM auth.users WHERE email LIKE 'sp-%@test';

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;
GRANT ALL ON TABLE t TO authenticated, anon;
GRANT ALL ON SEQUENCE t_seq_seq TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_name TEXT, p_ok BOOLEAN, p_detail TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t(name, verdict, detail)
  VALUES (p_name, CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, p_detail);
END;
$$;

/** 切換成某位學生的身分（非管理員）。 */
CREATE OR REPLACE FUNCTION pg_temp.be(p_uid UUID, p_admin BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('test.is_admin', CASE WHEN p_admin THEN 'true' ELSE 'false' END, true);
END;
$$;


DO $test$
DECLARE
  v_admin UUID; v_a UUID; v_b UUID; v_c UUID;
  v_class UUID; v_class_archived UUID;
  v_p1 UUID; v_p2 UUID; v_p_off UUID; v_p_nocue UUID;
  v_rec UUID; v_rec_b UUID;
  v_txt TEXT; v_int INTEGER; v_bool BOOLEAN; v_json JSONB;
BEGIN
  -- ── 準備 ────────────────────────────────────────────────
  INSERT INTO auth.users (email) VALUES ('sp-admin@test') RETURNING id INTO v_admin;
  INSERT INTO auth.users (email) VALUES ('sp-a@test')     RETURNING id INTO v_a;
  INSERT INTO auth.users (email) VALUES ('sp-b@test')     RETURNING id INTO v_b;
  INSERT INTO auth.users (email) VALUES ('sp-c@test')     RETURNING id INTO v_c;
  INSERT INTO user_profiles (user_id, display_name)
    VALUES (v_a, '小安'), (v_b, '小班'), (v_c, '小慈');

  INSERT INTO learn_classes (name, status) VALUES ('口說班', 'ACTIVE')
    RETURNING id INTO v_class;
  INSERT INTO learn_classes (name, status) VALUES ('已封存班', 'ARCHIVED')
    RETURNING id INTO v_class_archived;
  INSERT INTO learn_class_members (class_id, student_id)
    VALUES (v_class, v_a), (v_class_archived, v_c);

  PERFORM pg_temp.be(v_admin, true);
  v_p1 := speaking_admin_upsert_prompt(NULL, 1, 'Hometown', 'Where are you from?');
  v_p2 := speaking_admin_upsert_prompt(NULL, 2, NULL, NULL,
            'Describe a book you enjoyed', 'You should say:',
            ARRAY['what it was about', 'why you read it', 'how you felt']);
  v_p_off := speaking_admin_upsert_prompt(NULL, 3, 'Reading', 'Do people still read books?',
            NULL, NULL, '{}', false, 0);


  -- ══════════════════════════════════════════════════════
  -- 1. 🛑 預設是關的
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_a);
  PERFORM pg_temp.expect('🛑 沒有任何授權時，學生看不到這個功能',
    learn_feature_enabled('speaking') IS FALSE, NULL);

  PERFORM pg_temp.be(v_admin, true);
  PERFORM pg_temp.expect('管理員不受開放設定限制（否則沒辦法自己測）',
    learn_feature_enabled('speaking'), NULL);

  -- 未登入
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('test.is_admin', '', true);
  PERFORM pg_temp.expect('未登入一律 false',
    learn_feature_enabled('speaking') IS FALSE, NULL);


  -- ══════════════════════════════════════════════════════
  -- 2. 開放對象：班級與個別學生
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_admin, true);
  PERFORM learn_admin_set_feature_access('speaking', v_class, NULL, true);

  PERFORM pg_temp.be(v_a);
  PERFORM pg_temp.expect('班級授權 → 該班學生看得到',
    learn_feature_enabled('speaking'), NULL);

  PERFORM pg_temp.be(v_b);
  PERFORM pg_temp.expect('不在那個班的學生仍然看不到',
    learn_feature_enabled('speaking') IS FALSE, NULL);

  PERFORM pg_temp.be(v_c);
  PERFORM pg_temp.expect('只在【已封存】班級裡的學生看不到',
    learn_feature_enabled('speaking') IS FALSE, NULL);

  PERFORM pg_temp.be(v_admin, true);
  PERFORM learn_admin_set_feature_access('speaking', NULL, v_b, true, '試用');
  PERFORM pg_temp.be(v_b);
  PERFORM pg_temp.expect('個別授權 → 看得到', learn_feature_enabled('speaking'), NULL);

  -- 冪等
  PERFORM pg_temp.be(v_admin, true);
  PERFORM learn_admin_set_feature_access('speaking', v_class, NULL, true);
  SELECT count(*) INTO v_int FROM learn_feature_access
   WHERE feature = 'speaking' AND class_id = v_class;
  PERFORM pg_temp.expect('重複授權不會產生第二列', v_int = 1, 'rows=' || v_int);

  -- reach 去重：小安同時被班級授權；再給他個別授權，總數不該變成 3
  PERFORM learn_admin_set_feature_access('speaking', NULL, v_a, true);
  v_json := learn_admin_feature_access('speaking');
  PERFORM pg_temp.expect('reach 會去重（同時被班級與個別授權只算一次）',
    (v_json->>'reach')::int = 2, 'reach=' || (v_json->>'reach'));

  -- 收回
  PERFORM learn_admin_set_feature_access('speaking', NULL, v_b, false);
  PERFORM pg_temp.be(v_b);
  PERFORM pg_temp.expect('收回個別授權 → 看不到了',
    learn_feature_enabled('speaking') IS FALSE, NULL);
  PERFORM pg_temp.be(v_admin, true);
  PERFORM learn_admin_set_feature_access('speaking', NULL, v_b, false);  -- 再收一次
  PERFORM pg_temp.expect('重複收回不報錯', true, NULL);

  -- 一列只能一種對象
  BEGIN
    PERFORM learn_admin_set_feature_access('speaking', v_class, v_b, true);
    PERFORM pg_temp.expect('不得同時指定班級與學生', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('不得同時指定班級與學生', true, SQLERRM);
  END;

  BEGIN
    PERFORM learn_admin_set_feature_access('speaking', NULL, NULL, true);
    PERFORM pg_temp.expect('必須指定一個對象', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('必須指定一個對象', true, SQLERRM);
  END;

  PERFORM pg_temp.be(v_a);
  BEGIN
    PERFORM learn_admin_set_feature_access('speaking', NULL, v_a, true);
    PERFORM pg_temp.expect('🛑 學生不得自己開放功能給自己', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 學生不得自己開放功能給自己', true, SQLERRM);
  END;
  BEGIN
    PERFORM learn_admin_feature_access('speaking');
    PERFORM pg_temp.expect('🛑 學生不得讀開放名單', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 學生不得讀開放名單', true, SQLERRM);
  END;


  -- ══════════════════════════════════════════════════════
  -- 3. 題庫
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_admin, true);

  -- cue 是【選填】的。既有題庫的 Part 2 有 101 題，cue 整批是空的——
  -- cue 就是「You should say:」那句固定的引導語，屬於畫面而不是題目。
  -- 這一題建得出來，而且下面會檢查它開得起練習（cue 是 NULL 時，
  -- 快照文字若用 || 串接會整串變成 NULL）。
  v_p_nocue := speaking_admin_upsert_prompt(NULL, 2, NULL, NULL, '只有標題的 Part 2',
                                            NULL, ARRAY['要點一','要點二']);
  PERFORM pg_temp.expect('Part 2 沒有 cue 也建得出來', v_p_nocue IS NOT NULL, NULL);

  BEGIN
    PERFORM speaking_admin_upsert_prompt(NULL, 2, NULL, NULL, '   ', 'You should say:', '{}');
    PERFORM pg_temp.expect('Part 2 少了 title 建不出來', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('Part 2 少了 title 建不出來', true, 'CHECK 擋下');
  END;

  BEGIN
    PERFORM speaking_admin_upsert_prompt(NULL, 1, 'Topic', '   ');
    PERFORM pg_temp.expect('Part 1 的 question 不能是空白', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('Part 1 的 question 不能是空白', true, 'CHECK 擋下');
  END;

  -- 沒開放的學生連題目都看不到
  PERFORM pg_temp.be(v_b);
  BEGIN
    PERFORM speaking_available_prompts(NULL);
    PERFORM pg_temp.expect('🛑 沒開放的學生讀不到題庫', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 沒開放的學生讀不到題庫', true, SQLERRM);
  END;

  PERFORM pg_temp.be(v_a);
  v_json := speaking_available_prompts(NULL);
  -- 3 題：v_p1、v_p2，再加上上面那題沒有 cue 的 Part 2（v_p_off 已停用）
  PERFORM pg_temp.expect('開放的學生看得到啟用中的題目',
    jsonb_array_length(v_json) = 3, 'count=' || jsonb_array_length(v_json));

  SELECT count(*) INTO v_int
    FROM jsonb_array_elements(v_json) e WHERE (e->>'id')::uuid = v_p_off;
  PERFORM pg_temp.expect('停用的題目不出現在學生的選單裡', v_int = 0, 'found=' || v_int);


  -- ══════════════════════════════════════════════════════
  -- 4. 開始練習與題目快照
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_b);
  BEGIN
    PERFORM speaking_start_practice(v_p1);
    PERFORM pg_temp.expect('🛑 沒開放的學生不能開始練習', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 沒開放的學生不能開始練習', true, SQLERRM);
  END;

  PERFORM pg_temp.be(v_a);
  BEGIN
    PERFORM speaking_start_practice(v_p_off);
    PERFORM pg_temp.expect('停用的題目不能開始練習', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('停用的題目不能開始練習', true, SQLERRM);
  END;

  v_rec := speaking_start_practice(v_p2);
  SELECT prompt_text INTO v_txt FROM speaking_recordings WHERE id = v_rec;
  PERFORM pg_temp.expect('Part 2 的快照含標題、提示與要點',
    v_txt LIKE '%Describe a book%' AND v_txt LIKE '%what it was about%', left(v_txt, 40));

  SELECT status INTO v_txt FROM speaking_recordings WHERE id = v_rec;
  PERFORM pg_temp.expect('剛開始的練習是 PENDING', v_txt = 'PENDING', v_txt);

  -- 🛑 迴歸測試：cue 是 NULL 的 Part 2。
  --    快照文字原本是 title || E'\n' || cue || … 串出來的，cue 一旦是 NULL
  --    整串就變成 NULL，接著撞上 prompt_text 的 NOT NULL——學生按下去就拿到
  --    一句資料庫錯誤。既有題庫的 Part 2 有 101 題 cue 全是空的，
  --    也就是說每一題都會踩到。改用 concat_ws 之後才不會。
  PERFORM pg_temp.be(v_a);
  DECLARE v_rec_nocue UUID;
  BEGIN
    v_rec_nocue := speaking_start_practice(v_p_nocue);
    SELECT prompt_text INTO v_txt FROM speaking_recordings WHERE id = v_rec_nocue;
    PERFORM pg_temp.expect('cue 是 NULL 的 Part 2 也開得起練習',
      v_txt LIKE '%只有標題的 Part 2%' AND v_txt LIKE '%要點一%', left(v_txt, 40));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('cue 是 NULL 的 Part 2 也開得起練習', false, SQLERRM);
  END;

  -- 🛑 改題之後，既有練習看到的還是當時那一題
  PERFORM pg_temp.be(v_admin, true);
  PERFORM speaking_admin_upsert_prompt(v_p2, 2, NULL, NULL,
    '換成完全不同的題目', '新的提示', ARRAY['新要點']);
  SELECT prompt_text INTO v_txt FROM speaking_recordings WHERE id = v_rec;
  PERFORM pg_temp.expect('🛑 老師改題後，既有練習的題目快照不變',
    v_txt LIKE '%Describe a book%', left(v_txt, 40));


  -- ══════════════════════════════════════════════════════
  -- 5. 🛑 路徑歸屬
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_a);

  BEGIN
    PERFORM speaking_register_recording(v_rec,
      v_b::text || '/' || v_rec::text || '/x.webm', 'audio/webm', 100, 30);
    PERFORM pg_temp.expect('🛑 別人 uid 開頭的路徑被拒絕', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 別人 uid 開頭的路徑被拒絕', true, SQLERRM);
  END;

  BEGIN
    PERFORM speaking_register_recording(v_rec,
      v_a::text || '/' || gen_random_uuid()::text || '/x.webm', 'audio/webm', 100, 30);
    PERFORM pg_temp.expect('🛑 不屬於這次練習的路徑被拒絕', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 不屬於這次練習的路徑被拒絕', true, SQLERRM);
  END;

  BEGIN
    PERFORM speaking_register_recording(v_rec, 'x.webm', 'audio/webm', 100, 30);
    PERFORM pg_temp.expect('🛑 沒有資料夾的裸檔名被拒絕', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 沒有資料夾的裸檔名被拒絕', true, SQLERRM);
  END;

  -- 正確的路徑
  PERFORM speaking_register_recording(v_rec,
    v_a::text || '/' || v_rec::text || '/1.webm', 'audio/webm', 204800, 95);
  SELECT status INTO v_txt FROM speaking_recordings WHERE id = v_rec;
  PERFORM pg_temp.expect('正確的路徑登記成功並轉為 UPLOADED', v_txt = 'UPLOADED', v_txt);

  BEGIN
    PERFORM speaking_register_recording(v_rec,
      v_a::text || '/' || v_rec::text || '/2.webm', 'audio/webm', 100, 30);
    PERFORM pg_temp.expect('同一次練習不能登記兩次錄音', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('同一次練習不能登記兩次錄音', true, SQLERRM);
  END;

  -- 別人的練習
  PERFORM pg_temp.be(v_admin, true);
  PERFORM learn_admin_set_feature_access('speaking', NULL, v_b, true);
  PERFORM pg_temp.be(v_b);
  v_rec_b := speaking_start_practice(v_p1);

  PERFORM pg_temp.be(v_a);
  BEGIN
    PERFORM speaking_register_recording(v_rec_b,
      v_a::text || '/' || v_rec_b::text || '/1.webm', 'audio/webm', 100, 30);
    PERFORM pg_temp.expect('🛑 不能登記到別人的練習上', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 不能登記到別人的練習上', true, SQLERRM);
  END;

  PERFORM pg_temp.expect('也標記不了別人的失敗',
    speaking_fail_recording(v_rec_b, '亂標') IS FALSE, NULL);


  -- ══════════════════════════════════════════════════════
  -- 6. 清理：90 天
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_admin, true);

  SELECT count(*) INTO v_int FROM speaking_cleanup_candidates(200);
  PERFORM pg_temp.expect('剛錄好的不會被清理', v_int = 0, 'count=' || v_int);

  -- ⚠️ 時間旅行要先停掉 touch trigger —— learn_touch_updated_at() 會把
  --    created_at 釘回原值（那是刻意的，建立時間是事實）。
  --    測完立刻開回來，而且下面有一條斷言確認它仍然守得住。
  ALTER TABLE speaking_recordings DISABLE TRIGGER trg_speaking_recordings_touch;

  -- 89 天
  UPDATE speaking_recordings SET uploaded_at = now() - interval '89 days' WHERE id = v_rec;
  SELECT count(*) INTO v_int FROM speaking_cleanup_candidates(200);
  PERFORM pg_temp.expect('上傳 89 天還不刪', v_int = 0, 'count=' || v_int);

  -- 91 天
  UPDATE speaking_recordings SET uploaded_at = now() - interval '91 days' WHERE id = v_rec;
  SELECT count(*) INTO v_int FROM speaking_cleanup_candidates(200);
  PERFORM pg_temp.expect('上傳 91 天要刪', v_int = 1, 'count=' || v_int);

  -- 沒上傳成功的沒有檔案可刪：把它建立時間推到很久以前也一樣
  UPDATE speaking_recordings SET created_at = now() - interval '200 days' WHERE id = v_rec_b;
  SELECT count(*) INTO v_int FROM speaking_cleanup_candidates(200);
  PERFORM pg_temp.expect('🛑 沒上傳成功的（沒有 storage_path）不會被掃到',
    v_int = 1, 'count=' || v_int);

  ALTER TABLE speaking_recordings ENABLE TRIGGER trg_speaking_recordings_touch;

  -- trigger 開回來之後確認它還守得住 created_at
  UPDATE speaking_recordings SET created_at = now() - interval '999 days' WHERE id = v_rec;
  SELECT (created_at < now() - interval '900 days') INTO v_bool
    FROM speaking_recordings WHERE id = v_rec;
  PERFORM pg_temp.expect('🛑 created_at 改不動（trigger 已重新啟用）',
    v_bool IS FALSE, 'changed=' || v_bool);

  PERFORM pg_temp.expect('標記刪除回傳筆數',
    speaking_mark_deleted(ARRAY[v_rec]) = 1, NULL);
  PERFORM pg_temp.expect('重複標記是冪等的（回 0）',
    speaking_mark_deleted(ARRAY[v_rec]) = 0, NULL);

  SELECT count(*) INTO v_int FROM speaking_cleanup_candidates(200);
  PERFORM pg_temp.expect('標記過就不再出現在名單裡', v_int = 0, 'count=' || v_int);

  SELECT count(*) INTO v_int FROM speaking_recordings WHERE id = v_rec;
  PERFORM pg_temp.expect('🛑 檔案刪了，練習紀錄還在', v_int = 1, NULL);

END;
$test$;


-- ══════════════════════════════════════════════════════
-- 7. RLS：學生只讀得到自己的練習
-- ══════════════════════════════════════════════════════

DO $rls$
DECLARE
  v_a UUID; v_b UUID; v_n INTEGER;
BEGIN
  SELECT id INTO v_a FROM auth.users WHERE email = 'sp-a@test';
  SELECT id INTO v_b FROM auth.users WHERE email = 'sp-b@test';

  PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
  PERFORM set_config('test.is_admin', 'false', true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.speaking_recordings;
  EXECUTE 'RESET ROLE';
  -- 小安有 2 筆：Part 2 那次，加上 cue 是 NULL 的那次迴歸測試
  PERFORM pg_temp.expect('🛑 學生只看得到自己的練習', v_n = 2, 'visible=' || v_n);

  PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
  PERFORM set_config('test.is_admin', 'true', true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.speaking_recordings;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.expect('管理員看得到全部', v_n = 3, 'visible=' || v_n);
END;
$rls$;


-- ══════════════════════════════════════════════════════
-- 8. 權限與函式屬性
-- ══════════════════════════════════════════════════════

-- 清理專用的兩支：只有 service_role
INSERT INTO t(name, verdict, detail)
SELECT '🛑 ' || p.proname || ' 只有 service_role 叫得動',
       CASE WHEN has_function_privilege('service_role', p.oid, 'EXECUTE')
             AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
             AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END, NULL
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('speaking_cleanup_candidates', 'speaking_mark_deleted');

-- 學生／管理端的：authenticated 有、anon 沒有
INSERT INTO t(name, verdict, detail)
SELECT p.proname || '：authenticated 有 EXECUTE、anon 沒有',
       CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
             AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END, NULL
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('learn_feature_enabled', 'learn_admin_feature_access',
                    'learn_admin_set_feature_access', 'speaking_available_prompts',
                    'speaking_admin_prompts', 'speaking_admin_upsert_prompt',
                    'speaking_start_practice', 'speaking_register_recording',
                    'speaking_fail_recording');

-- search_path 一律釘死
INSERT INTO t(name, verdict, detail)
SELECT p.proname || ' 的 search_path 釘住',
       CASE WHEN p.proconfig::text LIKE '%search_path=%' THEN 'PASS' ELSE 'FAIL' END,
       coalesce(p.proconfig::text, 'NULL')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'speaking_%' OR (n.nspname = 'public' AND p.proname LIKE 'learn_%feature%');

-- 🛑 learn_feature_access 對所有角色零 grant（學生不得看到誰有權限）
INSERT INTO t(name, verdict, detail)
SELECT '🛑 learn_feature_access 對 ' || r.rolname || ' 零 grant',
       CASE WHEN has_table_privilege(r.rolname, 'learn_feature_access', 'SELECT')
              OR has_table_privilege(r.rolname, 'learn_feature_access', 'INSERT')
              OR has_table_privilege(r.rolname, 'learn_feature_access', 'UPDATE')
              OR has_table_privilege(r.rolname, 'learn_feature_access', 'DELETE')
            THEN 'FAIL' ELSE 'PASS' END, NULL
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname);

-- 🛑 speaking_prompts 同樣零 grant（題庫只透過函式讀）
INSERT INTO t(name, verdict, detail)
SELECT '🛑 speaking_prompts 對 ' || r.rolname || ' 零 grant',
       CASE WHEN has_table_privilege(r.rolname, 'speaking_prompts', 'SELECT')
              OR has_table_privilege(r.rolname, 'speaking_prompts', 'INSERT')
            THEN 'FAIL' ELSE 'PASS' END, NULL
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname);

-- 🛑 學生不得直接寫入練習紀錄
INSERT INTO t(name, verdict, detail)
SELECT '🛑 authenticated 對 speaking_recordings 沒有 INSERT / UPDATE / DELETE',
       CASE WHEN has_table_privilege('authenticated', 'speaking_recordings', 'INSERT')
              OR has_table_privilege('authenticated', 'speaking_recordings', 'UPDATE')
              OR has_table_privilege('authenticated', 'speaking_recordings', 'DELETE')
            THEN 'FAIL' ELSE 'PASS' END, NULL;

INSERT INTO t(name, verdict, detail)
SELECT 'speaking_recordings 的 RLS 開著',
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END, NULL
  FROM pg_class WHERE relname = 'speaking_recordings';


-- ══════════════════════════════════════════════════════
SELECT seq, name AS "項目", verdict AS "結果", coalesce(detail, '') AS "說明"
  FROM t ORDER BY seq;
SELECT verdict AS "結果", count(*) AS "項數" FROM t GROUP BY verdict ORDER BY verdict;
