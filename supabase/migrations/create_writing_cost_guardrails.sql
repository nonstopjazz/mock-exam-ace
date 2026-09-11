-- =====================================================
-- DeepSeek 成本護欄：事前估算（A）＋ 每日上限（B）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_queue_rpcs.sql 之後執行（會取代 writing_enqueue_analysis_batch）。
--
--
-- 為什麼要兩道，而不是只做一道
--
--   A 事前估算  擋的是【誤判】：老師不知道「50 篇」換算成錢是多少。
--               它出現在「一鍵＝花錢」的那個瞬間，把抽象的篇數換成具體的量。
--               但它是前端的東西，可以被繞過。
--
--   B 每日上限  擋的是【bug 與手滑】：某個迴圈重複排入、或是連按了十次。
--               它在資料庫裡，繞不過去。
--
--   兩者防的不是同一件事，所以兩者都要。
--
--
-- 估算為什麼建立在 telemetry 上，而不是我寫死的常數
--
--   writing_analyses.stage1_telemetry / synthesis_telemetry 從一開始就在記
--   每一次 DeepSeek 呼叫的實際 token 數（promptTokens / completionTokens）。
--   拿真實資料算，才會隨著 prompt 改版、作文長度、重試率自動跟上。
--
--   單價【不】寫在這裡。這支函式只回傳量測到的 token 與呼叫次數；
--   要換算成錢由呼叫端乘上單價（Vercel 的環境變數，見 docs/learn/writing-queue.md）。
--   把單價寫進資料庫，等 DeepSeek 調價那天，這個估算會安靜地開始說謊。
--
-- 回滾：supabase/migrations/create_writing_cost_guardrails.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'writing_enqueue_analysis_batch'
  ) THEN
    RAISE EXCEPTION '需要 writing_enqueue_analysis_batch()，請先套用 create_writing_queue_rpcs.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'learn_today'
  ) THEN
    RAISE EXCEPTION '需要 learn_today()，請先套用 create_learn_classes_tasks.sql';
  END IF;
END;
$$;


-- =====================================================
-- 逐篇的實際用量（給估算與稽核共用）
-- =====================================================

/**
 * 把一筆分析的 telemetry 攤平成「幾次呼叫、多少 token」。
 *
 * 形狀提醒（兩者不同，不要寫成同一套）：
 *   stage1_telemetry      是【物件】，key 是 pass 名稱，value 是 PassTelemetry
 *   synthesis_telemetry   是【單一】 PassTelemetry
 *   兩者的 records[] 才是逐次嘗試，token 記在那一層。
 *
 * token 欄位是 optional 的（DeepSeek 沒回 usage 時就沒有），所以一律 coalesce 成 0，
 * 而 calls 用 records 的筆數算——那個永遠有值。
 */
CREATE OR REPLACE FUNCTION writing_analysis_usage(p_analysis_id UUID)
RETURNS TABLE (calls INTEGER, prompt_tokens BIGINT, completion_tokens BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH records AS (
    SELECT r
      FROM public.writing_analyses a,
           LATERAL jsonb_each(coalesce(a.stage1_telemetry, '{}'::jsonb)) AS pass(key, value),
           LATERAL jsonb_array_elements(coalesce(pass.value->'records', '[]'::jsonb)) AS r
     WHERE a.id = p_analysis_id
    UNION ALL
    SELECT r
      FROM public.writing_analyses a,
           LATERAL jsonb_array_elements(coalesce(a.synthesis_telemetry->'records', '[]'::jsonb)) AS r
     WHERE a.id = p_analysis_id
  )
  SELECT count(*)::int,
         coalesce(sum((r->>'promptTokens')::bigint), 0),
         coalesce(sum((r->>'completionTokens')::bigint), 0)
    FROM records;
$$;

COMMENT ON FUNCTION writing_analysis_usage IS
  '單筆分析實際用掉的 DeepSeek 呼叫次數與 token。資料來自 telemetry，不是估的。';

REVOKE ALL ON FUNCTION writing_analysis_usage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_analysis_usage(UUID) TO authenticated, service_role;


-- =====================================================
-- A：事前估算
-- =====================================================

/**
 * 「排 N 篇大概是多少」。
 *
 * 取最近 p_sample 筆【已完成】分析的實際用量，用中位數（不是平均——一篇重試很多次
 * 的離群值會把平均拉歪）乘上 N。
 *
 * 回傳：
 *   sample_size        估算依據了幾篇。0 代表還沒有資料
 *   per_essay_calls    每篇的 DeepSeek 呼叫次數中位數
 *   per_essay_prompt_tokens / per_essay_completion_tokens
 *   projected_*        乘上 p_count 之後的總量
 *   daily_used / daily_cap / daily_remaining   今天的額度狀況（與 B 同一個判準）
 *
 * ⚠️ 不回傳金額。單價由呼叫端提供——見檔頭的說明。
 */
CREATE OR REPLACE FUNCTION writing_analysis_cost_estimate(
  p_count INTEGER DEFAULT 1,
  p_sample INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n INTEGER := greatest(coalesce(p_count, 1), 0);
  v_calls NUMERIC;
  v_prompt NUMERIC;
  v_completion NUMERIC;
  v_sample_size INTEGER;
  v_used INTEGER;
  v_cap INTEGER := public.writing_daily_analysis_cap();
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_analysis_cost_estimate：僅限管理員' USING ERRCODE = '42501';
  END IF;

  WITH recent AS (
    SELECT a.id
      FROM public.writing_analyses a
     WHERE a.status = 'COMPLETED'
       AND a.stage1_telemetry IS NOT NULL
     ORDER BY a.completed_at DESC NULLS LAST
     LIMIT greatest(coalesce(p_sample, 20), 1)
  ),
  usage AS (
    SELECT u.calls, u.prompt_tokens, u.completion_tokens
      FROM recent r, LATERAL public.writing_analysis_usage(r.id) u
     WHERE u.calls > 0
  )
  SELECT count(*)::int,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY calls),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY prompt_tokens),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY completion_tokens)
    INTO v_sample_size, v_calls, v_prompt, v_completion
    FROM usage;

  v_used := public.writing_daily_analysis_used();

  RETURN jsonb_build_object(
    'requested', v_n,
    'sample_size', coalesce(v_sample_size, 0),
    'per_essay_calls', round(coalesce(v_calls, 0)),
    'per_essay_prompt_tokens', round(coalesce(v_prompt, 0)),
    'per_essay_completion_tokens', round(coalesce(v_completion, 0)),
    'projected_calls', round(coalesce(v_calls, 0) * v_n),
    'projected_prompt_tokens', round(coalesce(v_prompt, 0) * v_n),
    'projected_completion_tokens', round(coalesce(v_completion, 0) * v_n),
    'daily_used', v_used,
    'daily_cap', v_cap,
    'daily_remaining', greatest(v_cap - v_used, 0),
    'would_exceed_daily_cap', (v_used + v_n) > v_cap
  );
END;
$$;

COMMENT ON FUNCTION writing_analysis_cost_estimate IS
  '排 N 篇的預估用量，依據最近已完成分析的實際 telemetry 中位數。不回傳金額——單價由呼叫端提供。僅限管理員。';

REVOKE ALL ON FUNCTION writing_analysis_cost_estimate(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_analysis_cost_estimate(INTEGER, INTEGER) TO authenticated, service_role;


-- =====================================================
-- B：每日上限
-- =====================================================

/**
 * 一天最多排入幾篇分析。
 *
 * 🛑 這是花錢的上界。要改它請改這支函式並重新套用（一行 CREATE OR REPLACE）——
 *    刻意【不】做成可以從前端或參數傳進來的東西：能被呼叫端調整的上限，
 *    在真正需要它的那一天（某個迴圈失控時）就不是上限了。
 *
 * 150 篇的由來：擁有者預期的尖峰約 50–60 篇／天，這裡取約 2.5 倍，
 * 讓正常的忙碌日不會被擋，但擋得住失控。
 */
CREATE OR REPLACE FUNCTION writing_daily_analysis_cap()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 150; $$;

COMMENT ON FUNCTION writing_daily_analysis_cap IS
  '每日可排入的分析篇數上界（花錢的上界）。要改請改這支函式，不接受呼叫端傳入。';

REVOKE ALL ON FUNCTION writing_daily_analysis_cap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_daily_analysis_cap() TO authenticated, service_role;


/**
 * 今天已經排入幾篇。
 *
 * 「今天」是台灣時間（learn_today()），不是 UTC —— 老師在晚上 9 點排的那一批，
 * 應該算在他心裡的那一天。
 *
 * 算的是【建立的分析列數】，不分是第一次還是重新分析：重跑一篇花的錢和第一次一樣。
 */
CREATE OR REPLACE FUNCTION writing_daily_analysis_used()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::int
    FROM public.writing_analyses a
   WHERE (a.requested_at AT TIME ZONE 'Asia/Taipei')::date = public.learn_today();
$$;

COMMENT ON FUNCTION writing_daily_analysis_used IS
  '今天（台灣時間）已建立的分析列數。重新分析也算——它花的錢與第一次相同。';

REVOKE ALL ON FUNCTION writing_daily_analysis_used() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_daily_analysis_used() TO authenticated, service_role;


-- =====================================================
-- 把上限接進批次排入
-- =====================================================

/**
 * 與 create_writing_queue_rpcs.sql 的版本相同，只多了每日上限那一段。
 *
 * 上限檢查排在【去重與單批上限之後、實際排入之前】：
 * 這樣「今天還剩幾篇」算的是真的會被建立的數量，不會把重複選取的那幾篇算進去。
 *
 * 🛑 只計算會真正新建列的那幾篇（ENQUEUED）。已經在佇列裡的（ALREADY_ACTIVE）
 *    與已完成被跳過的（SKIPPED_COMPLETED）不花錢，不該佔用額度。
 *    所以檢查是逐篇在迴圈裡做的，不是一開始拿 array_length 判斷。
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
  v_cap INTEGER := public.writing_daily_analysis_cap();
  v_used INTEGER := public.writing_daily_analysis_used();
  v_capped INTEGER := 0;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_enqueue_analysis_batch：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids
    FROM unnest(coalesce(p_essay_ids, ARRAY[]::UUID[])) AS x
   WHERE x IS NOT NULL;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION '沒有選取任何作文' USING ERRCODE = '22023';
  END IF;

  IF array_length(v_ids, 1) > 50 THEN
    RAISE EXCEPTION '一次最多排入 50 篇，這次是 % 篇', array_length(v_ids, 1)
      USING ERRCODE = '22023';
  END IF;

  -- ⚠️ 額度滿了【不】在這裡整批 raise。
  --
  -- 一批裡可能有已經在佇列中的作文（ALREADY_ACTIVE）或已完成被跳過的
  -- （SKIPPED_COMPLETED）——那些不會新建任何列，也就不花任何新的錢。
  -- 整批擋掉會讓「老師重新點一下看看進度」這種無害的操作也失敗。
  --
  -- 所以判斷一律逐篇做（見下面迴圈的 DAILY_CAP 分支），
  -- 回傳裡的 capped 與 daily_cap_reached 讓前端說得出「哪幾篇沒排到、為什麼」。

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
        v_analysis := v_latest.id;
        UPDATE public.writing_analyses
           SET queue_batch_id = v_batch
         WHERE id = v_analysis;
        v_outcome := 'ALREADY_ACTIVE';
      ELSIF v_used + v_enqueued >= v_cap THEN
        -- 這一批排到一半就把今天的額度用完了。已經排進去的留著，
        -- 剩下的明確回報 DAILY_CAP，讓老師知道是哪幾篇沒排到。
        v_outcome := 'DAILY_CAP';
        v_capped := v_capped + 1;
      ELSE
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
    'capped', v_capped,
    'daily_used', v_used + v_enqueued,
    'daily_cap', v_cap,
    'daily_cap_reached', (v_used + v_enqueued) >= v_cap,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION writing_enqueue_analysis_batch IS
  '一次排入多篇分析，共用一個 batch id。逐篇冪等；已完成的預設跳過；受每日上限（writing_daily_analysis_cap）約束，超過的回報 DAILY_CAP。僅限管理員。';

REVOKE ALL ON FUNCTION writing_enqueue_analysis_batch(UUID[], BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_enqueue_analysis_batch(UUID[], BOOLEAN) TO authenticated, service_role;
