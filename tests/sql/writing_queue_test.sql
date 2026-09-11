-- =====================================================
-- 作文批次分析佇列的安全與並行測試
--
-- 🛑 本機專用。不要在 staging 或正式環境執行——它會寫入資料，
--    而且依賴 tests/sql/_writing_local_harness.sql 把 auth.uid() / is_admin()
--    換成讀 GUC 的替身。
--
-- 前置：
--   createdb wq
--   psql -d wq -f tests/sql/_writing_local_harness.sql
--   psql -d wq -c "CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES auth.users(id), display_name TEXT, email TEXT);"
--   psql -d wq -f supabase/migrations/create_writing_submissions.sql
--   psql -d wq -f supabase/migrations/create_writing_texts.sql
--   psql -d wq -f supabase/migrations/add_writing_texts_word_count.sql
--   psql -d wq -f supabase/migrations/create_writing_analyses.sql
--   psql -d wq -f supabase/migrations/add_writing_analyses_stage1_progress.sql
--   psql -d wq -f supabase/migrations/add_writing_analyses_analyzed_at.sql
--   psql -d wq -f supabase/migrations/add_writing_analyses_telemetry.sql
--   psql -d wq -f supabase/migrations/create_writing_teacher_feedback.sql
--   psql -d wq -f supabase/migrations/create_learn_classes_tasks.sql
--   psql -d wq -f supabase/migrations/add_writing_queue_lease.sql
--   psql -d wq -f supabase/migrations/create_writing_teacher_reviews.sql
--   psql -d wq -f supabase/migrations/create_writing_queue_rpcs.sql
--   psql -d wq -f supabase/migrations/update_writing_admin_queue.sql
--   psql -d wq -f supabase/migrations/create_push_subscriptions_table.sql
--   psql -d wq -f supabase/migrations/create_writing_pending_digest.sql
--   psql -d wq -f tests/sql/writing_queue_test.sql
--
-- 這份測試針對的是「M. 安全／可靠性規則」那一條一條：兩個管理員同時開始、
-- 同一篇被選兩次、批次中途失敗、卡住的狀態、已完成的被重排、冪等。
--
-- 輸出一張表：項目 / 結果 / 說明。FAIL = 0 才算通過。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;

GRANT ALL ON TABLE t TO authenticated, anon;
GRANT ALL ON SEQUENCE t_seq_seq TO authenticated, anon;

-- 斷言小工具：把「期望 vs 實際」寫成一列。
CREATE OR REPLACE FUNCTION pg_temp.expect(p_name TEXT, p_ok BOOLEAN, p_detail TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t(name, verdict, detail)
  VALUES (p_name, CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, p_detail);
END;
$$;


DO $test$
DECLARE
  v_admin   UUID;
  v_stu_a   UUID;
  v_stu_b   UUID;
  v_class   UUID;
  v_e1 UUID; v_e2 UUID; v_e3 UUID; v_e_draft UUID; v_e_notext UUID;
  v_batch   JSONB;
  v_claim   JSONB;
  v_claim2  JSONB;
  v_an1 UUID; v_an2 UUID;
  v_txt TEXT;
  v_int INTEGER;
  v_bool BOOLEAN;
  v_sum JSONB;
  v_axis JSONB := '{"ok": true}'::jsonb;
BEGIN
  -- ── 準備 ────────────────────────────────────────────────
  INSERT INTO auth.users (email) VALUES ('q-admin@test') RETURNING id INTO v_admin;
  INSERT INTO auth.users (email) VALUES ('q-a@test')     RETURNING id INTO v_stu_a;
  INSERT INTO auth.users (email) VALUES ('q-b@test')     RETURNING id INTO v_stu_b;
  INSERT INTO user_profiles (user_id, display_name) VALUES (v_stu_a, '小安'), (v_stu_b, '小班');

  INSERT INTO learn_classes (name, status) VALUES ('202609 週六寫作大師班', 'ACTIVE')
    RETURNING id INTO v_class;
  INSERT INTO learn_class_members (class_id, student_id) VALUES (v_class, v_stu_a);

  -- 三篇正常的、一篇草稿、一篇沒有正規文字
  INSERT INTO writing_submissions (student_id, title, status, submitted_at)
    VALUES (v_stu_a, '第一篇', 'SUBMITTED', now() - interval '3 hours') RETURNING id INTO v_e1;
  INSERT INTO writing_submissions (student_id, title, status, submitted_at)
    VALUES (v_stu_a, '第二篇', 'SUBMITTED', now() - interval '2 hours') RETURNING id INTO v_e2;
  INSERT INTO writing_submissions (student_id, title, status, submitted_at)
    VALUES (v_stu_b, '第三篇', 'SUBMITTED', now() - interval '1 hour')  RETURNING id INTO v_e3;
  INSERT INTO writing_submissions (student_id, title, status)
    VALUES (v_stu_b, '還沒送出', 'DRAFT') RETURNING id INTO v_e_draft;
  INSERT INTO writing_submissions (student_id, title, status, submitted_at)
    VALUES (v_stu_b, '沒有文字', 'SUBMITTED', now()) RETURNING id INTO v_e_notext;

  INSERT INTO writing_texts (essay_id, content, provenance)
    VALUES (v_e1, 'Essay one content.', 'TYPED'),
           (v_e2, 'Essay two content.', 'TYPED'),
           (v_e3, 'Essay three content.', 'TYPED');

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('test.is_admin', 'true', true);


  -- ══════════════════════════════════════════════════════
  -- 1. 批次排入
  -- ══════════════════════════════════════════════════════

  -- 同一篇刻意傳兩次：M 的「same essay accidentally selected twice」
  v_batch := writing_enqueue_analysis_batch(ARRAY[v_e1, v_e2, v_e1, v_e3]);

  PERFORM pg_temp.expect('批次排入三篇（重複的 id 只算一次）',
    (v_batch->>'requested')::int = 3 AND (v_batch->>'enqueued')::int = 3,
    'requested=' || (v_batch->>'requested') || ' enqueued=' || (v_batch->>'enqueued'));

  SELECT count(*) INTO v_int FROM writing_analyses WHERE status = 'QUEUED';
  PERFORM pg_temp.expect('資料庫裡確實只有三列 QUEUED', v_int = 3, 'count=' || v_int);

  SELECT count(DISTINCT queue_batch_id) INTO v_int FROM writing_analyses WHERE queue_batch_id IS NOT NULL;
  PERFORM pg_temp.expect('三篇共用同一個 batch id', v_int = 1, 'distinct=' || v_int);

  -- 再排一次同一批：冪等，不新增任何列
  v_batch := writing_enqueue_analysis_batch(ARRAY[v_e1, v_e2, v_e3]);
  SELECT count(*) INTO v_int FROM writing_analyses;
  PERFORM pg_temp.expect('重複排入同一批是冪等的（不新增列）', v_int = 3, 'total=' || v_int);
  PERFORM pg_temp.expect('重複排入回報 ALREADY_ACTIVE',
    (v_batch->>'enqueued')::int = 0
      AND v_batch->'items'->0->>'result' = 'ALREADY_ACTIVE',
    v_batch->'items'->0->>'result');

  -- 草稿與沒有正規文字的
  -- ⚠️ items 的順序不等於傳入順序（函式內部有 array_agg(DISTINCT ...) 會排序），
  --    所以一律依 essay_id 查，不用位置。
  v_batch := writing_enqueue_analysis_batch(ARRAY[v_e_draft, v_e_notext]);
  SELECT i->>'result' INTO v_txt
    FROM jsonb_array_elements(v_batch->'items') i WHERE (i->>'essay_id')::uuid = v_e_draft;
  PERFORM pg_temp.expect('草稿不得排入', v_txt = 'NOT_SUBMITTED', v_txt);
  SELECT i->>'result' INTO v_txt
    FROM jsonb_array_elements(v_batch->'items') i WHERE (i->>'essay_id')::uuid = v_e_notext;
  PERFORM pg_temp.expect('沒有正規文字的不得排入', v_txt = 'NO_TEXT', v_txt);

  -- 一次超過 50 篇（用 51 個【不同】的 id——去重發生在檢查上限之前）
  BEGIN
    PERFORM writing_enqueue_analysis_batch(
      (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 51)));
    PERFORM pg_temp.expect('一次超過 50 篇會被擋下', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('一次超過 50 篇會被擋下', true, SQLERRM);
  END;

  -- 空陣列
  BEGIN
    PERFORM writing_enqueue_analysis_batch(ARRAY[]::UUID[]);
    PERFORM pg_temp.expect('空陣列會被擋下', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('空陣列會被擋下', true, SQLERRM);
  END;

  -- 非管理員
  PERFORM set_config('test.is_admin', 'false', true);
  BEGIN
    PERFORM writing_enqueue_analysis_batch(ARRAY[v_e1]);
    PERFORM pg_temp.expect('🛑 非管理員不得批次排入', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 非管理員不得批次排入', true, SQLERRM);
  END;
  PERFORM set_config('test.is_admin', 'true', true);


  -- ══════════════════════════════════════════════════════
  -- 2. concurrency = 1
  -- ══════════════════════════════════════════════════════

  v_claim := writing_queue_claim('worker-A', 150);
  PERFORM pg_temp.expect('第一次認領拿到工作',
    (v_claim->>'claimed')::boolean AND v_claim->>'mode' = 'stage1',
    'mode=' || coalesce(v_claim->>'mode', 'NULL'));

  PERFORM pg_temp.expect('先排入的先做（最舊的 requested_at）',
    (v_claim->>'essay_id')::uuid = v_e1, v_claim->>'essay_id');

  -- 🛑 M 的核心：兩個管理員同時開始分析 → 第二個 worker 什麼都拿不到
  v_claim2 := writing_queue_claim('worker-B', 150);
  PERFORM pg_temp.expect('🛑 第二個 worker 拿到 BUSY（concurrency = 1）',
    (v_claim2->>'claimed')::boolean IS FALSE AND v_claim2->>'reason' = 'BUSY',
    'reason=' || coalesce(v_claim2->>'reason', 'NULL'));

  v_an1 := (v_claim->>'analysis_id')::uuid;

  -- 認領之後這一列確實握著租約
  SELECT lease_expires_at > now() INTO v_bool FROM writing_analyses WHERE id = v_an1;
  PERFORM pg_temp.expect('認領會寫入未過期的租約', v_bool, 'lease>now=' || v_bool);

  -- 放開之後下一次認領立刻能接手
  PERFORM writing_queue_release(v_an1);
  v_claim2 := writing_queue_claim('worker-B', 150);
  PERFORM pg_temp.expect('放開租約後下一個 worker 能接手',
    (v_claim2->>'claimed')::boolean, v_claim2->>'reason');
  PERFORM writing_queue_release((v_claim2->>'analysis_id')::uuid);


  -- ══════════════════════════════════════════════════════
  -- 3. 租約過期：worker 死掉之後的復原
  -- ══════════════════════════════════════════════════════

  -- 讓 e1 進入 ANALYZING 並持有一個【已經過期】的租約，模擬被平台砍掉的 worker
  UPDATE writing_analyses SET status = 'ANALYZING', started_at = now() WHERE id = v_an1;
  UPDATE writing_analyses SET lease_expires_at = now() - interval '1 minute',
                              lease_worker_id = 'dead-worker'
   WHERE id = v_an1;

  v_claim := writing_queue_claim('worker-C', 150);
  SELECT queue_attempts INTO v_int FROM writing_analyses WHERE id = v_an1;
  PERFORM pg_temp.expect('租約過期 → queue_attempts + 1', v_int = 1, 'attempts=' || v_int);
  PERFORM pg_temp.expect('租約過期的工作會被放回佇列並重新認領',
    (v_claim->>'claimed')::boolean AND (v_claim->>'analysis_id')::uuid = v_an1,
    'claimed=' || (v_claim->>'claimed'));

  SELECT status INTO v_txt FROM writing_analyses WHERE id = v_an1;
  PERFORM pg_temp.expect('放回佇列【不】把它收成 FAILED（已驗證的 pass 要保留）',
    v_txt = 'ANALYZING', 'status=' || v_txt);

  -- 次數用完 → FAILED
  UPDATE writing_analyses SET queue_attempts = 3,
                              lease_expires_at = now() - interval '1 minute'
   WHERE id = v_an1;
  v_claim := writing_queue_claim('worker-D', 150, 3);
  SELECT status INTO v_txt FROM writing_analyses WHERE id = v_an1;
  PERFORM pg_temp.expect('重試次數用完 → 收成 FAILED（不自動無限重試）',
    v_txt = 'FAILED', 'status=' || v_txt);

  SELECT error_detail IS NOT NULL INTO v_bool FROM writing_analyses WHERE id = v_an1;
  PERFORM pg_temp.expect('收成 FAILED 時寫明理由', v_bool, 'has_detail=' || v_bool);

  -- 🛑 一篇失敗不得停下整批：同一次認領就接著拿下一篇
  PERFORM pg_temp.expect('🛑 一篇失敗後佇列繼續（同一次認領就拿到下一篇）',
    (v_claim->>'claimed')::boolean AND (v_claim->>'essay_id')::uuid <> v_e1,
    'next=' || coalesce(v_claim->>'essay_id', 'NULL'));
  PERFORM writing_queue_release((v_claim->>'analysis_id')::uuid);


  -- ══════════════════════════════════════════════════════
  -- 4. 綜合層優先，以及「綜合層完成但狀態沒推上去」的殘局
  -- ══════════════════════════════════════════════════════

  SELECT id INTO v_an2 FROM writing_analyses WHERE essay_id = v_e2;
  UPDATE writing_analyses SET status = 'ANALYZING', started_at = now() WHERE id = v_an2;
  UPDATE writing_analyses
     SET competency_analysis = v_axis, error_analysis = v_axis,
         high_score_feature_analysis = v_axis,
         status = 'ANALYZED', synthesis_status = 'PENDING'
   WHERE id = v_an2;

  v_claim := writing_queue_claim('worker-E', 150);
  PERFORM pg_temp.expect('ANALYZED 的優先於 QUEUED，而且 mode = synthesis',
    (v_claim->>'analysis_id')::uuid = v_an2 AND v_claim->>'mode' = 'synthesis',
    'mode=' || coalesce(v_claim->>'mode', 'NULL'));
  PERFORM writing_queue_release(v_an2);

  -- worker 版的「把綜合層推到 RUNNING」
  PERFORM writing_queue_begin_synthesis(v_an2);
  SELECT synthesis_status INTO v_txt FROM writing_analyses WHERE id = v_an2;
  PERFORM pg_temp.expect('writing_queue_begin_synthesis 把綜合層推到 RUNNING',
    v_txt = 'RUNNING', 'synthesis=' || v_txt);

  -- 殘局：綜合層寫完 COMPLETED，但 status 還沒推上去就被砍掉
  UPDATE writing_analyses
     SET synthesis_status = 'COMPLETED', synthesis_completed_at = now(),
         overall_evaluation = v_axis, next_steps = v_axis,
         lease_expires_at = now() - interval '1 minute'
   WHERE id = v_an2;

  v_claim := writing_queue_claim('worker-F', 150);
  -- worker-F 順手認領了下一篇；放開它，否則後面 worker_busy 的斷言會被它影響。
  IF (v_claim->>'claimed')::boolean THEN
    PERFORM writing_queue_release((v_claim->>'analysis_id')::uuid);
  END IF;
  SELECT status INTO v_txt FROM writing_analyses WHERE id = v_an2;
  PERFORM pg_temp.expect('綜合層完成但狀態卡住的殘局會被補完成 COMPLETED',
    v_txt = 'COMPLETED', 'status=' || v_txt);


  -- ══════════════════════════════════════════════════════
  -- 5. 已完成的不得被批次重排
  -- ══════════════════════════════════════════════════════

  v_batch := writing_enqueue_analysis_batch(ARRAY[v_e2]);
  PERFORM pg_temp.expect('🛑 已完成的作文預設跳過，不重新分析',
    v_batch->'items'->0->>'result' = 'SKIPPED_COMPLETED',
    v_batch->'items'->0->>'result');

  v_batch := writing_enqueue_analysis_batch(ARRAY[v_e2], true);
  PERFORM pg_temp.expect('明確 force 時才重新分析（新的一版）',
    v_batch->'items'->0->>'result' = 'ENQUEUED', v_batch->'items'->0->>'result');

  SELECT max(analysis_version) INTO v_int FROM writing_analyses WHERE essay_id = v_e2;
  PERFORM pg_temp.expect('重新分析是新的一列（version + 1），舊的不被改寫',
    v_int = 2, 'version=' || v_int);

  SELECT count(*) INTO v_int FROM writing_analyses WHERE essay_id = v_e2 AND status = 'COMPLETED';
  PERFORM pg_temp.expect('先前完成的那一版仍然存在', v_int = 1, 'completed=' || v_int);

  -- 失敗的可以重排（＝「重試失敗項目」）
  v_batch := writing_enqueue_analysis_batch(ARRAY[v_e1]);
  PERFORM pg_temp.expect('失敗的作文可以重新排入（重試失敗項目）',
    v_batch->'items'->0->>'result' = 'ENQUEUED', v_batch->'items'->0->>'result');


  -- ══════════════════════════════════════════════════════
  -- 6. worker 不得自己生出工作
  -- ══════════════════════════════════════════════════════

  SELECT count(*) INTO v_int FROM writing_analyses WHERE essay_id = v_e3;
  PERFORM writing_queue_ensure_analysis(v_e3);
  PERFORM pg_temp.expect('writing_queue_ensure_analysis 不會建立新列',
    (SELECT count(*) FROM writing_analyses WHERE essay_id = v_e3) = v_int,
    'before=' || v_int);

  PERFORM pg_temp.expect('沒有飛行中分析時 ensure 回傳 NULL',
    writing_queue_ensure_analysis(v_e_draft) IS NULL, 'draft');


  -- ══════════════════════════════════════════════════════
  -- 7. 老師檢閱狀態
  -- ══════════════════════════════════════════════════════

  PERFORM pg_temp.expect('標記已檢閱回傳 true',
    writing_set_teacher_reviewed(v_e3, true), NULL);
  PERFORM pg_temp.expect('重複標記是冪等的',
    writing_set_teacher_reviewed(v_e3, true)
      AND (SELECT count(*) FROM writing_teacher_reviews WHERE essay_id = v_e3) = 1, NULL);
  -- 兩步分開寫：擠在同一個運算式裡時，子查詢可能在函式呼叫【之前】被求值。
  v_bool := writing_set_teacher_reviewed(v_e3, false);
  SELECT count(*) INTO v_int FROM writing_teacher_reviews WHERE essay_id = v_e3;
  PERFORM pg_temp.expect('取消檢閱是刪列，不是存 false',
    v_bool IS FALSE AND v_int = 0, 'returned=' || v_bool || ' rows=' || v_int);

  BEGIN
    PERFORM writing_set_teacher_reviewed(v_e_draft, true);
    PERFORM pg_temp.expect('草稿不得標記為已檢閱', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('草稿不得標記為已檢閱', true, SQLERRM);
  END;

  PERFORM set_config('test.is_admin', 'false', true);
  BEGIN
    PERFORM writing_set_teacher_reviewed(v_e3, true);
    PERFORM pg_temp.expect('🛑 非管理員不得標記已檢閱', false, '沒有 raise');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('🛑 非管理員不得標記已檢閱', true, SQLERRM);
  END;
  PERFORM set_config('test.is_admin', 'true', true);


  -- ══════════════════════════════════════════════════════
  -- 8. 概況：待處理的定義
  -- ══════════════════════════════════════════════════════

  v_sum := writing_queue_summary();
  -- e1 / e2 / e3 都符合「已送出 + 有正規文字 + 沒有檢閱紀錄」；
  -- e_notext 沒有正規文字、e_draft 是草稿，兩者都不算。
  PERFORM pg_temp.expect('待處理 = 已送出 + 有正規文字 + 未檢閱（草稿與無文字的不算）',
    (v_sum->>'pending_total')::int = 3, 'pending=' || (v_sum->>'pending_total'));

  PERFORM writing_set_teacher_reviewed(v_e3, true);
  v_sum := writing_queue_summary();
  PERFORM pg_temp.expect('標記檢閱之後待處理數字下降',
    (v_sum->>'pending_total')::int = 2, 'pending=' || (v_sum->>'pending_total'));

  PERFORM pg_temp.expect('by_class 依班級分組',
    v_sum->'by_class'->0->>'name' = '202609 週六寫作大師班'
      AND (v_sum->'by_class'->0->>'count')::int = 2,
    coalesce(v_sum->'by_class'->0->>'count', 'NULL'));

  PERFORM pg_temp.expect('oldest_pending_at 有值', v_sum->>'oldest_pending_at' IS NOT NULL, NULL);

  PERFORM pg_temp.expect('沒有 worker 在跑時 worker_busy = false',
    (v_sum->>'worker_busy')::boolean IS FALSE, v_sum->>'worker_busy');
  PERFORM pg_temp.expect('佇列裡還有工作時 work_waiting = true',
    (v_sum->>'work_waiting')::boolean, v_sum->>'work_waiting');

  -- 收件匣有沒有把人名與班級帶出來
  SELECT (writing_admin_queue()->0->>'student_name') INTO v_txt;
  PERFORM pg_temp.expect('收件匣回傳學生姓名而不是裸 uuid',
    v_txt IN ('小安', '小班'), 'name=' || coalesce(v_txt, 'NULL'));

  SELECT jsonb_array_length(
           (SELECT e FROM jsonb_array_elements(writing_admin_queue()) e
             WHERE (e->>'essay_id')::uuid = v_e1)->'class_names')
    INTO v_int;
  PERFORM pg_temp.expect('收件匣回傳班級名稱', v_int = 1, 'classes=' || coalesce(v_int::text, 'NULL'));

  SELECT ((SELECT e FROM jsonb_array_elements(writing_admin_queue()) e
            WHERE (e->>'essay_id')::uuid = v_e3)->>'teacher_reviewed')::boolean
    INTO v_bool;
  PERFORM pg_temp.expect('收件匣回傳老師檢閱狀態', v_bool, 'reviewed=' || v_bool);


  -- ══════════════════════════════════════════════════════
  -- 9. 每日提醒讀到的數字必須與老師看到的一模一樣
  -- ══════════════════════════════════════════════════════

  -- 這是這兩支函式存在的唯一理由：定義只有一份。
  -- 若哪天有人把其中一支改成自己查表，這一條會立刻紅掉。
  PERFORM pg_temp.expect('🛑 排程與老師讀到的摘要完全相同',
    writing_pending_digest() = writing_queue_summary(),
    'digest=' || (writing_pending_digest()->>'pending_total')
      || ' summary=' || (writing_queue_summary()->>'pending_total'));

  -- 排程的入口不看 is_admin()——它本來就沒有身分
  PERFORM set_config('test.is_admin', 'false', true);
  BEGIN
    v_sum := writing_pending_digest();
    PERFORM pg_temp.expect('排程入口不需要管理員身分',
      (v_sum->>'pending_total')::int >= 0, 'pending=' || (v_sum->>'pending_total'));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect('排程入口不需要管理員身分', false, SQLERRM);
  END;
  PERFORM set_config('test.is_admin', 'true', true);

  -- 推播對象：依 email 找得到，而且找不到的 email 不會炸
  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (v_admin, 'https://push.example/abc', 'p256dh-key', 'auth-key');

  SELECT count(*) INTO v_int
    FROM writing_reminder_push_targets(ARRAY['q-admin@test']);
  PERFORM pg_temp.expect('推播對象依 email 找得到', v_int = 1, 'targets=' || v_int);

  SELECT count(*) INTO v_int
    FROM writing_reminder_push_targets(ARRAY['Q-ADMIN@TEST']);
  PERFORM pg_temp.expect('email 比對不分大小寫', v_int = 1, 'targets=' || v_int);

  SELECT count(*) INTO v_int
    FROM writing_reminder_push_targets(ARRAY['nobody@test']);
  PERFORM pg_temp.expect('不存在的 email 回傳空集合，不報錯', v_int = 0, 'targets=' || v_int);

  SELECT count(*) INTO v_int FROM writing_reminder_push_targets(NULL);
  PERFORM pg_temp.expect('NULL 收件人回傳空集合，不報錯', v_int = 0, 'targets=' || v_int);

END;
$test$;


-- ══════════════════════════════════════════════════════
-- 9. 權限：worker 專用的 RPC 對一般使用者必須完全關閉
-- ══════════════════════════════════════════════════════

INSERT INTO t(name, verdict, detail)
SELECT
  '🛑 ' || p.proname || ' 對 ' || r.rolname || ' 沒有 EXECUTE',
  CASE WHEN has_function_privilege(r.rolname, p.oid, 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
  NULL
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
WHERE n.nspname = 'public'
  AND p.proname IN ('writing_queue_claim', 'writing_queue_release',
                    'writing_queue_ensure_analysis', 'writing_queue_begin_synthesis');

-- 老師用的兩支：authenticated 要有、anon 不能有
INSERT INTO t(name, verdict, detail)
SELECT
  p.proname || '：authenticated 有 EXECUTE、anon 沒有',
  CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN 'PASS' ELSE 'FAIL' END,
  NULL
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('writing_enqueue_analysis_batch', 'writing_queue_summary',
                    'writing_set_teacher_reviewed', 'writing_admin_queue');

-- search_path 一律釘死
INSERT INTO t(name, verdict, detail)
SELECT
  p.proname || ' 的 search_path 釘住',
  CASE WHEN p.proconfig::text LIKE '%search_path=%' THEN 'PASS' ELSE 'FAIL' END,
  coalesce(p.proconfig::text, 'NULL')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('writing_enqueue_analysis_batch', 'writing_queue_claim',
                    'writing_queue_release', 'writing_queue_ensure_analysis',
                    'writing_queue_begin_synthesis', 'writing_queue_summary',
                    'writing_set_teacher_reviewed', 'writing_admin_queue');

-- 🛑 定義本身（internal）對【所有】角色零 EXECUTE——包含 service_role。
-- 它沒有任何授權檢查，唯一的合法呼叫者是兩支帶守門的包裝。
INSERT INTO t(name, verdict, detail)
SELECT
  '🛑 writing_pending_summary_internal 對 ' || r.rolname || ' 沒有 EXECUTE',
  CASE WHEN has_function_privilege(r.rolname, p.oid, 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
  NULL
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
WHERE n.nspname = 'public' AND p.proname = 'writing_pending_summary_internal';

-- 排程專用的兩支：只有 service_role
INSERT INTO t(name, verdict, detail)
SELECT
  '🛑 ' || p.proname || ' 只有 service_role 叫得動',
  CASE WHEN has_function_privilege('service_role', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
       THEN 'PASS' ELSE 'FAIL' END,
  NULL
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('writing_pending_digest', 'writing_reminder_push_targets');

INSERT INTO t(name, verdict, detail)
SELECT
  p.proname || ' 的 search_path 釘住',
  CASE WHEN p.proconfig::text LIKE '%search_path=%' THEN 'PASS' ELSE 'FAIL' END,
  coalesce(p.proconfig::text, 'NULL')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('writing_pending_summary_internal', 'writing_pending_digest',
                    'writing_reminder_push_targets');

-- writing_teacher_reviews：所有角色零 grant，而且 RLS 開著
INSERT INTO t(name, verdict, detail)
SELECT
  '🛑 writing_teacher_reviews 對 ' || r.rolname || ' 零 grant',
  CASE WHEN has_table_privilege(r.rolname, 'writing_teacher_reviews', 'SELECT')
         OR has_table_privilege(r.rolname, 'writing_teacher_reviews', 'INSERT')
         OR has_table_privilege(r.rolname, 'writing_teacher_reviews', 'UPDATE')
         OR has_table_privilege(r.rolname, 'writing_teacher_reviews', 'DELETE')
       THEN 'FAIL' ELSE 'PASS' END,
  NULL
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname);

INSERT INTO t(name, verdict, detail)
SELECT 'writing_teacher_reviews 的 RLS 開著',
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END, NULL
  FROM pg_class WHERE relname = 'writing_teacher_reviews';


-- ══════════════════════════════════════════════════════
-- 結果
-- ══════════════════════════════════════════════════════

SELECT seq, name AS "項目", verdict AS "結果", coalesce(detail, '') AS "說明"
  FROM t ORDER BY seq;

SELECT verdict AS "結果", count(*) AS "項數" FROM t GROUP BY verdict ORDER BY verdict;
