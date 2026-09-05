-- =====================================================
-- 單筆失敗分析的診斷查詢（唯讀）
--
-- 用途：一次分析回了 502，要判斷 502 是哪一種失敗造成的。
-- 在 Supabase SQL Editor 執行，輸出一張 項目 / 內容 的表，全部貼回來即可。
--
-- ⚠️ 完全唯讀。沒有任何 INSERT / UPDATE / DELETE / ALTER。
--
-- 預設取「最近一次的分析」。要指定某一篇作文，把 v_essay 那一行的
-- NULL 換成該篇的 essay_id（UUID）。
--
-- 這份查詢最重要的一欄是「判讀」：它把 502 分成三種互斥的成因，
-- 依據是 validation_issues / synthesis_validation_issues 的長度——
--   • 空陣列 []  = 呼叫本身失敗（逾時中斷、HTTP 非 2xx、回傳不是合法 JSON）
--   • 非空       = 結構化輸出驗證失敗，陣列內容就是缺漏清單
--   • NULL       = 這一段根本沒跑到
-- 這個區分寫在 api/_lib/deepseek.ts 的 PassFailure.issues 上，不是這裡的猜測。
--
-- 相容性：analyzed_at 是後來才加的欄位（步驟 1b）。這份查詢用 to_jsonb() 取值，
-- 所以還沒跑步驟 1b 的資料庫也能執行，不會因為缺欄位而報錯。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS d (seq SERIAL, item TEXT, value TEXT);
TRUNCATE d;

DO $probe$
DECLARE
  v_essay UUID := NULL;   -- ← 要指定某一篇就把 NULL 換成 essay_id
  a       public.writing_analyses%ROWTYPE;
  j       JSONB;
  v_title TEXT;
  v_stage1_secs NUMERIC;
  v_stage2_secs NUMERIC;
  v_rec   RECORD;
  v_rec2  RECORD;
  v_rec3  RECORD;
  v_n     INTEGER;
  v_outcome TEXT;
BEGIN
  SELECT * INTO a FROM public.writing_analyses x
   WHERE (v_essay IS NULL OR x.essay_id = v_essay)
   ORDER BY x.requested_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO d (item, value) VALUES ('狀態', '找不到任何分析紀錄');
    RETURN;
  END IF;

  j := to_jsonb(a);
  SELECT s.title INTO v_title FROM public.writing_submissions s WHERE s.id = a.essay_id;

  -- Stage 1 的結束時刻，依可得性依序退讓：
  --   analyzed_at            拆成兩次請求之後才有，最準
  --   synthesis_started_at   單次請求時代：Stage 1 一落地就接著跑綜合層，誤差極小
  --   completed_at           兩段都成功時的上界（含綜合層，會高估）
  v_stage1_secs := round(extract(epoch FROM (
                     coalesce((j ->> 'analyzed_at')::timestamptz,
                              a.synthesis_started_at,
                              a.completed_at,
                              -- 失敗的列沒有前面那些時間戳，但 failed_at 就是 Stage 1 的終點
                              CASE WHEN a.status = 'FAILED' THEN a.failed_at END)
                     - a.started_at))::numeric, 1);
  v_stage2_secs := round(extract(epoch FROM (
                     coalesce(a.synthesis_completed_at, a.synthesis_failed_at) - a.synthesis_started_at))::numeric, 1);

  INSERT INTO d (item, value) VALUES
    ('作文',                    coalesce(v_title, '(無標題)')),
    ('essay_id',                a.essay_id::text),
    ('analysis_id',             a.id::text || '　v' || a.analysis_version),
    ('status',                  a.status),
    ('synthesis_status',        coalesce(a.synthesis_status, 'NULL')),
    ('model',                   coalesce(a.model, 'NULL')),
    ('—— Stage 1 ——',          ''),
    ('四軸是否已落地',           CASE WHEN a.competency_analysis IS NOT NULL
                                  AND a.error_analysis IS NOT NULL
                                  AND a.high_score_feature_analysis IS NOT NULL
                                 THEN '是（三欄都有資料，重跑綜合層即可，不必重跑 Stage 1）'
                                 ELSE '否' END),
    ('failed_pass',             coalesce(a.failed_pass, '(無)')),
    ('error_detail',            coalesce(a.error_detail, '(無)')),
    ('validation_issues',       CASE WHEN a.validation_issues IS NULL THEN 'NULL（Stage 1 沒有走到失敗路徑）'
                                     ELSE jsonb_array_length(a.validation_issues) || ' 項' END),
    ('Stage 1 嘗試次數',         a.attempt_count::text),
    ('Stage 1 耗時',            coalesce(v_stage1_secs::text, '?') || ' 秒' ||
                                CASE WHEN j ->> 'analyzed_at' IS NULL AND a.synthesis_started_at IS NOT NULL
                                     THEN '（由 synthesis_started_at 推得，非 analyzed_at）' ELSE '' END),
    ('—— Stage 2 ——',          ''),
    ('synthesis_error_detail',  coalesce(a.synthesis_error_detail, '(無)')),
    ('synthesis_validation_issues',
                                CASE WHEN a.synthesis_validation_issues IS NULL THEN 'NULL（綜合層沒有走到失敗路徑）'
                                     ELSE jsonb_array_length(a.synthesis_validation_issues) || ' 項' END),
    ('Stage 2 嘗試次數',         a.synthesis_attempt_count::text),
    ('Stage 2 耗時',            coalesce(v_stage2_secs::text, '?') || ' 秒'),
    ('綜合層是否已產出',         CASE WHEN a.overall_evaluation IS NOT NULL
                                 THEN '是' ELSE '否（overall_evaluation 是 NULL）' END),
    ('—— 時間戳 ——',           ''),
    ('requested_at',            a.requested_at::text),
    ('started_at',              coalesce(a.started_at::text, 'NULL')),
    ('analyzed_at',             coalesce(j ->> 'analyzed_at', 'NULL（此列在拆成兩次請求之前產生，或尚未跑步驟 1b）')),
    ('synthesis_started_at',    coalesce(a.synthesis_started_at::text, 'NULL')),
    ('synthesis_failed_at',     coalesce(a.synthesis_failed_at::text, 'NULL')),
    ('synthesis_completed_at',  coalesce(a.synthesis_completed_at::text, 'NULL')),
    ('completed_at',            coalesce(a.completed_at::text, 'NULL')),
    ('failed_at',               coalesce(a.failed_at::text, 'NULL'));

  -- ── 判讀：502 是哪一種 ────────────────────────────────────
  INSERT INTO d (item, value) VALUES ('—— 判讀 ——', '');

  -- 判讀優先讀 telemetry 的 finalOutcome。比對錯誤訊息字串是不可靠的：
  -- 2026-09-05 就是因為期限訊息從英文的 "aborted" 改成中文的「硬性期限」，
  -- 這裡的 ILIKE '%abort%' 沒中，於是把一次期限中斷誤判成 HTTP／JSON 失敗。
  -- 結局是列舉值，訊息是給人看的散文——判讀只能靠前者。
  v_outcome := j -> 'stage1_telemetry' -> a.failed_pass ->> 'finalOutcome';

  IF a.status = 'FAILED' THEN
    IF v_outcome = 'DEADLINE'
       OR (v_outcome IS NULL AND a.error_detail ~* '(abort|硬性期限)') THEN
      INSERT INTO d (item, value) VALUES
        ('502 成因', 'Stage 1 的「' || a.failed_pass || '」被【我們自己的 50 秒硬性期限】中斷，不是 Vercel 逾時'),
        ('對應動作', '四軸沒有落地，必須整個重跑 Stage 1');
    ELSIF a.validation_issues IS NOT NULL AND jsonb_array_length(a.validation_issues) > 0 THEN
      INSERT INTO d (item, value) VALUES
        ('502 成因', 'Stage 1 結構化輸出驗證失敗（' || a.failed_pass || '），缺漏清單見下');
    ELSE
      INSERT INTO d (item, value) VALUES
        ('502 成因', 'Stage 1 呼叫本身失敗（' || a.failed_pass || '）：'
                     || coalesce(v_outcome, 'HTTP 非 2xx／回傳不是合法 JSON'));
    END IF;

  ELSIF a.synthesis_status = 'FAILED' THEN
    IF a.synthesis_validation_issues IS NOT NULL
       AND jsonb_array_length(a.synthesis_validation_issues) > 0 THEN
      INSERT INTO d (item, value) VALUES
        ('502 成因', '綜合層驗證失敗（refs 或夾帶原文），缺漏清單見下。四軸完好');
    ELSIF coalesce(j -> 'synthesis_telemetry' ->> 'finalOutcome', '') = 'DEADLINE'
          OR a.synthesis_error_detail ~* '(abort|硬性期限)' THEN
      INSERT INTO d (item, value) VALUES
        ('502 成因', '綜合層被【我們自己的 50 秒硬性期限】中斷（AbortError），不是 Vercel 逾時，也不是模型的問題'),
        ('對應動作', '這是拆成兩次請求要解決的問題。四軸完好，重新部署後按「只跑綜合層」即可補完');
    ELSE
      INSERT INTO d (item, value) VALUES
        ('502 成因', '綜合層呼叫本身失敗：HTTP 非 2xx／回傳不是合法 JSON。四軸完好');
    END IF;

  ELSE
    INSERT INTO d (item, value) VALUES ('502 成因', '這一列沒有失敗紀錄——502 可能來自更早的一次嘗試');
  END IF;

  -- ── 缺漏清單原文（有才印） ────────────────────────────────
  FOR v_rec IN
    SELECT 'Stage 1 缺漏' AS src, value FROM jsonb_array_elements(coalesce(a.validation_issues, '[]'::jsonb))
    UNION ALL
    SELECT '綜合層缺漏', value FROM jsonb_array_elements(coalesce(a.synthesis_validation_issues, '[]'::jsonb))
  LOOP
    INSERT INTO d (item, value)
    VALUES (v_rec.src, '[' || (v_rec.value ->> 'kind') || '] '
                       || coalesce(v_rec.value ->> 'path', '') || '：'
                       || coalesce(v_rec.value ->> 'detail', ''));
  END LOOP;

  -- ── 逐支、逐次量測 ────────────────────────────────────────
  -- 這一段取代三個舊盲點：attempt_count 是常數、被中斷的呼叫 latency 歸零、
  -- 以及最後一次的空陣列蓋掉前一次的缺漏清單。
  IF j -> 'stage1_telemetry' IS NULL OR j ->> 'stage1_telemetry' IS NULL THEN
    INSERT INTO d (item, value)
    VALUES ('—— 逐支量測 ——', '此列在加入量測之前產生，或尚未跑 add_writing_analyses_telemetry.sql');
  ELSE
    INSERT INTO d (item, value) VALUES ('—— 逐支量測 ——', '');
    FOR v_rec IN
      SELECT key AS pass_label, value AS t
        FROM jsonb_each(j -> 'stage1_telemetry')
       ORDER BY key
    LOOP
      INSERT INTO d (item, value) VALUES (
        v_rec.pass_label,
        '嘗試 ' || (v_rec.t ->> 'attempts') || ' 次　'
          || '總長 ' || round(((v_rec.t ->> 'totalLatencyMs')::numeric) / 1000, 1) || ' 秒　'
          || '結局 ' || (v_rec.t ->> 'finalOutcome')
          || CASE WHEN (v_rec.t ->> 'hitDeadline')::boolean THEN '　← 撞到我們自己的期限' ELSE '' END
      );
      FOR v_rec2 IN SELECT value AS a FROM jsonb_array_elements(v_rec.t -> 'records') LOOP
        INSERT INTO d (item, value) VALUES (
          '  ' || v_rec.pass_label || ' 第 ' || (v_rec2.a ->> 'attempt') || ' 次',
          round(((v_rec2.a ->> 'latencyMs')::numeric) / 1000, 1) || ' 秒'
            || '　起於 +' || round(((v_rec2.a ->> 'offsetMs')::numeric) / 1000, 1) || ' 秒'
            || '　' || (v_rec2.a ->> 'outcome')
            || coalesce('　HTTP ' || (v_rec2.a ->> 'httpStatus'), '')
            || coalesce('　輸出 ' || (v_rec2.a ->> 'responseChars') || ' 字元', '')
            || coalesce('　completion ' || (v_rec2.a ->> 'completionTokens') || ' tokens', '')
            || coalesce('　體積 ' || (v_rec2.a ->> 'shape'), '')
            || coalesce('　缺漏 ' || (v_rec2.a ->> 'issueCount') || ' 項', '')
        );
        -- 每一次嘗試自己的缺漏清單。這是「為什麼要重試」的唯一證據來源。
        FOR v_rec3 IN
          SELECT value AS i FROM jsonb_array_elements(coalesce(v_rec2.a -> 'issues', '[]'::jsonb))
        LOOP
          INSERT INTO d (item, value) VALUES (
            '    ' || v_rec.pass_label || ' 第 ' || (v_rec2.a ->> 'attempt') || ' 次缺漏',
            '[' || (v_rec3.i ->> 'kind') || '] ' || coalesce(v_rec3.i ->> 'path', '')
              || '：' || coalesce(v_rec3.i ->> 'detail', '')
          );
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  IF j ->> 'synthesis_telemetry' IS NOT NULL THEN
    INSERT INTO d (item, value) VALUES (
      'synthesis 量測',
      '嘗試 ' || (j -> 'synthesis_telemetry' ->> 'attempts') || ' 次　'
        || '總長 ' || round(((j -> 'synthesis_telemetry' ->> 'totalLatencyMs')::numeric) / 1000, 1) || ' 秒　'
        || '結局 ' || (j -> 'synthesis_telemetry' ->> 'finalOutcome')
    );
  END IF;

  -- ── 覆蓋計數：確認四軸真的是完整的，不是半套 ──────────────
  IF a.competency_analysis IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM jsonb_array_elements(a.competency_analysis -> 'categories') c,
                                  jsonb_array_elements(c.value -> 'skills');
    INSERT INTO d (item, value) VALUES ('能力節點數（應為 23）', v_n::text);
  END IF;
  IF a.error_analysis IS NOT NULL THEN
    SELECT jsonb_array_length(a.error_analysis -> 'coverage') INTO v_n;
    INSERT INTO d (item, value) VALUES ('錯誤 code 覆蓋數（應為 16）', coalesce(v_n::text, '?'));
  END IF;
  IF a.high_score_feature_analysis IS NOT NULL THEN
    SELECT jsonb_array_length(a.high_score_feature_analysis -> 'features') INTO v_n;
    INSERT INTO d (item, value) VALUES ('高分特徵數（應為 29）', coalesce(v_n::text, '?'));
  END IF;
END;
$probe$;

SELECT item, value FROM d ORDER BY seq;
