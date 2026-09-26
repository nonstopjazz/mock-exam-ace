-- =====================================================
-- Six-Way Reading（5b／7）：上架閘門的 trigger
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_reading_publish_guard.sql。
--
-- 拆成兩個檔案的理由：2026-09-24 有一支兩函式的 migration 在
-- Supabase SQL Editor 整份執行失敗、分段成功（原因未查明，見
-- docs/writing/2026-09-24-essay-topic-and-corrections.md §5）。先避開。
-- =====================================================

CREATE OR REPLACE FUNCTION reading_guard_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v JSONB;
BEGIN
  -- 只在「變成 PUBLISHED」時檢查。改標題、改分數都不受影響。
  IF NEW.status = 'PUBLISHED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PUBLISHED') THEN

    v := public.reading_publish_readiness(NEW.passage_id);

    IF NOT (v ->> 'ready')::boolean THEN
      RAISE EXCEPTION
        '% 還不能上架：缺少 %（六個 construct 各要一題，且題幹、四個選項、解說都不能空）',
        NEW.passage_id, v ->> 'missing'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION reading_guard_publish IS
  '擋住不完整的文章上架。刻意放在資料庫層——匯入時檢查只擋得住匯入那一條路，後台按鈕與手動 UPDATE 都繞得過去。';

DROP TRIGGER IF EXISTS reading_passages_publish_guard ON reading_passages;
CREATE TRIGGER reading_passages_publish_guard
  BEFORE INSERT OR UPDATE OF status ON reading_passages
  FOR EACH ROW EXECUTE FUNCTION reading_guard_publish();


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT t.tgname AS "trigger", c.relname AS "表", t.tgenabled AS "啟用狀態"
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal AND c.relname = 'reading_passages';
