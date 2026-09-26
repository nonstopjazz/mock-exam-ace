-- =====================================================
-- 閱讀題庫上架（2／2）：改狀態
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_publish_guard_2_trigger.sql。
--
-- 🛑 這支【不自己判斷能不能上架】。它就是去 UPDATE，讓 trigger 擋。
--    自己先檢查一次再 UPDATE，等於把同一條規則寫兩遍；而且前端的
--    「可以上架」是讀清單來的，與真正動手的那一刻之間有時間差——
--    中間題目被刪掉的話，只有 trigger 擋得住。
--
-- 🛑 一篇失敗不影響其他篇：每一篇包在自己的 BEGIN…EXCEPTION 裡。
--    沒有它，282 篇裡有一篇不完整，整批都不會上架。
--
-- 回滾：supabase/migrations/create_reading_admin_publish_2_set.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION reading_admin_set_status(
  p_passage_ids TEXT[],
  p_status      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id      TEXT;
  v_results JSONB := '[]'::jsonb;
  v_ok      INT := 0;
  v_failed  INT := 0;
  v_rows    INT;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'reading_admin_set_status：僅限管理員' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('DRAFT', 'PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION '狀態只能是 DRAFT / PUBLISHED / ARCHIVED（收到 %）',
      coalesce(p_status, 'null') USING ERRCODE = '22023';
  END IF;

  IF p_passage_ids IS NULL OR array_length(p_passage_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('updated', 0, 'failed', 0, 'results', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_passage_ids LOOP
    BEGIN
      UPDATE public.reading_passages
         SET status = p_status
       WHERE passage_id = v_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows = 0 THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object(
          'passage_id', v_id, 'ok', false, 'reason', '找不到這篇文章');
      ELSE
        v_ok := v_ok + 1;
        v_results := v_results || jsonb_build_object(
          'passage_id', v_id, 'ok', true, 'reason', NULL);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- 🛑 這裡接住的幾乎都是 trigger 擋下的「六題不完整」。
      --    原因照實傳回去，不要自己改寫成「上架失敗」——
      --    管理員需要知道缺哪幾個 construct 才知道要補什麼。
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object(
        'passage_id', v_id, 'ok', false, 'reason', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('updated', v_ok, 'failed', v_failed, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION reading_admin_set_status(TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reading_admin_set_status(TEXT[], TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION reading_admin_set_status IS
  '批次改文章狀態。僅限管理員。不自己判斷完整性——交給 trigger 擋，原因照實回傳。一篇失敗不影響其他篇。';

-- ── 驗證（唯讀）───────────────────────────────────────
SELECT p.proname,
       p.prosecdef                                      AS "SECURITY DEFINER",
       array_to_string(p.proconfig, ',')                AS "設定",
       has_function_privilege('anon', p.oid, 'EXECUTE') AS "anon可執行"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'reading_admin_%'
 ORDER BY p.proname;
