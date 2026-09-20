-- writing_queue_summary() 與 writing_pending_digest() 的包裝定義，逐字取自
-- create_writing_pending_digest.sql。測試需要它們，但修正那份不碰它們。

CREATE OR REPLACE FUNCTION writing_queue_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_queue_summary：僅限管理員' USING ERRCODE = '42501';
  END IF;
  RETURN public.writing_pending_summary_internal();
END;
$$;

COMMENT ON FUNCTION writing_queue_summary IS
  '老師端的佇列概況。定義在 writing_pending_summary_internal()，與每日提醒讀的是同一支。僅限管理員。';

REVOKE ALL ON FUNCTION writing_queue_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_queue_summary() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION writing_pending_digest()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.writing_pending_summary_internal();
END;
$$;

COMMENT ON FUNCTION writing_pending_digest IS
  '每日提醒用的待處理摘要。與 writing_queue_summary() 讀同一支定義，數字不會對不起來。僅限 service_role。';

REVOKE ALL ON FUNCTION writing_pending_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_pending_digest() TO service_role;
