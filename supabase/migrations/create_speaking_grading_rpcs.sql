-- =====================================================
-- 口說批改：排入、認領、回報、收件匣
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_speaking_analyses.sql 之後執行。
--
--
-- 一、佇列就是 speaking_analyses 本身
--
--   排入 = 插入一列 QUEUED
--   認領 = 寫入租約（speaking_grading_claim）
--   完成 = speaking_grading_complete / _fail
--
--   沒有第二張表，也沒有第二套狀態。
--
--
-- 二、concurrency = 1 怎麼保證
--
--   與作文同一個模型：advisory lock + 活租約檢查，兩道都在資料庫裡。
--   ⚠️ 判準是【有沒有人握著未過期的租約】，不是 status——認領一列 QUEUED 時
--      status 還是 QUEUED，要等 worker 才推到 ANALYZING。只看 status 的話，
--      那個空窗期會讓第二個 worker 以為沒人在跑。作文那邊的測試抓到過這件事。
--
--   用的 advisory key 是 778812，與作文的 778811 【不同】——
--   兩個佇列各自獨立，口說在跑不該擋住作文。
--
--
-- 三、權限
--
--   speaking_enqueue_grading_batch  老師（資料庫再驗 is_admin）
--   speaking_grading_summary        老師
--   speaking_admin_grading_queue    老師
--   speaking_my_practices           學生（只看得到自己的、只有安全欄位）
--   speaking_grading_claim          service_role only
--   speaking_grading_complete       service_role only
--   speaking_grading_fail           service_role only
--
-- 回滾：supabase/migrations/create_speaking_grading_rpcs.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'speaking_analyses'
  ) THEN
    RAISE EXCEPTION '需要 speaking_analyses，請先套用 create_speaking_analyses.sql';
  END IF;
END;
$$;


-- =====================================================
-- 每日上限
--
-- 與作文同一個理由：一次手滑把整個學期的錄音都排進去，帳單隔天才看得到。
-- 上限寫在函式裡而不是常數表，改上限就是重跑一次這份 SQL 的這一段。
-- =====================================================

-- search_path 釘住：它只回傳一個常數、也不是 SECURITY DEFINER，
-- 技術上不需要。釘它是因為「所有 speaking_% 函式都釘」這條規則有測試在守，
-- 而一個例外會讓下一個人以為可以不釘。
CREATE OR REPLACE FUNCTION speaking_daily_grading_cap()
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 200; $$;

COMMENT ON FUNCTION speaking_daily_grading_cap IS
  '每日可排入的口說批改則數上限。要改就改這一行的數字並重跑。';

REVOKE ALL ON FUNCTION speaking_daily_grading_cap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_daily_grading_cap() TO authenticated, service_role;


/** 今天已經排入幾則。數的是「排入」不是「完成」——失敗的也花了錢。 */
CREATE OR REPLACE FUNCTION speaking_daily_grading_used()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*)::int FROM public.speaking_analyses a
   WHERE a.requested_at >= date_trunc('day', now());
$$;

REVOKE ALL ON FUNCTION speaking_daily_grading_used() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_daily_grading_used() TO authenticated, service_role;


-- =====================================================
-- 老師端：批次排入
-- =====================================================

/**
 * 把一批錄音排進批改佇列。回傳每一則的結果，不是一個總數——
 * 老師勾了 20 則、進去 17 則，他要知道是哪三則沒進去、為什麼。
 *
 * 每一則可能的結果：
 *   QUEUED          排進去了
 *   ALREADY_ACTIVE  已經在佇列裡或正在跑（重複點擊是常態，不該變成錯誤）
 *   NOT_FOUND       找不到這則錄音
 *   NO_FILE         沒有錄音檔（PENDING／FAILED／檔案已過保存期）
 *   DAILY_CAP       今天的額度用完了
 */
CREATE OR REPLACE FUNCTION speaking_enqueue_grading_batch(p_recording_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch UUID := gen_random_uuid();
  v_ids UUID[];
  v_id UUID;
  v_items JSONB := '[]'::jsonb;
  v_outcome TEXT;
  v_queued INTEGER := 0;
  v_cap INTEGER := public.speaking_daily_grading_cap();
  v_used INTEGER := public.speaking_daily_grading_used();
  v_rec public.speaking_recordings%ROWTYPE;
  v_version INTEGER;
BEGIN
  PERFORM public.learn_require_admin('speaking_enqueue_grading_batch');

  -- 去重。⚠️ 這裡【不】用 array_agg(DISTINCT …)：那會順便排序，
  --    回傳的 items 順序就不再是老師勾選的順序。
  SELECT array_agg(x ORDER BY ord) INTO v_ids
    FROM (
      SELECT DISTINCT ON (x) x, ord
        FROM unnest(coalesce(p_recording_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS t(x, ord)
       ORDER BY x, ord
    ) d;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('batch_id', NULL, 'queued', 0, 'items', '[]'::jsonb);
  END IF;
  IF array_length(v_ids, 1) > 50 THEN
    RAISE EXCEPTION '一次最多 50 則' USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_outcome := NULL;

    SELECT * INTO v_rec FROM public.speaking_recordings r WHERE r.id = v_id;
    IF NOT FOUND THEN
      v_outcome := 'NOT_FOUND';
    ELSIF v_rec.storage_path IS NULL OR v_rec.file_deleted_at IS NOT NULL THEN
      -- 沒有檔案就沒有東西可以聽。過了保存期的也一樣。
      v_outcome := 'NO_FILE';
    ELSIF EXISTS (
      SELECT 1 FROM public.speaking_analyses a
       WHERE a.recording_id = v_id AND a.status IN ('QUEUED', 'ANALYZING')
    ) THEN
      v_outcome := 'ALREADY_ACTIVE';
    ELSIF v_used + v_queued >= v_cap THEN
      -- 逐則檢查而不是整批先擋：一批全是 ALREADY_ACTIVE 的不會產生任何一列、
      -- 也不花錢，把它整批拒絕會讓「再按一次看進度」變成錯誤訊息。
      v_outcome := 'DAILY_CAP';
    END IF;

    IF v_outcome IS NULL THEN
      SELECT coalesce(max(a.analysis_version), 0) + 1 INTO v_version
        FROM public.speaking_analyses a WHERE a.recording_id = v_id;

      INSERT INTO public.speaking_analyses
        (recording_id, requested_by, queue_batch_id, analysis_version)
      VALUES (v_id, v_uid, v_batch, v_version);

      v_outcome := 'QUEUED';
      v_queued := v_queued + 1;
    END IF;

    v_items := v_items || jsonb_build_object('recording_id', v_id, 'outcome', v_outcome);
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', CASE WHEN v_queued > 0 THEN v_batch ELSE NULL END,
    'queued', v_queued,
    'daily_cap', v_cap,
    'daily_used', v_used + v_queued,
    'daily_cap_reached', (v_used + v_queued) >= v_cap,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION speaking_enqueue_grading_batch IS
  '把一批錄音排入批改佇列。逐則回報結果。冪等：已在佇列裡的回 ALREADY_ACTIVE，不會產生第二列。僅限管理員。';

REVOKE ALL ON FUNCTION speaking_enqueue_grading_batch(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_enqueue_grading_batch(UUID[]) TO authenticated, service_role;


-- =====================================================
-- worker：認領 / 完成 / 失敗
-- =====================================================

/**
 * 認領一件工作。回傳 claimed=false 與 BUSY／EMPTY，或一件工作的全部資料。
 *
 * 回傳裡直接帶 storage_path 與題目文字，worker 就不必再查一次表——
 * 它拿到的是 service_role 的連線，少一次往返也少一個出錯的地方。
 */
CREATE OR REPLACE FUNCTION speaking_grading_claim(
  p_worker TEXT,
  p_lease_seconds INTEGER DEFAULT 150,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_expired INTEGER := 0;
  v_failed  INTEGER := 0;
  v_row public.speaking_analyses%ROWTYPE;
  v_rec public.speaking_recordings%ROWTYPE;
  v_lease TIMESTAMPTZ;
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION '租約長度必須在 30–900 秒之間' USING ERRCODE = '22023';
  END IF;

  -- 互斥。778812 —— 與作文的 778811 不同，兩個佇列互不阻擋。
  PERFORM pg_advisory_xact_lock(778812);

  -- 租約過期且次數用完 → 收成 FAILED
  UPDATE public.speaking_analyses a
     SET status = 'FAILED',
         failed_at = now(),
         error_detail = coalesce(a.error_detail,
           '批改多次未在租約內回報（可能被平台中斷），已停止自動重試。可按「重試失敗項目」重新排入。'),
         lease_expires_at = NULL, lease_worker_id = NULL
   WHERE a.status IN ('QUEUED', 'ANALYZING')
     AND a.lease_expires_at IS NOT NULL
     AND a.lease_expires_at <= now()
     AND a.queue_attempts >= p_max_attempts;
  GET DIAGNOSTICS v_failed = ROW_COUNT;

  -- 租約過期但還有次數 → 放回佇列
  UPDATE public.speaking_analyses a
     SET lease_expires_at = NULL, lease_worker_id = NULL,
         queue_attempts = a.queue_attempts + 1
   WHERE a.status IN ('QUEUED', 'ANALYZING')
     AND a.lease_expires_at IS NOT NULL
     AND a.lease_expires_at <= now();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- 還有人握著活租約就不認領
  IF EXISTS (
    SELECT 1 FROM public.speaking_analyses a
     WHERE a.status IN ('QUEUED', 'ANALYZING')
       AND a.lease_expires_at IS NOT NULL
       AND a.lease_expires_at > now()
  ) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'BUSY',
                              'expired', v_expired, 'failed', v_failed);
  END IF;

  -- 挑一件。先錄的先改。
  --
  -- ⚠️ 排序【不能】只靠 requested_at：一次批次排入的每一列都拿到同一個
  --    now()，全部並列，於是實際順序由 id（隨機 UUID）決定。老師勾 20 則
  --    按下去，處理順序就變成擲骰子——第一個完成的不是最早錄的那一則，
  --    而且同樣的操作每次結果都不一樣。
  --    用錄音的 uploaded_at 打破平手，順序才說得出道理。
  --    （作文那邊的 writing_queue_claim 有同一條，用 submitted_at。）
  SELECT a.* INTO v_row
    FROM public.speaking_analyses a
    JOIN public.speaking_recordings r ON r.id = a.recording_id
   WHERE a.status IN ('QUEUED', 'ANALYZING')
     AND a.lease_expires_at IS NULL
   ORDER BY r.uploaded_at NULLS LAST, a.requested_at, a.id
   LIMIT 1
   FOR UPDATE OF a SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'EMPTY',
                              'expired', v_expired, 'failed', v_failed);
  END IF;

  SELECT * INTO v_rec FROM public.speaking_recordings r WHERE r.id = v_row.recording_id;

  -- 檔案在排入之後才被清理掉的情形。認領當下才發現，直接收成 FAILED，
  -- 不要送一個沒有音訊的請求出去。
  IF v_rec.storage_path IS NULL OR v_rec.file_deleted_at IS NOT NULL THEN
    UPDATE public.speaking_analyses
       SET status = 'FAILED', failed_at = now(),
           error_detail = '錄音檔已不存在（可能已超過保存期限），無法批改。'
     WHERE id = v_row.id;
    RETURN jsonb_build_object('claimed', false, 'reason', 'EMPTY',
                              'expired', v_expired, 'failed', v_failed + 1);
  END IF;

  v_lease := now() + make_interval(secs => p_lease_seconds);

  UPDATE public.speaking_analyses
     SET status = 'ANALYZING',
         started_at = coalesce(started_at, now()),
         lease_expires_at = v_lease,
         lease_worker_id = left(coalesce(p_worker, 'worker'), 100)
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'claimed', true,
    'analysis_id', v_row.id,
    'recording_id', v_row.recording_id,
    'attempts', v_row.queue_attempts,
    'storage_path', v_rec.storage_path,
    'mime_type', v_rec.mime_type,
    'prompt_part', v_rec.prompt_part,
    'prompt_text', v_rec.prompt_text,
    'duration_seconds', v_rec.duration_seconds,
    'expired', v_expired, 'failed', v_failed
  );
END;
$$;

COMMENT ON FUNCTION speaking_grading_claim IS
  '認領一件口說批改。advisory lock + 活租約檢查保證 concurrency = 1。僅限 service_role。';

REVOKE ALL ON FUNCTION speaking_grading_claim(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION speaking_grading_claim(TEXT, INTEGER, INTEGER) TO service_role;


/**
 * 寫入批改結果並收工。
 *
 * 分數的範圍與步進由表上的 CHECK 把關，這裡不重複驗——
 * 驗兩次遲早會有一邊漏掉，而資料庫那一份是繞不過去的那一份。
 *
 * 順便把錄音推到 GRADED。那個值在 create_speaking_recordings.sql 就留好了。
 */
CREATE OR REPLACE FUNCTION speaking_grading_complete(
  p_analysis_id UUID,
  p_transcript TEXT,
  p_fluency NUMERIC,
  p_lexical NUMERIC,
  p_grammar NUMERIC,
  p_pronunciation NUMERIC,
  p_overall NUMERIC,
  p_feedback TEXT,
  p_suggestions TEXT,
  p_model TEXT,
  p_telemetry JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_recording UUID;
BEGIN
  UPDATE public.speaking_analyses
     SET status = 'COMPLETED',
         completed_at = now(),
         transcript = p_transcript,
         fluency_score = p_fluency,
         lexical_score = p_lexical,
         grammar_score = p_grammar,
         pronunciation_score = p_pronunciation,
         overall_band = p_overall,
         feedback = p_feedback,
         suggestions = p_suggestions,
         model = p_model,
         telemetry = p_telemetry,
         error_detail = NULL,
         lease_expires_at = NULL,
         lease_worker_id = NULL
   WHERE id = p_analysis_id
     AND status IN ('QUEUED', 'ANALYZING')
   RETURNING recording_id INTO v_recording;

  IF v_recording IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.speaking_recordings SET status = 'GRADED'
   WHERE id = v_recording AND status = 'UPLOADED';

  RETURN true;
END;
$$;

COMMENT ON FUNCTION speaking_grading_complete IS
  '寫入批改結果並把錄音推到 GRADED。分數的合法性由表上的 CHECK 把關。僅限 service_role。';

REVOKE ALL ON FUNCTION speaking_grading_complete(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION speaking_grading_complete(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB)
  TO service_role;


/**
 * 標記失敗。p_retryable = true 表示放回佇列再試（次數 +1），
 * false 表示這件事重試也不會好（例如模型回了不合法的分數）。
 */
CREATE OR REPLACE FUNCTION speaking_grading_fail(
  p_analysis_id UUID,
  p_detail TEXT,
  p_retryable BOOLEAN DEFAULT false,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_attempts INTEGER;
  v_n INTEGER;
BEGIN
  SELECT queue_attempts INTO v_attempts
    FROM public.speaking_analyses WHERE id = p_analysis_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF coalesce(p_retryable, false) AND v_attempts + 1 < p_max_attempts THEN
    UPDATE public.speaking_analyses
       SET status = 'QUEUED',
           queue_attempts = queue_attempts + 1,
           error_detail = left(coalesce(p_detail, '批改失敗'), 500),
           lease_expires_at = NULL, lease_worker_id = NULL
     WHERE id = p_analysis_id;
  ELSE
    UPDATE public.speaking_analyses
       SET status = 'FAILED',
           failed_at = now(),
           error_detail = left(coalesce(p_detail, '批改失敗'), 500),
           lease_expires_at = NULL, lease_worker_id = NULL
     WHERE id = p_analysis_id;
  END IF;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

COMMENT ON FUNCTION speaking_grading_fail IS
  '標記一件批改失敗。p_retryable 且還有次數就放回佇列，否則收成 FAILED。僅限 service_role。';

REVOKE ALL ON FUNCTION speaking_grading_fail(UUID, TEXT, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION speaking_grading_fail(UUID, TEXT, BOOLEAN, INTEGER) TO service_role;


-- =====================================================
-- 老師端：佇列摘要與收件匣
-- =====================================================

/**
 * 佇列現況。徽章、收件匣、「繼續處理佇列」按鈕共用這一個定義——
 * 三個地方各自算一次，遲早會出現徽章說 3 件、收件匣只列 2 件。
 *
 * work_waiting = 有工作在等，但沒有人握著活租約。
 * 這正是「鏈斷掉了」的樣子（平台把某一次呼叫砍掉），畫面上要出現那顆按鈕。
 */
CREATE OR REPLACE FUNCTION speaking_grading_summary()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_busy BOOLEAN;
  v_queued INTEGER;
  v_failed INTEGER;
  v_ungraded INTEGER;
BEGIN
  PERFORM public.learn_require_admin('speaking_grading_summary');

  SELECT EXISTS (
    SELECT 1 FROM public.speaking_analyses a
     WHERE a.status IN ('QUEUED', 'ANALYZING')
       AND a.lease_expires_at IS NOT NULL AND a.lease_expires_at > now()
  ) INTO v_busy;

  SELECT count(*)::int INTO v_queued
    FROM public.speaking_analyses a WHERE a.status IN ('QUEUED', 'ANALYZING');

  SELECT count(*)::int INTO v_failed
    FROM public.speaking_analyses a WHERE a.status = 'FAILED';

  -- 有錄音檔、還沒有任何完成的批改、也不在佇列裡的
  SELECT count(*)::int INTO v_ungraded
    FROM public.speaking_recordings r
   WHERE r.storage_path IS NOT NULL
     AND r.file_deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.speaking_analyses a
        WHERE a.recording_id = r.id AND a.status IN ('QUEUED', 'ANALYZING', 'COMPLETED')
     );

  RETURN jsonb_build_object(
    'in_queue', v_queued,
    'failed', v_failed,
    'ungraded', v_ungraded,
    'worker_busy', v_busy,
    'work_waiting', (v_queued > 0 AND NOT v_busy),
    'daily_cap', public.speaking_daily_grading_cap(),
    'daily_used', public.speaking_daily_grading_used()
  );
END;
$$;

COMMENT ON FUNCTION speaking_grading_summary IS
  '口說批改佇列的現況。徽章、收件匣、「繼續處理佇列」按鈕的唯一定義。僅限管理員。';

REVOKE ALL ON FUNCTION speaking_grading_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_grading_summary() TO authenticated, service_role;


/**
 * 收件匣：可以批改的錄音，附上目前的批改狀態。
 *
 * p_state 篩選：
 *   'ungraded'  還沒批改過（預設）
 *   'queued'    在佇列裡或正在跑
 *   'failed'    批改失敗
 *   'completed' 已完成
 *   'all'       全部
 *
 * 🛑 只列出【還有檔案】的。檔案過了保存期就沒有東西可以聽，
 *    讓它出現在可勾選的清單裡只會產生一次注定失敗的呼叫。
 */
CREATE OR REPLACE FUNCTION speaking_admin_grading_queue(
  p_state TEXT DEFAULT 'ungraded',
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.learn_require_admin('speaking_admin_grading_queue');

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.uploaded_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT r.id                         AS recording_id,
             r.student_id,
             public.learn_display_name(r.student_id) AS student_name,
             r.prompt_part,
             r.prompt_text,
             r.duration_seconds,
             r.uploaded_at,
             a.id           AS analysis_id,
             a.status       AS analysis_status,
             a.overall_band,
             a.error_detail,
             a.queue_attempts,
             a.completed_at
        FROM public.speaking_recordings r
        -- 每則錄音只看【最新】的那一次批改。重新批改會產生新的一列，
        -- 舊的留著當紀錄，但收件匣上只該有一個狀態。
        LEFT JOIN LATERAL (
          SELECT * FROM public.speaking_analyses an
           WHERE an.recording_id = r.id
           ORDER BY an.analysis_version DESC, an.created_at DESC
           LIMIT 1
        ) a ON true
       WHERE r.storage_path IS NOT NULL
         AND r.file_deleted_at IS NULL
         AND (
           p_state = 'all'
           OR (p_state = 'ungraded'  AND (a.id IS NULL OR a.status = 'FAILED'))
           OR (p_state = 'queued'    AND a.status IN ('QUEUED', 'ANALYZING'))
           OR (p_state = 'failed'    AND a.status = 'FAILED')
           OR (p_state = 'completed' AND a.status = 'COMPLETED')
         )
       ORDER BY r.uploaded_at DESC
       LIMIT greatest(coalesce(p_limit, 100), 1)
    ) x;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION speaking_admin_grading_queue IS
  '口說批改收件匣。每則錄音只顯示最新一次批改的狀態。只列出還有檔案的。僅限管理員。';

REVOKE ALL ON FUNCTION speaking_admin_grading_queue(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_admin_grading_queue(TEXT, INTEGER) TO authenticated, service_role;


-- =====================================================
-- 學生端：我的練習（含批改結果）
-- =====================================================

/**
 * 我練過的，以及每一則的批改結果。
 *
 * 🛑 學生【不】直接讀 speaking_analyses。這支函式明確列出要給的欄位，
 *    所以 error_detail、lease_worker_id、telemetry 這些永遠到不了畫面上。
 *    RLS 是列層級的，擋不住欄位——要遮欄位就得走函式。
 *
 * 批改中的狀態要讓學生看得到（老師已經送出了），但失敗的原因不給——
 * 那是給老師排查的，對學生只會變成一句看不懂的技術訊息。
 */
CREATE OR REPLACE FUNCTION speaking_my_practices(p_limit INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT r.id, r.prompt_id, r.prompt_part, r.prompt_text,
             r.storage_path, r.mime_type, r.file_bytes, r.duration_seconds,
             r.uploaded_at, r.file_deleted_at, r.status, r.error_detail,
             r.created_at,
             -- 批改：只有「進行中」與「完成」兩種對學生有意義。
             -- FAILED 對學生顯示成「還沒批改」——老師會在收件匣看到它並重試。
             CASE
               WHEN a.status IN ('QUEUED', 'ANALYZING') THEN 'GRADING'
               WHEN a.status = 'COMPLETED' THEN 'GRADED'
               ELSE NULL
             END AS grading_state,
             CASE WHEN a.status = 'COMPLETED' THEN a.transcript          END AS transcript,
             CASE WHEN a.status = 'COMPLETED' THEN a.fluency_score       END AS fluency_score,
             CASE WHEN a.status = 'COMPLETED' THEN a.lexical_score       END AS lexical_score,
             CASE WHEN a.status = 'COMPLETED' THEN a.grammar_score       END AS grammar_score,
             CASE WHEN a.status = 'COMPLETED' THEN a.pronunciation_score END AS pronunciation_score,
             CASE WHEN a.status = 'COMPLETED' THEN a.overall_band        END AS overall_band,
             CASE WHEN a.status = 'COMPLETED' THEN a.feedback            END AS feedback,
             CASE WHEN a.status = 'COMPLETED' THEN a.suggestions         END AS suggestions,
             CASE WHEN a.status = 'COMPLETED' THEN a.completed_at        END AS graded_at
        FROM public.speaking_recordings r
        LEFT JOIN LATERAL (
          SELECT * FROM public.speaking_analyses an
           WHERE an.recording_id = r.id
           ORDER BY an.analysis_version DESC, an.created_at DESC
           LIMIT 1
        ) a ON true
       WHERE r.student_id = v_uid
       ORDER BY r.created_at DESC
       LIMIT greatest(coalesce(p_limit, 30), 1)
    ) x;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION speaking_my_practices IS
  '我的口說練習與批改結果。明確列出可給學生的欄位——error_detail／telemetry 永遠不會出現在這裡。';

REVOKE ALL ON FUNCTION speaking_my_practices(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_my_practices(INTEGER) TO authenticated, service_role;
