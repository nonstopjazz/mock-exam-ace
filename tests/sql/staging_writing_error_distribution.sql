-- =====================================================
-- 任一次分析的錯誤類別分布（唯讀）
--
-- staging_writing_failure_probe.sql 只看【最近一次】分析。要跟前幾次比較
-- 掃描廣度時，得能指定版本——這一份就是為此存在。
--
-- ⚠️ 完全唯讀。
--
-- 用法：改下面的 v_essay 與 v_version。
--   v_version = NULL 代表最近一次。
--
-- 為什麼比較的是「有 finding 的類別數」而不是總筆數：
-- 總筆數分不出「16 類都掃過、每類找到一點」與「只在少數幾類裡挖很深」。
-- 掃描指令要驗證的是前者，所以類別數才是主要指標。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS ed (seq SERIAL, item TEXT, value TEXT);
TRUNCATE ed;

DO $dist$
DECLARE
  v_essay   UUID    := '40254a8a-d643-43ae-909b-9a20b00566cd';  -- ← 要看的作文
  v_version INTEGER := NULL;                                     -- ← NULL = 最近一次
  a         public.writing_analyses%ROWTYPE;
  v_rec     RECORD;
BEGIN
  SELECT * INTO a FROM public.writing_analyses x
   WHERE x.essay_id = v_essay
     AND (v_version IS NULL OR x.analysis_version = v_version)
   ORDER BY x.analysis_version DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO ed (item, value) VALUES ('狀態', '找不到這一筆分析');
    RETURN;
  END IF;

  INSERT INTO ed (item, value) VALUES
    ('analysis_id', a.id::text || '　v' || a.analysis_version),
    ('status', a.status || '　' || coalesce(a.synthesis_status, '')),
    ('requested_at', a.requested_at::text);

  IF a.error_analysis IS NULL THEN
    INSERT INTO ed (item, value) VALUES ('錯誤軸', '這一筆沒有錯誤軸資料（Stage 1 未完成）');
    RETURN;
  END IF;

  INSERT INTO ed (item, value) VALUES
    ('findings 總筆數', jsonb_array_length(a.error_analysis -> 'findings')::text),
    ('coverage 來源', coalesce(a.error_analysis ->> 'coverage_source', '（舊列，模型提供）')),
    ('有 finding 的類別數',
      (SELECT count(*)::text FROM jsonb_array_elements(a.error_analysis -> 'coverage') x
        WHERE (x.value ->> 'count')::int > 0) || ' / '
      || jsonb_array_length(a.error_analysis -> 'coverage') || '　← 掃描廣度的主要指標');

  FOR v_rec IN
    SELECT value ->> 'code' AS code, (value ->> 'count')::int AS n
      FROM jsonb_array_elements(a.error_analysis -> 'coverage')
     ORDER BY (value ->> 'count')::int DESC, value ->> 'code'
  LOOP
    INSERT INTO ed (item, value) VALUES (
      '  ' || v_rec.code,
      CASE WHEN v_rec.n = 0 THEN '0（本篇未偵測到此類，不代表已精熟）'
           ELSE v_rec.n || ' 筆　' || repeat('▪', least(v_rec.n, 20)) END);
  END LOOP;
END;
$dist$;

SELECT item, value FROM ed ORDER BY seq;
