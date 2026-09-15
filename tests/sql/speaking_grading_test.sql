-- =====================================================
-- 口說 AI 批改佇列的安全與行為測試
--
-- 🛑 本機專用。不要在 staging 或正式環境執行。
--
-- 前置（接在 speaking_test.sql 的前置之後）：
--   psql -d sp -f supabase/migrations/fix_speaking_part2_cue_optional.sql
--   psql -d sp -f supabase/migrations/create_speaking_analyses.sql
--   psql -d sp -f supabase/migrations/create_speaking_grading_rpcs.sql
--   psql -d sp -f tests/sql/speaking_grading_test.sql
--
-- 重點在三件事：
--   1. concurrency = 1 —— 第二個 worker 必須拿到 BUSY
--   2. 學生拿不到 error_detail / telemetry，也不能自己排入批改
--   3. 沒有檔案的錄音不會產生一次注定失敗的付費呼叫
--
-- 輸出一張表：項目 / 結果 / 說明。FAIL = 0 才算通過。
-- =====================================================

TRUNCATE speaking_analyses, speaking_recordings, speaking_prompts,
         learn_feature_access, learn_class_members, learn_classes CASCADE;
DELETE FROM user_profiles
 WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'sg-%@test');
DELETE FROM auth.users WHERE email LIKE 'sg-%@test';

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

CREATE OR REPLACE FUNCTION pg_temp.be(p_uid UUID, p_admin BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('test.is_admin', CASE WHEN p_admin THEN 'true' ELSE 'false' END, true);
END;
$$;

/** 造一則可批改的錄音（有檔案）。 */
CREATE OR REPLACE FUNCTION pg_temp.mk_recording(p_student UUID, p_prompt UUID, p_uploaded BOOLEAN DEFAULT true)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO speaking_recordings
    (id, student_id, prompt_id, prompt_part, prompt_text, storage_path, mime_type,
     duration_seconds, uploaded_at, status)
  VALUES (v_id, p_student, p_prompt, 1, '題目快照',
          CASE WHEN p_uploaded THEN p_student::text || '/' || v_id::text || '/a.webm' END,
          CASE WHEN p_uploaded THEN 'audio/webm' END,
          CASE WHEN p_uploaded THEN 75 END,
          CASE WHEN p_uploaded THEN now() END,
          CASE WHEN p_uploaded THEN 'UPLOADED' ELSE 'PENDING' END);
  RETURN v_id;
END;
$$;


DO $test$
DECLARE
  v_admin UUID; v_a UUID; v_b UUID;
  v_prompt UUID;
  v_r1 UUID; v_r2 UUID; v_r3 UUID; v_r_nofile UUID; v_r_expired UUID; v_r_fresh UUID;
  v_json JSONB; v_claim JSONB; v_claim2 JSONB;
  v_int INTEGER; v_txt TEXT; v_analysis UUID;
BEGIN
  -- ── 準備 ────────────────────────────────────────────────
  INSERT INTO auth.users (email) VALUES ('sg-admin@test') RETURNING id INTO v_admin;
  INSERT INTO auth.users (email) VALUES ('sg-a@test')     RETURNING id INTO v_a;
  INSERT INTO auth.users (email) VALUES ('sg-b@test')     RETURNING id INTO v_b;
  INSERT INTO user_profiles (user_id, display_name) VALUES (v_a, '小安'), (v_b, '小比');

  PERFORM pg_temp.be(v_admin, true);
  v_prompt := speaking_admin_upsert_prompt(NULL, 1, 'Hometown', 'Where is your hometown?');

  -- uploaded_at 刻意錯開：佇列順序該是「先錄的先改」，這樣才驗得到
  v_r1 := pg_temp.mk_recording(v_a, v_prompt);
  UPDATE speaking_recordings SET uploaded_at = now() - interval '3 hours' WHERE id = v_r1;
  v_r2 := pg_temp.mk_recording(v_a, v_prompt);
  UPDATE speaking_recordings SET uploaded_at = now() - interval '2 hours' WHERE id = v_r2;
  v_r3 := pg_temp.mk_recording(v_b, v_prompt);
  UPDATE speaking_recordings SET uploaded_at = now() - interval '1 hour' WHERE id = v_r3;
  v_r_nofile := pg_temp.mk_recording(v_b, v_prompt, false);

  -- 檔案已過保存期被清掉的
  v_r_expired := pg_temp.mk_recording(v_b, v_prompt);
  UPDATE speaking_recordings SET file_deleted_at = now() WHERE id = v_r_expired;


  -- ══════════════════════════════════════════════════════
  -- 1. 🛑 誰可以排入批改
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_a);
  BEGIN
    PERFORM speaking_enqueue_grading_batch(ARRAY[v_r1]);
    PERFORM pg_temp.expect('🛑 學生不能排入批改', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 學生不能排入批改', true, SQLERRM);
  END;

  BEGIN
    PERFORM speaking_admin_grading_queue('all');
    PERFORM pg_temp.expect('🛑 學生讀不到收件匣', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 學生讀不到收件匣', true, SQLERRM);
  END;

  BEGIN
    PERFORM speaking_grading_summary();
    PERFORM pg_temp.expect('🛑 學生讀不到佇列摘要', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 學生讀不到佇列摘要', true, SQLERRM);
  END;

  -- worker 專用的三支靠的是 GRANT 而不是函式內檢查，
  -- 所以要真的切成 authenticated 才驗得到（DO 區塊預設是 superuser）。
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM speaking_grading_claim('evil');
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.expect('🛑 學生不能認領工作', false, '叫得動');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.expect('🛑 學生不能認領工作', true, SQLERRM);
  END;

  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM speaking_grading_complete(gen_random_uuid(), 'x', 6, 6, 6, 6, 6, 'f', 's', 'm', '{}'::jsonb);
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.expect('🛑 學生不能自己寫入批改結果', false, '叫得動');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.expect('🛑 學生不能自己寫入批改結果', true, SQLERRM);
  END;


  -- ══════════════════════════════════════════════════════
  -- 2. 批次排入
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_admin, true);
  v_json := speaking_enqueue_grading_batch(ARRAY[v_r1, v_r2, v_r_nofile, v_r_expired]);

  PERFORM pg_temp.expect('四則裡有兩則排進去',
    (v_json->>'queued')::int = 2, 'queued=' || (v_json->>'queued'));

  SELECT x->>'outcome' INTO v_txt
    FROM jsonb_array_elements(v_json->'items') x WHERE (x->>'recording_id')::uuid = v_r_nofile;
  PERFORM pg_temp.expect('🛑 沒有錄音檔的回 NO_FILE', v_txt = 'NO_FILE', v_txt);

  SELECT x->>'outcome' INTO v_txt
    FROM jsonb_array_elements(v_json->'items') x WHERE (x->>'recording_id')::uuid = v_r_expired;
  PERFORM pg_temp.expect('🛑 檔案已過保存期的回 NO_FILE', v_txt = 'NO_FILE', v_txt);

  -- 冪等：同一批再送一次
  v_json := speaking_enqueue_grading_batch(ARRAY[v_r1, v_r2]);
  PERFORM pg_temp.expect('重複排入不會產生第二列',
    (v_json->>'queued')::int = 0, 'queued=' || (v_json->>'queued'));
  SELECT x->>'outcome' INTO v_txt
    FROM jsonb_array_elements(v_json->'items') x WHERE (x->>'recording_id')::uuid = v_r1;
  PERFORM pg_temp.expect('重複排入回 ALREADY_ACTIVE', v_txt = 'ALREADY_ACTIVE', v_txt);

  SELECT count(*) INTO v_int FROM speaking_analyses;
  PERFORM pg_temp.expect('資料庫裡就是兩列', v_int = 2, 'rows=' || v_int);

  -- 找不到的錄音
  v_json := speaking_enqueue_grading_batch(ARRAY[gen_random_uuid()]);
  SELECT x->>'outcome' INTO v_txt FROM jsonb_array_elements(v_json->'items') x;
  PERFORM pg_temp.expect('找不到的錄音回 NOT_FOUND', v_txt = 'NOT_FOUND', v_txt);

  -- 一次最多 50 則
  BEGIN
    PERFORM speaking_enqueue_grading_batch(
      (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 51)));
    PERFORM pg_temp.expect('一次超過 50 則被擋下', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('一次超過 50 則被擋下', true, SQLERRM);
  END;


  -- ══════════════════════════════════════════════════════
  -- 3. 🛑 concurrency = 1
  -- ══════════════════════════════════════════════════════

  v_claim := speaking_grading_claim('worker-1');
  PERFORM pg_temp.expect('第一個 worker 認領成功',
    (v_claim->>'claimed')::boolean, v_claim->>'reason');

  PERFORM pg_temp.expect('認領時就把錄音的資料一起帶回來',
    v_claim->>'storage_path' IS NOT NULL AND v_claim->>'prompt_text' IS NOT NULL, NULL);

  -- 🛑 先錄的先改。同一批排入的 requested_at 全部相同，沒有 uploaded_at
  --    打破平手的話，這裡拿到的會是隨機的一則。
  PERFORM pg_temp.expect('🛑 認領的是最早上傳的那一則',
    (v_claim->>'recording_id')::uuid = v_r1, v_claim->>'recording_id');

  v_claim2 := speaking_grading_claim('worker-2');
  PERFORM pg_temp.expect('🛑 第二個 worker 拿到 BUSY',
    (v_claim2->>'claimed')::boolean IS FALSE AND v_claim2->>'reason' = 'BUSY',
    v_claim2->>'reason');

  -- 🛑 判準必須是租約而不是 status：被認領的那一列此刻仍然可能是 QUEUED，
  --    只看 status 的話第二個 worker 會以為沒人在跑。
  UPDATE speaking_analyses SET status = 'QUEUED'
   WHERE id = (v_claim->>'analysis_id')::uuid;
  v_claim2 := speaking_grading_claim('worker-3');
  PERFORM pg_temp.expect('🛑 status 還是 QUEUED 時，活租約仍然擋得住第二個 worker',
    (v_claim2->>'claimed')::boolean IS FALSE AND v_claim2->>'reason' = 'BUSY',
    v_claim2->>'reason');
  UPDATE speaking_analyses SET status = 'ANALYZING'
   WHERE id = (v_claim->>'analysis_id')::uuid;


  -- ══════════════════════════════════════════════════════
  -- 4. 完成
  -- ══════════════════════════════════════════════════════

  v_analysis := (v_claim->>'analysis_id')::uuid;

  PERFORM pg_temp.expect('寫入批改結果',
    speaking_grading_complete(v_analysis, '逐字稿', 6.5, 6.0, 5.5, 7.0, 6.0,
      '回饋', '建議', 'gemini-2.5-flash',
      jsonb_build_object('prompt_tokens', 4000, 'completion_tokens', 500)),
    NULL);

  SELECT status INTO v_txt FROM speaking_recordings
   WHERE id = (v_claim->>'recording_id')::uuid;
  PERFORM pg_temp.expect('錄音被推到 GRADED', v_txt = 'GRADED', v_txt);

  PERFORM pg_temp.expect('完成之後租約被放開',
    (SELECT lease_expires_at IS NULL FROM speaking_analyses WHERE id = v_analysis), NULL);

  -- 放開之後第二件應該認領得到
  v_claim2 := speaking_grading_claim('worker-2');
  PERFORM pg_temp.expect('前一件完成後，下一件認領得到',
    (v_claim2->>'claimed')::boolean, v_claim2->>'reason');


  -- ══════════════════════════════════════════════════════
  -- 5. 失敗與重試
  -- ══════════════════════════════════════════════════════

  -- 這一件是 v_r2（第二早上傳的）
  v_analysis := (v_claim2->>'analysis_id')::uuid;
  PERFORM pg_temp.expect('第二件認領到的是第二早上傳的那一則',
    (v_claim2->>'recording_id')::uuid = v_r2, v_claim2->>'recording_id');

  -- 可重試 → 回到佇列
  PERFORM speaking_grading_fail(v_analysis, '模型忙碌', true);
  SELECT status INTO v_txt FROM speaking_analyses WHERE id = v_analysis;
  PERFORM pg_temp.expect('可重試的失敗回到 QUEUED', v_txt = 'QUEUED', v_txt);
  SELECT queue_attempts INTO v_int FROM speaking_analyses WHERE id = v_analysis;
  PERFORM pg_temp.expect('重試次數 +1', v_int = 1, 'attempts=' || v_int);

  -- 次數用完 → FAILED。p_max_attempts = 3 是「總共試三次」，
  -- 所以第二次還會回到佇列，第三次才收掉。
  PERFORM speaking_grading_fail(v_analysis, '又失敗了', true);
  SELECT status, queue_attempts INTO v_txt, v_int FROM speaking_analyses WHERE id = v_analysis;
  PERFORM pg_temp.expect('第二次失敗仍在佇列裡', v_txt = 'QUEUED' AND v_int = 2,
    v_txt || ' attempts=' || v_int);

  PERFORM speaking_grading_fail(v_analysis, '第三次', true);
  SELECT status INTO v_txt FROM speaking_analyses WHERE id = v_analysis;
  PERFORM pg_temp.expect('🛑 重試次數用完就收成 FAILED，不會無限重試',
    v_txt = 'FAILED', v_txt);

  -- 不可重試 → 直接 FAILED
  v_json := speaking_enqueue_grading_batch(ARRAY[v_r3]);
  v_claim2 := speaking_grading_claim('worker-1');
  PERFORM speaking_grading_fail((v_claim2->>'analysis_id')::uuid, '模型回了不合法的分數', false);
  SELECT status INTO v_txt FROM speaking_analyses WHERE id = (v_claim2->>'analysis_id')::uuid;
  PERFORM pg_temp.expect('不可重試的失敗直接 FAILED', v_txt = 'FAILED', v_txt);

  -- FAILED 之後可以重新排入（收件匣的「重試失敗項目」）
  v_json := speaking_enqueue_grading_batch(ARRAY[v_r3]);
  PERFORM pg_temp.expect('失敗的可以重新排入',
    (v_json->>'queued')::int = 1, 'queued=' || (v_json->>'queued'));
  SELECT analysis_version INTO v_int FROM speaking_analyses
   WHERE recording_id = v_r3 AND status = 'QUEUED';
  PERFORM pg_temp.expect('重新排入是新的一列、版本 +1', v_int = 2, 'version=' || v_int);


  -- ══════════════════════════════════════════════════════
  -- 6. 認領時檔案不見了
  -- ══════════════════════════════════════════════════════

  -- 排入之後檔案才被清理掉
  UPDATE speaking_recordings SET file_deleted_at = now() WHERE id = v_r3;
  v_claim2 := speaking_grading_claim('worker-1');
  PERFORM pg_temp.expect('🛑 檔案在排入後被清掉 → 認領時就收成 FAILED，不送出呼叫',
    (v_claim2->>'claimed')::boolean IS FALSE, v_claim2->>'reason');
  SELECT status INTO v_txt FROM speaking_analyses
   WHERE recording_id = v_r3 ORDER BY analysis_version DESC LIMIT 1;
  PERFORM pg_temp.expect('那一列變成 FAILED', v_txt = 'FAILED', v_txt);


  -- ══════════════════════════════════════════════════════
  -- 7. 🛑 學生看得到什麼
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_a);
  v_json := speaking_my_practices(50);

  PERFORM pg_temp.expect('學生只看得到自己的練習',
    jsonb_array_length(v_json) = 2, 'count=' || jsonb_array_length(v_json));

  SELECT x->>'overall_band' INTO v_txt
    FROM jsonb_array_elements(v_json) x WHERE (x->>'id')::uuid = v_r1;
  PERFORM pg_temp.expect('完成的批改看得到分數', v_txt = '6.0', 'band=' || coalesce(v_txt, 'NULL'));

  SELECT x->>'grading_state' INTO v_txt
    FROM jsonb_array_elements(v_json) x WHERE (x->>'id')::uuid = v_r1;
  PERFORM pg_temp.expect('完成的批改狀態是 GRADED', v_txt = 'GRADED', v_txt);

  -- 🛑 這是這一段真正在測的東西
  PERFORM pg_temp.expect('🛑 回傳裡沒有 error_detail 以外的診斷欄位',
    NOT (v_json::text LIKE '%telemetry%' OR v_json::text LIKE '%lease_worker_id%'
         OR v_json::text LIKE '%queue_attempts%'), NULL);

  -- 失敗的批改對學生顯示成「還沒批改」，不是一句技術訊息
  SELECT x->>'grading_state' INTO v_txt
    FROM jsonb_array_elements(v_json) x WHERE (x->>'id')::uuid = v_r2;
  PERFORM pg_temp.expect('🛑 批改失敗對學生顯示成「還沒批改」',
    v_txt IS NULL, coalesce(v_txt, 'NULL'));

  -- 學生直接讀表應該是零 grant
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM count(*) FROM public.speaking_analyses;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.expect('🛑 學生直接讀 speaking_analyses 會被拒絕', false, '讀到了');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.expect('🛑 學生直接讀 speaking_analyses 會被拒絕', true, SQLERRM);
  END;


  -- ══════════════════════════════════════════════════════
  -- 8. 摘要
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.be(v_admin, true);
  v_json := speaking_grading_summary();

  PERFORM pg_temp.expect('摘要算得出失敗件數',
    (v_json->>'failed')::int >= 2, 'failed=' || (v_json->>'failed'));
  PERFORM pg_temp.expect('沒有人握著租約時 worker_busy = false',
    (v_json->>'worker_busy')::boolean IS FALSE, NULL);
  PERFORM pg_temp.expect('每日上限有回報',
    (v_json->>'daily_cap')::int > 0 AND (v_json->>'daily_used')::int > 0,
    v_json->>'daily_used' || '/' || (v_json->>'daily_cap'));

  -- work_waiting：有工作在等、但沒有人在跑 → 收件匣要顯示「繼續處理佇列」
  v_r_fresh := pg_temp.mk_recording(v_a, v_prompt);
  PERFORM speaking_enqueue_grading_batch(ARRAY[v_r_fresh]);
  v_json := speaking_grading_summary();
  PERFORM pg_temp.expect('🛑 有工作在等又沒人在跑 → work_waiting',
    (v_json->>'work_waiting')::boolean, NULL);

  -- 認領之後就不再是 work_waiting
  PERFORM speaking_grading_claim('worker-1');
  v_json := speaking_grading_summary();
  PERFORM pg_temp.expect('有人在跑就不是 work_waiting',
    (v_json->>'work_waiting')::boolean IS FALSE
      AND (v_json->>'worker_busy')::boolean, NULL);

END;
$test$;

SELECT seq, name, verdict, coalesce(detail, '') FROM t ORDER BY seq;
SELECT verdict, count(*) FROM t GROUP BY verdict ORDER BY verdict;
