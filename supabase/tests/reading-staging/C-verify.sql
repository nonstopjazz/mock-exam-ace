-- =====================================================
-- Group C 驗證：Admin import
-- ✍️ 【會寫入】但會自己清乾淨：fixture 的 passage_id 以 ZZ-VERIFY- 開頭、
--    批次紀錄的檔名是 ZZ-VERIFY.xlsx，腳本最後一律刪除。
--    ⚠️ 只在 staging 執行。
--
-- 執行時機：跑完這四支之後
--   create_reading_import_1_batches / _2_hash / _3_one / _4_batch
--
-- 🛑 需要管理員身分。is_admin() 是用 email 判的，所以腳本會去 auth.users
--    找 nonstopjazz@gmail.com。找不到就直接回報，不會假裝通過。
--
-- 判讀：最後一張表的「結果」欄【全部】要是 ✅。
-- =====================================================

DELETE FROM reading_passages WHERE passage_id LIKE 'ZZ-VERIFY-%';
DELETE FROM reading_import_batches WHERE filename = 'ZZ-VERIFY.xlsx';

CREATE TEMP TABLE zz_c(seq int, 檢查 text, 期望 text, 實際 text);

-- canonical payload 的產生器（只在這個 session 存在）
CREATE OR REPLACE FUNCTION pg_temp.zz_payload(
  p_id TEXT, p_constructs TEXT[] DEFAULT ARRAY['SM','MI','SD','CO','CD','VC'],
  p_text TEXT DEFAULT 'A passage long enough to look real for verification.')
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'passage', jsonb_build_object(
      'passage_id', p_id, 'title', '驗證用（可刪）', 'passage_text', p_text,
      'content_source', 'REVISED', 'cefr_level', 'B2',
      'content_family', 'verification', 'subdomain', 'verification'),
    'questions', (SELECT jsonb_agg(jsonb_build_object(
        'construct', c, 'display_order', ord,
        'question', 'Q ' || c,
        'options', jsonb_build_object('A','opt a','B','opt b','C','opt c','D','opt d'),
        'correct_answer', 'B', 'explanation', '解說：正解是 B。',
        'skills', jsonb_build_array(
          jsonb_build_object('skill_code','zz_s1','emphasis',90),
          jsonb_build_object('skill_code','zz_s2','emphasis',NULL))))
      FROM unnest(p_constructs) WITH ORDINALITY AS t(c, ord)),
    'paragraphs', jsonb_build_array(jsonb_build_object('paragraph_no',1,'description','開場')),
    'vocabulary', jsonb_build_array(
      jsonb_build_object('tier','CANDIDATE','term','settled','definition','decided','paragraph_no',1)));
$$;

DO $$
DECLARE
  v_admin UUID; v_other UUID; v_r JSONB; v_msg TEXT;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'nonstopjazz@gmail.com';
  SELECT id INTO v_other FROM auth.users
   WHERE email IS DISTINCT FROM 'nonstopjazz@gmail.com' ORDER BY created_at LIMIT 1;

  IF v_admin IS NULL THEN
    INSERT INTO zz_c VALUES (0, '🛑 前置：找不到管理員帳號', '存在', '不存在');
    RETURN;
  END IF;

  -- ── C1 非管理員叫不動 ───────────────────────────────
  IF v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
    BEGIN
      PERFORM reading_import_batch(jsonb_build_array(pg_temp.zz_payload('ZZ-VERIFY-X')), 'ZZ-VERIFY.xlsx');
      INSERT INTO zz_c VALUES (1, '🛑 C1 非管理員被拒', '被擋下', '🛑 竟然成功了');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO zz_c VALUES (1, '🛑 C1 非管理員被拒', '被擋下',
        CASE WHEN SQLERRM LIKE '%管理員%' THEN '被擋下'
             ELSE '🛑 理由不對：' || left(SQLERRM,40) END);
    END;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM reading_import_batch(jsonb_build_array(pg_temp.zz_payload('ZZ-VERIFY-X')), 'ZZ-VERIFY.xlsx');
    INSERT INTO zz_c VALUES (2, '🛑 C1 未登入被拒', '被擋下', '🛑 竟然成功了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO zz_c VALUES (2, '🛑 C1 未登入被拒', '被擋下',
      CASE WHEN SQLERRM LIKE '%請先登入%' THEN '被擋下'
           ELSE '🛑 理由不對：' || left(SQLERRM,40) END);
  END;

  -- ── 以下以管理員身分 ────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- ── C2 六題 → imported 且 publish-ready ─────────────
  v_r := reading_import_batch(jsonb_build_array(pg_temp.zz_payload('ZZ-VERIFY-6')), 'ZZ-VERIFY.xlsx');
  INSERT INTO zz_c VALUES (3, 'C2 六題完整 → imported', 'imported',
    (v_r -> 'results' -> 0 ->> 'status'));
  INSERT INTO zz_c VALUES (4, 'C2 而且 publish-ready', 'true',
    (v_r -> 'results' -> 0 ->> 'publish_ready'));
  INSERT INTO zz_c VALUES (5, 'C2 匯入後一律是 DRAFT（上架是另一個動作）', 'DRAFT',
    (SELECT status FROM reading_passages WHERE passage_id='ZZ-VERIFY-6'));
  INSERT INTO zz_c VALUES (6, 'C2 六題都寫進去了', '6',
    (SELECT count(*) FROM reading_questions WHERE passage_id='ZZ-VERIFY-6')::text);
  INSERT INTO zz_c VALUES (7, 'C2 六個答案寫進 reading_question_keys', '6',
    (SELECT count(*) FROM reading_question_keys k JOIN reading_questions q ON q.id=k.question_id
      WHERE q.passage_id='ZZ-VERIFY-6')::text);
  INSERT INTO zz_c VALUES (8, '🛑 C2 回傳不含正解與解說', '不含',
    CASE WHEN v_r::text LIKE '%correct_answer%' OR v_r::text LIKE '%解說%'
         THEN '🛑 含有' ELSE '不含' END);
  INSERT INTO zz_c VALUES (9, 'C2 emphasis 的 NULL 原樣保存，沒有變成 0', 'true',
    (SELECT (emphasis IS NULL)::text FROM reading_question_skills s
       JOIN reading_questions q ON q.id=s.question_id
      WHERE q.passage_id='ZZ-VERIFY-6' AND s.skill_code='zz_s2' LIMIT 1));
  INSERT INTO zz_c VALUES (10, 'C2 段落與詞彙也寫進去了', '1 / 1',
    (SELECT count(*) FROM reading_passage_paragraphs WHERE passage_id='ZZ-VERIFY-6')::text
    || ' / ' ||
    (SELECT count(*) FROM reading_passage_vocab WHERE passage_id='ZZ-VERIFY-6')::text);

  -- ── C3 1–5 題 → DRAFT，不可上架 ─────────────────────
  v_r := reading_import_batch(
    jsonb_build_array(pg_temp.zz_payload('ZZ-VERIFY-3', ARRAY['SM','MI','SD'])), 'ZZ-VERIFY.xlsx');
  INSERT INTO zz_c VALUES (11, 'C3 三題 → imported（入得了庫）', 'imported',
    (v_r -> 'results' -> 0 ->> 'status'));
  INSERT INTO zz_c VALUES (12, '🛑 C3 但不 publish-ready', 'false',
    (v_r -> 'results' -> 0 ->> 'publish_ready'));
  INSERT INTO zz_c VALUES (13, 'C3 原因講明缺哪幾個 construct', '含缺少的 construct',
    CASE WHEN (v_r -> 'results' -> 0 ->> 'reason') LIKE '%CO%' THEN '含缺少的 construct'
         ELSE '🛑 ' || coalesce(v_r -> 'results' -> 0 ->> 'reason','(無)') END);
  BEGIN
    UPDATE reading_passages SET status='PUBLISHED' WHERE passage_id='ZZ-VERIFY-3';
    INSERT INTO zz_c VALUES (14, '🛑 C3 三題的文章上不了架', '被 trigger 擋下', '🛑 竟然上架成功');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO zz_c VALUES (14, '🛑 C3 三題的文章上不了架', '被 trigger 擋下',
      CASE WHEN SQLERRM LIKE '%缺少%' THEN '被 trigger 擋下'
           ELSE '🛑 理由不對：' || left(SQLERRM,40) END);
  END;

  -- ── C4 0 題 → blocked，一列都不寫 ───────────────────
  v_r := reading_import_batch(
    jsonb_build_array(jsonb_set(pg_temp.zz_payload('ZZ-VERIFY-0'), '{questions}', '[]'::jsonb)),
    'ZZ-VERIFY.xlsx');
  INSERT INTO zz_c VALUES (15, '🛑 C4 0 題 → blocked', 'blocked',
    (v_r -> 'results' -> 0 ->> 'status'));
  INSERT INTO zz_c VALUES (16, '🛑 C4 而且一列都沒有寫進去', '0 列',
    (SELECT count(*) FROM reading_passages WHERE passage_id='ZZ-VERIFY-0')::text || ' 列');
  INSERT INTO zz_c VALUES (17, '🛑 C4 blocked 自己數一欄，沒有混進 failed', '1 / 0',
    (v_r -> 'chunk' ->> 'blocked') || ' / ' || (v_r -> 'chunk' ->> 'failed'));

  -- ── C5 冪等：一模一樣 → skipped ─────────────────────
  v_r := reading_import_batch(jsonb_build_array(pg_temp.zz_payload('ZZ-VERIFY-6')), 'ZZ-VERIFY.xlsx');
  INSERT INTO zz_c VALUES (18, '🛑 C5 重送完全相同的內容 → skipped', 'skipped',
    (v_r -> 'results' -> 0 ->> 'status'));
  INSERT INTO zz_c VALUES (19, 'C5 而且沒有產生重複的題目', '6',
    (SELECT count(*) FROM reading_questions WHERE passage_id='ZZ-VERIFY-6')::text);

  -- ── C6 內容不同 → conflict，不覆蓋 ──────────────────
  v_r := reading_import_batch(
    jsonb_build_array(pg_temp.zz_payload('ZZ-VERIFY-6',
      ARRAY['SM','MI','SD','CO','CD','VC'], '改過的內文，不該被寫進去。')), 'ZZ-VERIFY.xlsx');
  INSERT INTO zz_c VALUES (20, '🛑 C6 內容不同 → conflict', 'conflict',
    (v_r -> 'results' -> 0 ->> 'status'));
  INSERT INTO zz_c VALUES (21, '🛑 C6 庫裡的內容原封不動（永不自動覆蓋）', '原本的內文',
    CASE WHEN (SELECT passage_text FROM reading_passages WHERE passage_id='ZZ-VERIFY-6')
              LIKE 'A passage long enough%' THEN '原本的內文' ELSE '🛑 被覆蓋了' END);

  -- ── C7 一篇失敗不拖垮整批 ───────────────────────────
  v_r := reading_import_batch(jsonb_build_array(
      pg_temp.zz_payload('ZZ-VERIFY-OK1'),
      jsonb_set(pg_temp.zz_payload('ZZ-VERIFY-BAD1'), '{questions,0,correct_answer}', '"Z"'),
      pg_temp.zz_payload('ZZ-VERIFY-OK2'),
      jsonb_set(pg_temp.zz_payload('ZZ-VERIFY-BAD2'), '{passage,cefr_level}', '"Z9"'),
      pg_temp.zz_payload('ZZ-VERIFY-OK3')), 'ZZ-VERIFY.xlsx');
  INSERT INTO zz_c VALUES (22, '🛑 C7 五篇裡三篇成功、兩篇失敗', '3 / 2',
    (v_r -> 'chunk' ->> 'imported') || ' / ' || (v_r -> 'chunk' ->> 'failed'));
  INSERT INTO zz_c VALUES (23, '🛑 C7 三篇【真的在資料庫裡】，不是只在回傳裡說成功', '3 篇',
    (SELECT count(*) FROM reading_passages
      WHERE passage_id IN ('ZZ-VERIFY-OK1','ZZ-VERIFY-OK2','ZZ-VERIFY-OK3'))::text || ' 篇');
  INSERT INTO zz_c VALUES (24, '🛑 C7 壞的兩篇一列都沒留下（subtransaction 回滾乾淨）', '0 篇',
    (SELECT count(*) FROM reading_passages
      WHERE passage_id IN ('ZZ-VERIFY-BAD1','ZZ-VERIFY-BAD2'))::text || ' 篇');
  INSERT INTO zz_c VALUES (25, 'C7 每一篇回傳自己的失敗原因', '正解 / CEFR',
    CASE WHEN (v_r -> 'results' -> 1 ->> 'reason') LIKE '%正解%'
          AND (v_r -> 'results' -> 3 ->> 'reason') LIKE '%cefr%'
         THEN '正解 / CEFR' ELSE '🛑 原因對不上' END);

  -- ── C8 批次紀錄 ─────────────────────────────────────
  INSERT INTO zz_c VALUES (26, 'C8 批次紀錄留下檔名與匯入者', 'ZZ-VERIFY.xlsx / 是管理員',
    (SELECT filename FROM reading_import_batches WHERE filename='ZZ-VERIFY.xlsx' LIMIT 1)
    || ' / ' ||
    CASE WHEN (SELECT bool_and(admin_id = v_admin) FROM reading_import_batches
                WHERE filename='ZZ-VERIFY.xlsx') THEN '是管理員' ELSE '🛑 不是' END);
  INSERT INTO zz_c VALUES (27, '🛑 C8 批次紀錄表沒有任何存內容或答案的欄位', '0 欄',
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='reading_import_batches'
        AND column_name ~ 'answer|question|passage_text|explanation|payload')::text || ' 欄');

  PERFORM set_config('request.jwt.claims', '', true);
EXCEPTION WHEN OTHERS THEN
  v_msg := SQLERRM;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO zz_c VALUES (99, '🛑 腳本本身出錯了', '不該出錯', left(v_msg, 120));
END $$;

DELETE FROM reading_passages WHERE passage_id LIKE 'ZZ-VERIFY-%';
DELETE FROM reading_import_batches WHERE filename = 'ZZ-VERIFY.xlsx';

SELECT 檢查, 期望, 實際,
       CASE WHEN 期望 = 實際 THEN '✅' ELSE '🛑 FAIL' END AS 結果,
       (SELECT count(*) FROM reading_passages WHERE passage_id LIKE 'ZZ-VERIFY-%') AS 殘留fixture,
       (SELECT count(*) FROM reading_import_batches WHERE filename='ZZ-VERIFY.xlsx') AS 殘留批次
  FROM zz_c ORDER BY (CASE WHEN 期望 = 實際 THEN 1 ELSE 0 END), seq;
