-- =====================================================
-- 作文批次分析佇列的資料庫層
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 add_writing_queue_lease.sql 之後執行。
--
--
-- 一、佇列就是 writing_analyses，這裡只補上「誰在跑」
--
--   排入佇列 = 插入一列 QUEUED（沿用既有的 writing_enqueue_analysis）
--   認領     = 寫入租約（writing_queue_claim）
--   放開     = 清掉租約（writing_queue_release）
--   完成     = 既有的分析流程把 status 推到 COMPLETED / FAILED
--
--   沒有第二套狀態，也沒有第二張表。
--
--
-- 二、concurrency = 1 是怎麼保證的
--
--   writing_queue_claim() 裡有兩道：
--
--     1. pg_advisory_xact_lock —— 同一時間只有一個認領交易進得來。
--        兩個管理員同時按下「批次開始分析」，兩個 worker 同時打進來，
--        其中一個會在這裡排隊等待，不會兩個都讀到「現在沒人在跑」。
--
--     2. 活著的租約檢查 —— 只要還有任何一列持有未過期的租約，
--        這一次認領就回傳 BUSY，什麼都不做。
--
--   這兩道都在資料庫裡。前端把按鈕停用只是禮貌，不是保證；
--   直接用 curl 打 worker 端點也繞不過去。
--
--
-- 三、worker 死掉之後會怎樣
--
--   serverless 的函式隨時可能被平台中斷（逾時、冷啟動失敗、部署）。
--   死掉的 worker 不會來清租約，所以租約用【到期時間】表示，不是用布林。
--
--   租約過期的列會被下一次認領處理：
--     queue_attempts 還沒用完 → 清掉租約放回佇列，次數 +1
--                               （stage1_progress 保留，已驗證的 pass 不重跑）
--     次數用完               → 收成 FAILED，寫明理由，等老師按「重試失敗項目」
--
--   「不自動無限重試」就是靠 queue_attempts 這個上界。
--
--
-- 四、權限
--
--   writing_enqueue_analysis_batch  老師（呼叫者身分，資料庫再驗 is_admin）
--   writing_queue_summary           老師
--   writing_queue_claim             service_role only
--   writing_queue_release           service_role only
--   writing_queue_ensure_analysis   service_role only
--   writing_queue_begin_synthesis   service_role only
--
--   後四支是 worker 專用。刻意【不】放寬既有的 writing_enqueue_analysis /
--   writing_retry_synthesis——那兩支維持「只有登入的管理員能呼叫」，
--   一個字都不動。worker 走自己的門，兩條路的權限互不影響。
--
-- 回滾：supabase/migrations/create_writing_queue_rpcs.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'writing queue 需要 public.is_admin()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'writing_enqueue_analysis'
  ) THEN
    RAISE EXCEPTION 'writing queue 需要 writing_enqueue_analysis()，請先套用 create_writing_analyses.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'writing_analyses'
       AND column_name = 'lease_expires_at'
  ) THEN
    RAISE EXCEPTION 'writing queue 需要租約欄位，請先套用 add_writing_queue_lease.sql';
  END IF;
END;
$$;


-- =====================================================
-- 老師：一次排入多篇
-- =====================================================

/**
 * 把多篇作文排入分析佇列，共用一個 batch id。
 *
 * 每一篇的處理沿用既有的 writing_enqueue_analysis()——它本來就是冪等的：
 * 已經在飛行中就回傳既有那一筆，不會重複建立。所以「同一篇不小心被選兩次」
 * 在資料庫層就不可能造成兩次分析，前端不必去重。
 *
 * 已經 COMPLETED 的作文【預設跳過】。要重新分析必須明確傳 p_force := true，
 * 那是老師刻意選擇的動作，不是批次的副作用。
 *
 * 回傳每一篇的結果，讓前端能誠實地說「排了 12 篇，跳過 3 篇」。
 * ⚠️ items 的順序【不等於】傳入順序——內部去重時會排序。要對照請用 essay_id，
 *    不要用位置。
 *   ENQUEUED           排進去了（新的一列）
 *   ALREADY_ACTIVE     本來就在佇列裡或正在跑，沒有重複排入
 *   SKIPPED_COMPLETED  已經分析完成，未 force 所以跳過
 *   NOT_SUBMITTED      不是已送出的作文
 *   NO_TEXT            沒有正規文字，不能分析
 */
CREATE OR REPLACE FUNCTION writing_enqueue_analysis_batch(
  p_essay_ids UUID[],
  p_force BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch UUID := gen_random_uuid();
  v_ids UUID[];
  v_id UUID;
  v_analysis UUID;
  v_items JSONB := '[]'::jsonb;
  v_enqueued INTEGER := 0;
  v_latest RECORD;
  v_outcome TEXT;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_enqueue_analysis_batch：僅限管理員' USING ERRCODE = '42501';
  END IF;

  -- 去重：同一篇被選兩次只算一次。資料庫層本來就擋得住重複分析，
  -- 但去重之後回傳的清單才不會出現兩筆同一篇、讓老師以為真的排了兩次。
  SELECT array_agg(DISTINCT x) INTO v_ids
    FROM unnest(coalesce(p_essay_ids, ARRAY[]::UUID[])) AS x
   WHERE x IS NOT NULL;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION '沒有選取任何作文' USING ERRCODE = '22023';
  END IF;

  -- 上限。一次排 200 篇不是使用情境，是誤操作——而每一篇都是真金白銀的
  -- DeepSeek 呼叫，所以在資料庫層就擋住，不是只在前端提醒。
  IF array_length(v_ids, 1) > 50 THEN
    RAISE EXCEPTION '一次最多排入 50 篇，這次是 % 篇', array_length(v_ids, 1)
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_outcome := NULL;
    v_analysis := NULL;

    IF NOT EXISTS (
      SELECT 1 FROM public.writing_submissions s
       WHERE s.id = v_id AND s.status = 'SUBMITTED'
    ) THEN
      v_outcome := 'NOT_SUBMITTED';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.writing_texts t WHERE t.essay_id = v_id
    ) THEN
      v_outcome := 'NO_TEXT';
    ELSE
      SELECT a.id, a.status INTO v_latest
        FROM public.writing_analyses a
       WHERE a.essay_id = v_id
       ORDER BY a.analysis_version DESC
       LIMIT 1;

      IF FOUND AND v_latest.status = 'COMPLETED' AND NOT coalesce(p_force, false) THEN
        v_outcome := 'SKIPPED_COMPLETED';
      ELSIF FOUND AND v_latest.status IN ('QUEUED', 'ANALYZING', 'ANALYZED') THEN
        -- 已經在佇列裡。掛上這一次的 batch id，讓進度數字把它算進去，
        -- 但【不】重新排入，也不動它的租約與進度。
        v_analysis := v_latest.id;
        UPDATE public.writing_analyses
           SET queue_batch_id = v_batch
         WHERE id = v_analysis;
        v_outcome := 'ALREADY_ACTIVE';
      ELSE
        -- 沒分析過、上一次失敗、或 force 重跑：走既有那支，它會處理版本號
        -- 與「卡在 ANALYZED 但綜合層失敗」的收尾。
        v_analysis := public.writing_enqueue_analysis(v_id);
        UPDATE public.writing_analyses
           SET queue_batch_id = v_batch
         WHERE id = v_analysis;
        v_outcome := 'ENQUEUED';
        v_enqueued := v_enqueued + 1;
      END IF;
    END IF;

    v_items := v_items || jsonb_build_object(
      'essay_id', v_id,
      'analysis_id', v_analysis,
      'result', v_outcome
    );
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'requested', array_length(v_ids, 1),
    'enqueued', v_enqueued,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION writing_enqueue_analysis_batch IS
  '一次排入多篇分析，共用一個 batch id。逐篇沿用冪等的 writing_enqueue_analysis；已完成的預設跳過，要重跑必須明確 p_force。僅限管理員。';

REVOKE ALL ON FUNCTION writing_enqueue_analysis_batch(UUID[], BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_enqueue_analysis_batch(UUID[], BOOLEAN) TO authenticated, service_role;


-- =====================================================
-- worker：認領一個單位的工作
-- =====================================================

/**
 * 認領佇列裡的下一個工作單位。【只有 service_role 叫得到】。
 *
 * 一次只回傳一個單位，而且全系統同時只有一個單位在飛——
 * 這是刻意的產品決策（QUEUE, NOT PARALLEL BURST），不是還沒做完的優化。
 *
 * 「一個單位」不等於「一篇作文」：一篇作文的 Stage 1 最多要 4 次請求
 * （某一支 pass 沒通過驗證就再跑一次），加上綜合層 1 次。每一次都是
 * 獨立的認領，各自擁有完整的 50 秒。stage1_progress 讓已經 VALID 的 pass
 * 永遠不重跑，所以中斷的代價只有當下那一支。
 *
 * 回傳：
 *   { "claimed": true,  "analysis_id": ..., "essay_id": ..., "mode": "stage1"|"synthesis", ... }
 *   { "claimed": false, "reason": "BUSY"|"EMPTY", "expired": n, "failed": n }
 */
CREATE OR REPLACE FUNCTION writing_queue_claim(
  p_worker TEXT,
  p_lease_seconds INTEGER DEFAULT 150,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired INTEGER := 0;
  v_failed  INTEGER := 0;
  v_row public.writing_analyses%ROWTYPE;
  v_mode TEXT;
  v_lease TIMESTAMPTZ;
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION '租約長度必須在 30–900 秒之間' USING ERRCODE = '22023';
  END IF;

  -- ── 互斥 ──────────────────────────────────────────────────
  -- 同一時間只有一個認領交易進得來。兩個 worker 同時打進來時，
  -- 後到的那個會在這裡等，等到前面那個已經寫好租約——
  -- 於是它看到的是「有人在跑」，而不是一個過時的快照。
  PERFORM pg_advisory_xact_lock(778811);

  -- ── 步驟 0：收尾「綜合層完成了但狀態沒推上去」的殘局 ──────────
  -- performSynthesis 先寫 synthesis COMPLETED、再把 status 推到 COMPLETED。
  -- 平台若剛好在這兩個寫入之間把函式砍掉，就會留下一列四軸齊備、綜合層
  -- 完成、但 status 還停在 ANALYZED 的報告。學生已經付出的分析成本都還在，
  -- 只差最後一個轉移——在這裡補完，不要讓它重跑一次綜合層。
  UPDATE public.writing_analyses a
     SET status = 'COMPLETED',
         completed_at = coalesce(a.completed_at, now()),
         lease_expires_at = NULL,
         lease_worker_id = NULL
   WHERE a.status = 'ANALYZED'
     AND a.synthesis_status = 'COMPLETED'
     AND a.competency_analysis IS NOT NULL
     AND a.error_analysis IS NOT NULL
     AND a.high_score_feature_analysis IS NOT NULL
     AND a.overall_evaluation IS NOT NULL
     AND a.next_steps IS NOT NULL;

  -- ── 步驟 1a：租約過期且重試次數用完 → 收成 FAILED ──────────────
  UPDATE public.writing_analyses a
     SET status = 'FAILED',
         failed_at = now(),
         failed_pass = coalesce(a.failed_pass,
                        CASE WHEN a.status = 'ANALYZED' THEN 'synthesis' ELSE 'stage1' END),
         error_detail = coalesce(a.error_detail,
                        '分析多次未在租約內回報（可能被平台中斷），已停止自動重試。可按「重試失敗項目」重新排入。'),
         lease_expires_at = NULL,
         lease_worker_id = NULL
   WHERE a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
     AND a.lease_expires_at IS NOT NULL
     AND a.lease_expires_at <= now()
     AND a.queue_attempts >= p_max_attempts;
  GET DIAGNOSTICS v_failed = ROW_COUNT;

  -- ── 步驟 1b：租約過期但還有次數 → 放回佇列 ─────────────────────
  -- 刻意【不】丟掉 stage1_progress：已經通過驗證的 pass 是花了錢換來的，
  -- 重跑只會多付一次同樣的錢、拿到同樣的結果。
  UPDATE public.writing_analyses a
     SET lease_expires_at = NULL,
         lease_worker_id = NULL,
         queue_attempts = a.queue_attempts + 1
   WHERE a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
     AND a.lease_expires_at IS NOT NULL
     AND a.lease_expires_at <= now();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- ── 步驟 2：還有人在跑就不認領 ────────────────────────────────
  -- ⚠️ 判準是【有沒有人握著未過期的租約】，不是 status。
  --    認領一列 QUEUED 時 status 還是 QUEUED——是 runStage1 稍後才把它推到
  --    ANALYZING。若這裡只看 ANALYZING/ANALYZED，第一個 worker 剛認領完、
  --    還來不及動 status 的那一段時間裡，第二個 worker 會看到「沒有人在跑」
  --    然後認領下一篇——concurrency 就變成 2 了。
  --    （本機測試 writing_queue_test.sql 的「第二個 worker 拿到 BUSY」抓到過這件事。）
  IF EXISTS (
    SELECT 1 FROM public.writing_analyses a
     WHERE a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
       AND a.lease_expires_at IS NOT NULL
       AND a.lease_expires_at > now()
  ) THEN
    RETURN jsonb_build_object(
      'claimed', false, 'reason', 'BUSY',
      'expired', v_expired, 'failed', v_failed
    );
  END IF;

  -- ── 步驟 3：挑一列 ───────────────────────────────────────────
  -- 先做快完成的（ANALYZED 只差一支輕量綜合層），再開新的 —— 這讓
  -- 「在飛行中的篇數」盡快收斂，老師也比較早看到第一篇完成。
  --
  -- ⚠️ 排序【不能】只看 requested_at：批次排入時那 15 列是在同一個交易裡插入的，
  --    now() 對它們而言是同一個瞬間，requested_at 完全相同，順序會變成不確定。
  --    改以作文的送出時間為主鍵——那既是老師的直覺（先交的先批），
  --    也天生是分散的。最後用 id 收尾，讓順序在任何情況下都唯一。
  SELECT a.* INTO v_row
    FROM public.writing_analyses a
    JOIN public.writing_submissions s ON s.id = a.essay_id
   WHERE (a.lease_expires_at IS NULL OR a.lease_expires_at <= now())
     AND (
          (a.status = 'ANALYZED'
             AND coalesce(a.synthesis_status, 'PENDING') IN ('PENDING', 'RUNNING', 'FAILED'))
       OR (a.status IN ('QUEUED', 'ANALYZING'))
     )
   ORDER BY (a.status = 'ANALYZED') DESC,
            s.submitted_at NULLS LAST,
            a.requested_at,
            a.id
   LIMIT 1
   FOR UPDATE OF a SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'claimed', false, 'reason', 'EMPTY',
      'expired', v_expired, 'failed', v_failed
    );
  END IF;

  v_mode  := CASE WHEN v_row.status = 'ANALYZED' THEN 'synthesis' ELSE 'stage1' END;
  v_lease := now() + make_interval(secs => p_lease_seconds);

  UPDATE public.writing_analyses
     SET lease_expires_at = v_lease,
         lease_worker_id  = left(coalesce(p_worker, 'worker'), 100)
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'claimed', true,
    'analysis_id', v_row.id,
    'essay_id', v_row.essay_id,
    'mode', v_mode,
    'attempts', v_row.queue_attempts,
    'lease_expires_at', v_lease,
    'expired', v_expired,
    'failed', v_failed
  );
END;
$$;

COMMENT ON FUNCTION writing_queue_claim IS
  '認領下一個工作單位。concurrency = 1 由 advisory lock + 活租約檢查在資料庫層保證。僅限 service_role。';

REVOKE ALL ON FUNCTION writing_queue_claim(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_queue_claim(TEXT, INTEGER, INTEGER) TO service_role;


/**
 * 放開租約。做完一個單位就呼叫，讓下一次認領立刻能接手，
 * 不必等租約自然到期。
 *
 * 終局的列（COMPLETED / FAILED）什麼都不做：那些列被 trigger 完全凍結，
 * 去 UPDATE 它們只會 raise，而且它們身上殘留的租約不影響任何判斷。
 */
CREATE OR REPLACE FUNCTION writing_queue_release(p_analysis_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE public.writing_analyses
     SET lease_expires_at = NULL,
         lease_worker_id  = NULL
   WHERE id = p_analysis_id
     AND status IN ('QUEUED', 'ANALYZING', 'ANALYZED');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

COMMENT ON FUNCTION writing_queue_release IS
  '放開租約。終局的列不動（它們已被 trigger 凍結，殘留租約也不影響判斷）。僅限 service_role。';

REVOKE ALL ON FUNCTION writing_queue_release(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_queue_release(UUID) TO service_role;


/**
 * worker 版的「取得這篇正在飛行的分析 id」。
 *
 * 與 writing_enqueue_analysis() 的差別是：**這一支永遠不建立新的列**。
 * 佇列裡的列是老師排進去的，worker 只負責推進既有的工作，不自己生工作出來。
 * 找不到就回傳 NULL，worker 會把這一輪當成沒事做。
 */
CREATE OR REPLACE FUNCTION writing_queue_ensure_analysis(p_essay_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT a.id INTO v_id
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id
     AND a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
   ORDER BY a.analysis_version DESC
   LIMIT 1;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION writing_queue_ensure_analysis IS
  'worker 取得某篇正在飛行的分析 id。永遠不建立新列——工作只由老師排入。僅限 service_role。';

REVOKE ALL ON FUNCTION writing_queue_ensure_analysis(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_queue_ensure_analysis(UUID) TO service_role;


/**
 * worker 版的「把綜合層推到 RUNNING」。內容與 writing_retry_synthesis 相同，
 * 只是守門的不是 is_admin() 而是「只有 service_role 拿得到 EXECUTE」。
 *
 * 刻意複製而不是放寬既有那一支：writing_retry_synthesis 現在的語意是
 * 「登入的管理員按下重試」，把 service_role 加進去會讓那句話不再成立，
 * 而它在老師端的按鈕上還在用。
 */
CREATE OR REPLACE FUNCTION writing_queue_begin_synthesis(p_analysis_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.writing_analyses%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.writing_analyses a WHERE a.id = p_analysis_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這筆分析：%', p_analysis_id USING ERRCODE = '22023';
  END IF;

  IF v_row.status <> 'ANALYZED' THEN
    RAISE EXCEPTION '只有四軸已驗證完成（ANALYZED）的分析才能跑綜合層，目前為 %', v_row.status
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_row.synthesis_status, 'PENDING') NOT IN ('FAILED', 'PENDING') THEN
    RAISE EXCEPTION '綜合層目前是 %，不需要重試', v_row.synthesis_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.writing_analyses
     SET synthesis_status = 'RUNNING',
         synthesis_started_at = now(),
         synthesis_attempt_count = synthesis_attempt_count + 1,
         synthesis_error_detail = NULL,
         synthesis_validation_issues = NULL
   WHERE id = p_analysis_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION writing_queue_begin_synthesis IS
  'worker 版的 writing_retry_synthesis：把綜合層推到 RUNNING。僅限 service_role。';

REVOKE ALL ON FUNCTION writing_queue_begin_synthesis(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_queue_begin_synthesis(UUID) TO service_role;


-- =====================================================
-- 老師：佇列概況（徽章數字、批次進度、之後的每日提醒都讀這一支）
-- =====================================================

/**
 * 一次回答老師會問的所有數字。
 *
 * 「待處理」的定義（每日提醒之後也用同一個定義，兩邊不會對不起來）：
 *
 *     writing_submissions.status = 'SUBMITTED'
 *   AND 有 writing_texts（＝正規文字已落地）
 *   AND 沒有 writing_teacher_reviews 那一列
 *
 * 這個定義自動排除了草稿（status）、OCR 還沒成功的圖片作文（圖片作文要
 * 辨識成功才可能變成 SUBMITTED，writing_texts 再擋一層）、不完整的提交，
 * 以及老師已經明確處理完的。
 *
 * by_class 的注意事項：一個學生可能同時在多個班，那篇作文會在每個班各算
 * 一次，所以各班數字相加可能大於 pending_total。這是誠實的呈現方式——
 * 硬挑一個「主要班級」會讓某個班的老師看不到自己班的作文。
 */
CREATE OR REPLACE FUNCTION writing_queue_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_queue_summary：僅限管理員' USING ERRCODE = '42501';
  END IF;

  WITH pending AS (
    SELECT s.id, s.submitted_at, s.student_id, a.status AS analysis_status
      FROM public.writing_submissions s
      LEFT JOIN LATERAL (
        SELECT wa.status
          FROM public.writing_analyses wa
         WHERE wa.essay_id = s.id
         ORDER BY wa.analysis_version DESC
         LIMIT 1
      ) a ON true
     WHERE s.status = 'SUBMITTED'
       AND EXISTS (SELECT 1 FROM public.writing_texts t WHERE t.essay_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM public.writing_teacher_reviews r WHERE r.essay_id = s.id)
  ),
  by_class AS (
    SELECT c.id AS class_id, c.name, count(*)::int AS count
      FROM pending p
      JOIN public.learn_class_members m ON m.student_id = p.student_id
      JOIN public.learn_classes c ON c.id = m.class_id
     WHERE c.status = 'ACTIVE'
     GROUP BY c.id, c.name
  )
  SELECT jsonb_build_object(
    'pending_total', (SELECT count(*) FROM pending),
    'awaiting_analysis', (SELECT count(*) FROM pending
                           WHERE analysis_status IS NULL OR analysis_status = 'FAILED'),
    'queued',    (SELECT count(*) FROM pending WHERE analysis_status = 'QUEUED'),
    'analyzing', (SELECT count(*) FROM pending WHERE analysis_status IN ('ANALYZING', 'ANALYZED')),
    'failed',    (SELECT count(*) FROM pending WHERE analysis_status = 'FAILED'),
    'awaiting_review', (SELECT count(*) FROM pending WHERE analysis_status = 'COMPLETED'),
    'oldest_pending_at', (SELECT min(submitted_at) FROM pending),
    'unclassed', (SELECT count(*) FROM pending p
                   WHERE NOT EXISTS (
                     SELECT 1 FROM public.learn_class_members m
                       JOIN public.learn_classes c ON c.id = m.class_id
                      WHERE m.student_id = p.student_id AND c.status = 'ACTIVE')),
    'by_class', (SELECT coalesce(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.count DESC), '[]'::jsonb)
                   FROM by_class b),
    -- worker 現在有沒有在跑。前端用它決定要不要顯示「處理中」而不是「已停住」。
    -- 與 writing_queue_claim 的忙碌判準一致：看租約，不看 status。
    'worker_busy', EXISTS (
      SELECT 1 FROM public.writing_analyses a
       WHERE a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
         AND a.lease_expires_at IS NOT NULL
         AND a.lease_expires_at > now()),
    -- 還有沒有工作等著被認領。鏈斷掉時這個是 true 而 worker_busy 是 false，
    -- 前端就知道該顯示「繼續處理佇列」。
    'work_waiting', EXISTS (
      SELECT 1 FROM public.writing_analyses a
       WHERE (a.lease_expires_at IS NULL OR a.lease_expires_at <= now())
         AND (a.status IN ('QUEUED', 'ANALYZING')
              OR (a.status = 'ANALYZED'
                  AND coalesce(a.synthesis_status, 'PENDING') IN ('PENDING', 'RUNNING', 'FAILED'))))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_queue_summary IS
  '老師端的佇列概況：待處理總數、各狀態細分、班級分佈、worker 是否在跑、是否有工作等著被認領。待處理 = 已送出 + 有正規文字 + 沒有檢閱紀錄。僅限管理員。';

REVOKE ALL ON FUNCTION writing_queue_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_queue_summary() TO authenticated, service_role;
