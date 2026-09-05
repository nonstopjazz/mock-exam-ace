-- =====================================================
-- 真實分析結果的可讀稽核報告（唯讀）
--
-- 在 Preview 跑過 /admin/writing-debug 之後，於 Supabase SQL Editor 執行。
-- 讀 writing_analyses 最新一次分析，輸出成一欄一欄看得懂的文字。
--
-- ⚠️ 完全唯讀，不寫入、不修改任何資料。
--
-- 預設取「最近一次的分析」。要指定某一篇，把下面 v_essay 那一行的
-- NULL 換成該篇的 essay_id（UUID）。
--
-- 輸出一張表：section / ord / line。全部貼回來即可。
-- 它同時包含：
--   • 延遲（Stage 1 / Stage 2 / 端對端，由資料庫時間戳推導）
--   • 完整覆蓋計數（23 / 16 / 29）
--   • 引用是否真的出現在 writing_texts 的內文裡（抓捏造證據）
--   • 三軸完整明細與綜合層
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS r (
  seq SERIAL,
  section TEXT,
  ord INTEGER,
  line TEXT
);
TRUNCATE r;

DO $outer$
DECLARE
  v_essay  UUID := NULL;   -- ← 要指定某一篇就把 NULL 換成 essay_id
  a        public.writing_analyses%ROWTYPE;
  v_title  TEXT;
  v_topic  TEXT;
  v_text   TEXT;
  v_int    INTEGER;
  v_rec    RECORD;
  v_ord    INTEGER := 0;
BEGIN
  SELECT * INTO a
    FROM public.writing_analyses x
   WHERE (v_essay IS NULL OR x.essay_id = v_essay)
   ORDER BY x.requested_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO r (section, ord, line) VALUES ('狀態', 1, '找不到任何分析紀錄。請先在 Preview 上跑一次。');
    RETURN;
  END IF;

  SELECT s.title, s.essay_topic INTO v_title, v_topic
    FROM public.writing_submissions s WHERE s.id = a.essay_id;
  SELECT t.content INTO v_text
    FROM public.writing_texts t WHERE t.essay_id = a.essay_id
   ORDER BY t.created_at DESC LIMIT 1;

  -- ==========================================================
  -- 1. 概況與延遲
  -- ==========================================================
  INSERT INTO r (section, ord, line) VALUES
    ('1 概況', 1, '作文：' || coalesce(v_title, '(無標題)')),
    ('1 概況', 2, '題目：' || coalesce(v_topic, '(未提供)')),
    ('1 概況', 3, '字數：' || coalesce(char_length(v_text)::text, '?')),
    ('1 概況', 4, 'analysis_id：' || a.id || '　version：' || a.analysis_version),
    ('1 概況', 5, 'status：' || a.status || '　synthesis_status：' || coalesce(a.synthesis_status, 'NULL')),
    ('1 概況', 6, 'report_ready：' || (a.status = 'COMPLETED')::text),
    ('1 概況', 7, 'model：' || coalesce(a.model, 'NULL') || '　taxonomy：' || a.taxonomy_version),
    ('1 概況', 8, 'Stage 1 延遲：' ||
        coalesce(round(extract(epoch FROM (a.completed_at - a.started_at))::numeric
                       - coalesce(extract(epoch FROM (a.synthesis_completed_at - a.synthesis_started_at))::numeric, 0), 1)::text, '?') || ' 秒'),
    ('1 概況', 9, 'Stage 2 綜合層延遲：' ||
        coalesce(round(extract(epoch FROM (a.synthesis_completed_at - a.synthesis_started_at))::numeric, 1)::text, '?') || ' 秒'),
    ('1 概況', 10, '端對端（requested → completed）：' ||
        coalesce(round(extract(epoch FROM (a.completed_at - a.requested_at))::numeric, 1)::text, '?') || ' 秒'),
    ('1 概況', 11, '對 50 秒硬性期限的餘裕：' ||
        coalesce(round(50 - extract(epoch FROM (a.completed_at - a.requested_at))::numeric, 1)::text, '?') || ' 秒'),
    ('1 概況', 12, 'Stage 1 嘗試次數：' || a.attempt_count ||
                   '　Stage 2 嘗試次數：' || a.synthesis_attempt_count);

  IF a.failed_pass IS NOT NULL OR a.error_detail IS NOT NULL THEN
    INSERT INTO r (section, ord, line) VALUES
      ('1 概況', 13, '失敗的 pass：' || coalesce(a.failed_pass, '-')),
      ('1 概況', 14, '錯誤訊息：' || coalesce(a.error_detail, '-'));
  END IF;
  IF a.synthesis_error_detail IS NOT NULL THEN
    INSERT INTO r (section, ord, line)
    VALUES ('1 概況', 15, '綜合層錯誤：' || a.synthesis_error_detail);
  END IF;
  IF a.validation_issues IS NOT NULL THEN
    INSERT INTO r (section, ord, line)
    VALUES ('1 概況', 16, '完整覆蓋缺漏（validation_issues）：'
                          || jsonb_array_length(a.validation_issues) || ' 項');
    v_ord := 16;
    FOR v_rec IN SELECT value FROM jsonb_array_elements(a.validation_issues) LOOP
      v_ord := v_ord + 1;
      INSERT INTO r (section, ord, line)
      VALUES ('1 概況', v_ord, '  [' || (v_rec.value ->> 'kind') || '] ' || (v_rec.value ->> 'detail'));
    END LOOP;
  END IF;

  -- ==========================================================
  -- 2. 完整覆蓋計數（不靠信任，直接數）
  -- ==========================================================
  SELECT count(*) INTO v_int
    FROM jsonb_array_elements(a.competency_analysis -> 'categories') c,
         jsonb_array_elements(c -> 'skills') s;
  INSERT INTO r (section, ord, line)
  VALUES ('2 覆蓋', 1, 'Competency skill 數：' || v_int || ' / 23　'
                       || CASE WHEN v_int = 23 THEN 'OK' ELSE '**不足**' END);

  SELECT count(*) INTO v_int FROM jsonb_array_elements(a.error_analysis -> 'coverage');
  INSERT INTO r (section, ord, line)
  VALUES ('2 覆蓋', 2, 'Error coverage 數：' || v_int || ' / 16　'
                       || CASE WHEN v_int = 16 THEN 'OK' ELSE '**不足**' END);

  SELECT count(*) INTO v_int FROM jsonb_array_elements(a.high_score_feature_analysis -> 'features');
  INSERT INTO r (section, ord, line)
  VALUES ('2 覆蓋', 3, 'High-Score feature 數：' || v_int || ' / 29　'
                       || CASE WHEN v_int = 29 THEN 'OK' ELSE '**不足**' END);

  -- ==========================================================
  -- 3. 引用查核：每一段引用是否真的出現在學生原文裡
  -- ==========================================================
  v_ord := 0;
  FOR v_rec IN
    SELECT src, quote FROM (
      SELECT 'competency ' || (s ->> 'code') AS src, (ev ->> 'quote') AS quote
        FROM jsonb_array_elements(a.competency_analysis -> 'categories') c,
             jsonb_array_elements(c -> 'skills') s,
             jsonb_array_elements(s -> 'evidence') ev
      UNION ALL
      SELECT 'error ' || (f ->> 'code'), (f ->> 'quote')
        FROM jsonb_array_elements(a.error_analysis -> 'findings') f
      UNION ALL
      SELECT 'feature ' || (ft ->> 'code'), (i ->> 'quote')
        FROM jsonb_array_elements(a.high_score_feature_analysis -> 'features') ft,
             jsonb_array_elements(ft -> 'instances') i
    ) q
   WHERE position(q.quote IN coalesce(v_text, '')) = 0
  LOOP
    v_ord := v_ord + 1;
    INSERT INTO r (section, ord, line)
    VALUES ('3 引用查核', v_ord + 1, '找不到出處：[' || v_rec.src || '] 「' || v_rec.quote || '」');
  END LOOP;
  INSERT INTO r (section, ord, line)
  VALUES ('3 引用查核', 1,
    CASE WHEN v_ord = 0 THEN '全部引用都逐字出現在學生原文中 —— 沒有捏造證據'
         ELSE '**有 ' || v_ord || ' 段引用在原文中找不到（見下）**' END);

  -- ==========================================================
  -- 4. 綜合層（學生的第一屏）
  -- ==========================================================
  IF a.overall_evaluation IS NULL THEN
    INSERT INTO r (section, ord, line)
    VALUES ('4 綜合層', 1, '（尚未產生。status = ' || a.status
                           || '，synthesis_status = ' || coalesce(a.synthesis_status, 'NULL') || '）');
  ELSE
    INSERT INTO r (section, ord, line) VALUES
      ('4 綜合層', 1, '整體：' || (a.overall_evaluation ->> 'level')),
      ('4 綜合層', 2, '一句話：' || (a.overall_evaluation ->> 'headline')),
      ('4 綜合層', 3, '說明：' || (a.overall_evaluation ->> 'summary'));
    v_ord := 3;
    INSERT INTO r (section, ord, line) VALUES ('4 綜合層', 4, '── 值得肯定 ──');
    v_ord := 4;
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(a.strengths, '[]'::jsonb)) LOOP
      v_ord := v_ord + 1;
      INSERT INTO r (section, ord, line)
      VALUES ('4 綜合層', v_ord, '  ' || (v_rec.value ->> 'text')
             || '  [' || coalesce((SELECT string_agg(x #>> '{}', ',')
                                     FROM jsonb_array_elements(v_rec.value -> 'refs') x), '') || ']');
    END LOOP;
    v_ord := v_ord + 1;
    INSERT INTO r (section, ord, line) VALUES ('4 綜合層', v_ord, '── 需要處理 ──');
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(a.needs_work, '[]'::jsonb)) LOOP
      v_ord := v_ord + 1;
      INSERT INTO r (section, ord, line)
      VALUES ('4 綜合層', v_ord, '  ' || (v_rec.value ->> 'text')
             || '  [' || coalesce((SELECT string_agg(x #>> '{}', ',')
                                     FROM jsonb_array_elements(v_rec.value -> 'refs') x), '') || ']');
    END LOOP;
    v_ord := v_ord + 1;
    INSERT INTO r (section, ord, line) VALUES ('4 綜合層', v_ord, '── 下一步 ──');
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(a.next_steps, '[]'::jsonb)) LOOP
      v_ord := v_ord + 1;
      INSERT INTO r (section, ord, line) VALUES ('4 綜合層', v_ord, '  ' || (v_rec.value ->> 'text'));
    END LOOP;
  END IF;

  -- ==========================================================
  -- 5. 寫作能力（全 23 個）
  -- ==========================================================
  v_ord := 0;
  FOR v_rec IN
    SELECT (c ->> 'code') AS cat, (c ->> 'summary') AS summ,
           (s ->> 'code') AS code, (s ->> 'state') AS state, (s ->> 'reason') AS reason,
           coalesce((SELECT string_agg('「' || (ev ->> 'quote') || '」', ' ')
                       FROM jsonb_array_elements(s -> 'evidence') ev), '') AS quotes
      FROM jsonb_array_elements(a.competency_analysis -> 'categories') c,
           jsonb_array_elements(c -> 'skills') s
     ORDER BY (c ->> 'code'), (s ->> 'code')
  LOOP
    v_ord := v_ord + 1;
    INSERT INTO r (section, ord, line)
    VALUES ('5 寫作能力', v_ord,
            v_rec.cat || ' ' || rpad(v_rec.state, 11) || ' ' || v_rec.code
            || ' ｜ ' || v_rec.reason
            || CASE WHEN v_rec.quotes <> '' THEN ' ｜ ' || v_rec.quotes ELSE '' END);
  END LOOP;

  -- ==========================================================
  -- 6. 錯誤
  -- ==========================================================
  v_ord := 0;
  FOR v_rec IN
    SELECT (f ->> 'code') AS code, (f ->> 'quote') AS quote,
           (f ->> 'correction') AS fix, (f ->> 'reason') AS reason
      FROM jsonb_array_elements(a.error_analysis -> 'findings') f
  LOOP
    v_ord := v_ord + 1;
    INSERT INTO r (section, ord, line)
    VALUES ('6 錯誤', v_ord, v_rec.code || ' ｜ 「' || v_rec.quote || '」→「'
                             || v_rec.fix || '」 ｜ ' || v_rec.reason);
  END LOOP;
  IF v_ord = 0 THEN
    INSERT INTO r (section, ord, line) VALUES ('6 錯誤', 1, '本篇未找到任何已分類的錯誤。');
  END IF;

  SELECT count(*) INTO v_int
    FROM jsonb_array_elements(a.error_analysis -> 'coverage') c
   WHERE (c ->> 'count')::int = 0;
  INSERT INTO r (section, ord, line)
  VALUES ('6 錯誤', 900, '「本篇未發現此類錯誤」的代碼數：' || v_int || ' / 16');

  -- ==========================================================
  -- 7. 高分特徵（全 29 個，依 quality 分組）
  -- ==========================================================
  v_ord := 0;
  FOR v_rec IN
    SELECT (ft ->> 'quality') AS q, (ft ->> 'code') AS code, (ft ->> 'reason') AS reason,
           coalesce((SELECT string_agg('「' || (i ->> 'quote') || '」', ' ')
                       FROM jsonb_array_elements(ft -> 'instances') i), '') AS quotes
      FROM jsonb_array_elements(a.high_score_feature_analysis -> 'features') ft
     ORDER BY CASE (ft ->> 'quality')
                WHEN 'EFFECTIVE' THEN 1 WHEN 'PARTIALLY_EFFECTIVE' THEN 2
                WHEN 'MISUSED' THEN 3 ELSE 4 END, (ft ->> 'code')
  LOOP
    v_ord := v_ord + 1;
    INSERT INTO r (section, ord, line)
    VALUES ('7 高分特徵', v_ord,
            rpad(v_rec.q, 20) || ' ' || v_rec.code || ' ｜ ' || v_rec.reason
            || CASE WHEN v_rec.quotes <> '' THEN ' ｜ ' || v_rec.quotes ELSE '' END);
  END LOOP;

  -- ==========================================================
  -- 8. 學生原文（對照用）
  -- ==========================================================
  INSERT INTO r (section, ord, line) VALUES ('8 原文', 1, coalesce(v_text, '(沒有正文)'));
END;
$outer$;

-- 依 section / ord 排序，摘要行才會排在明細之前（插入順序不等於閱讀順序）
SELECT section, ord, line FROM r ORDER BY section, ord, seq;
