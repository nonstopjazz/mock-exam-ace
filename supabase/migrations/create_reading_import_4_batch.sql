-- =====================================================
-- Six-Way Reading 匯入（4／4）：批次 RPC（admin 入口）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_import_3_one.sql 與 create_reading_import_1_batches.sql。
--
-- 這是唯一對外的匯入入口。瀏覽器解析 XLSX、產生 canonical payload、
-- 分批呼叫這一支（每批 25 篇左右）。
--
-- 🛑 一篇失敗不會讓整批回滾。
--
--    機制是 plpgsql 的 BEGIN…EXCEPTION：它會開一個 subtransaction，
--    區塊內 RAISE 只回滾那個 subtransaction。所以第 7 篇壞掉，
--    前 6 篇已經寫進去的東西留著，第 8 篇繼續。
--
--    ⚠️ 這【不是】plpgsql 的預設行為——沒有 EXCEPTION 子句的話，
--       任何錯誤都會讓整個函式呼叫回滾。測試 I7 專門釘住這一條。
--
-- 🛑 回傳【不含正確答案】。每篇只有 passage_id / status / reason。
--
-- 🛑 batch_id 可以跨呼叫累加。瀏覽器第一批不帶 batch_id（建立新批次），
--    之後帶著同一個 id，counts 會累加，最後一批帶 p_final := true 才收尾。
--
-- 回滾：supabase/migrations/create_reading_import_4_batch.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_import_batch(
  p_passages JSONB,
  p_filename TEXT,
  p_batch_id UUID    DEFAULT NULL,
  p_final    BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_batch    UUID;
  v_item     JSONB;
  v_one      JSONB;
  v_results  JSONB := '[]'::jsonb;
  v_imported INT := 0;
  v_skipped  INT := 0;
  v_conflict INT := 0;
  v_failed   INT := 0;
  v_total    INT := 0;
  v_pid      TEXT;
BEGIN
  -- ── 授權。第一件事，在碰任何資料之前 ────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'reading_import_batch：僅限管理員' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_passages) <> 'array' THEN
    RAISE EXCEPTION 'p_passages 必須是陣列' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_filename, '')) = '' THEN
    RAISE EXCEPTION 'p_filename 不可為空（匯入紀錄要留檔名）' USING ERRCODE = '22023';
  END IF;

  -- ── 批次 ────────────────────────────────────────────
  IF p_batch_id IS NULL THEN
    INSERT INTO public.reading_import_batches (filename, admin_id)
    VALUES (btrim(p_filename), v_uid)
    RETURNING id INTO v_batch;
  ELSE
    SELECT id INTO v_batch FROM public.reading_import_batches
     WHERE id = p_batch_id AND admin_id = v_uid AND status = 'IN_PROGRESS';
    IF v_batch IS NULL THEN
      RAISE EXCEPTION '找不到進行中的批次，或它不屬於你' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ── 逐篇。每一篇一個 subtransaction ─────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_passages) LOOP
    v_total := v_total + 1;
    v_pid := coalesce(v_item -> 'passage' ->> 'passage_id', '(缺 passage_id)');

    BEGIN
      v_one := public.reading_import_one_passage(v_item);
    EXCEPTION WHEN OTHERS THEN
      -- 🛑 只回滾這一篇。SQLERRM 是驗證訊息，不含題目內容。
      v_one := jsonb_build_object('passage_id', v_pid, 'status', 'failed',
                                  'reason', left(SQLERRM, 300));
    END;

    CASE v_one ->> 'status'
      WHEN 'imported' THEN v_imported := v_imported + 1;
      WHEN 'skipped'  THEN v_skipped  := v_skipped  + 1;
      WHEN 'conflict' THEN v_conflict := v_conflict + 1;
      ELSE                 v_failed   := v_failed   + 1;
    END CASE;

    v_results := v_results || jsonb_build_array(v_one);
  END LOOP;

  -- ── 累加到批次紀錄 ──────────────────────────────────
  UPDATE public.reading_import_batches
     SET total_count    = total_count    + v_total,
         imported_count = imported_count + v_imported,
         skipped_count  = skipped_count  + v_skipped,
         conflict_count = conflict_count + v_conflict,
         failed_count   = failed_count   + v_failed,
         status       = CASE WHEN p_final THEN 'COMPLETED' ELSE status END,
         completed_at = CASE WHEN p_final THEN now() ELSE completed_at END
   WHERE id = v_batch;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'chunk', jsonb_build_object(
      'total', v_total, 'imported', v_imported, 'skipped', v_skipped,
      'conflict', v_conflict, 'failed', v_failed),
    'batch', (SELECT jsonb_build_object(
                'total', b.total_count, 'imported', b.imported_count,
                'skipped', b.skipped_count, 'conflict', b.conflict_count,
                'failed', b.failed_count, 'status', b.status)
                FROM public.reading_import_batches b WHERE b.id = v_batch),
    'results', v_results);
END;
$$;

COMMENT ON FUNCTION reading_import_batch IS
  '批次匯入 canonical payload。僅限管理員。一篇失敗只回滾那一篇（BEGIN…EXCEPTION 的 subtransaction），其餘繼續。回傳每篇的 imported/skipped/conflict/failed 與原因，🛑 不含正確答案。';

REVOKE ALL ON FUNCTION reading_import_batch(JSONB, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
-- 🛑 給 authenticated 是因為 admin 也是 authenticated；真正的把關是
--    函式第一層的 is_admin()，不是這個 grant。
GRANT EXECUTE ON FUNCTION reading_import_batch(JSONB, TEXT, UUID, BOOLEAN)
  TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                      AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',') AS "設定",
       has_function_privilege('anon', p.oid, 'EXECUTE') AS "anon可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'reading_import%'
 ORDER BY p.proname;
