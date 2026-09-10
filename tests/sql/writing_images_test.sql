-- =====================================================
-- 拍照作文（writing_images / writing_ocr_runs / 三支學生 RPC / 兩支清理 RPC）的
-- 安全與生命週期測試
--
-- 🛑 本機專用。不要在 staging 或正式環境執行——它會寫入資料，
--    而且依賴 tests/sql/_writing_local_harness.sql 把 auth.uid() / is_admin()
--    換成讀 GUC 的替身。
--
-- 前置：
--   createdb wimg
--   psql -d wimg -f tests/sql/_writing_local_harness.sql
--   psql -d wimg -c "CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES auth.users(id), display_name TEXT);"
--   psql -d wimg -f supabase/migrations/create_writing_submissions.sql
--   psql -d wimg -f supabase/migrations/create_writing_texts.sql
--   psql -d wimg -f supabase/migrations/add_writing_texts_word_count.sql
--   psql -d wimg -f supabase/migrations/create_writing_ocr_runs.sql
--   psql -d wimg -f supabase/migrations/create_writing_images.sql
--   psql -d wimg -f supabase/migrations/relax_writing_image_checks.sql
--   psql -d wimg -f supabase/migrations/create_writing_image_rpcs.sql
--   psql -d wimg -f tests/sql/writing_images_test.sql
--
-- （create_writing_image_buckets.sql 不在此測——本機沒有 storage schema。）
--
-- 輸出一張表：項目 / 結果 / 說明。FAIL = 0 才算通過。
-- =====================================================

CREATE TEMP TABLE IF NOT EXISTS t (seq SERIAL, name TEXT, verdict TEXT, detail TEXT);
TRUNCATE t;

-- 測試過程中會 SET ROLE 成 authenticated / anon 再記錄結果，所以結果表要開放給它們寫。
GRANT ALL ON TABLE t TO authenticated, anon;
GRANT ALL ON SEQUENCE t_seq_seq TO authenticated, anon;

DO $test$
DECLARE
  v_student UUID;
  v_other   UUID;
  v_essay   UUID;
  v_essay2  UUID;
  v_essay_other UUID;
  v_run     UUID;
  v_run_other UUID;
  v_img     UUID;
  v_txt     TEXT;
  v_int     INTEGER;
  v_bool    BOOLEAN;
  v_ok      BOOLEAN;
  v_ocr_text TEXT := E'The quick brown fox jumps over the lazy dog.\n\nIt was a bright cold day in April.';

BEGIN
  -- ── 準備 ────────────────────────────────────────────────
  INSERT INTO auth.users (email) VALUES ('img-student@test') RETURNING id INTO v_student;
  INSERT INTO auth.users (email) VALUES ('img-other@test')   RETURNING id INTO v_other;

  PERFORM set_config('test.is_admin', 'false', true);
  PERFORM set_config('request.jwt.claim.sub', v_student::text, true);

  -- ══════════════════════════════════════════════════════
  -- 1. 圖片作文現在是合法的提交方式
  -- ══════════════════════════════════════════════════════
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    v_essay := create_writing_image_draft('我的第一篇拍照作文', '看圖說故事', CURRENT_DATE, NULL);
    INSERT INTO t(name, verdict, detail)
      VALUES ('學生可以建立圖片草稿', 'PASS', 'essay_id=' || left(v_essay::text, 8));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('學生可以建立圖片草稿', 'FAIL', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  SELECT submission_type = 'image' AND status = 'DRAFT'
    INTO v_bool FROM writing_submissions WHERE id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('草稿是 image / DRAFT', CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  -- ══════════════════════════════════════════════════════
  -- 2. 路徑歸屬把關（最重要的一條）
  -- ══════════════════════════════════════════════════════
  EXECUTE 'SET ROLE authenticated';

  -- 2a. 正常路徑可以登記
  BEGIN
    v_img := register_writing_image(
      v_essay, 1, v_student::text || '/' || v_essay::text || '/1-abc.jpg', 812345, 'image/jpeg');
    INSERT INTO t(name, verdict, detail) VALUES ('自己的路徑可以登記', 'PASS', '');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('自己的路徑可以登記', 'FAIL', SQLERRM);
  END;

  -- 2b. 🛑 別人資料夾的路徑必須被擋下
  --     擋不下來的話，伺服器會用 service-role 把別人的作文抓來辨識，
  --     再寫進這個學生自己的作文裡。
  BEGIN
    PERFORM register_writing_image(
      v_essay, 2, v_other::text || '/' || v_essay::text || '/2-abc.jpg', 100, 'image/jpeg');
    INSERT INTO t(name, verdict, detail)
      VALUES ('🛑 別人資料夾的路徑被拒絕', 'FAIL', '竟然允許登記別人的路徑');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail)
      VALUES ('🛑 別人資料夾的路徑被拒絕', 'PASS', SQLERRM);
  END;

  -- 2c. 自己的 uid 但別篇作文的 id 也要擋
  BEGIN
    PERFORM register_writing_image(
      v_essay, 3, v_student::text || '/' || gen_random_uuid()::text || '/3-abc.jpg', 100, 'image/jpeg');
    INSERT INTO t(name, verdict, detail)
      VALUES ('作文 id 不符的路徑被拒絕', 'FAIL', '竟然允許');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('作文 id 不符的路徑被拒絕', 'PASS', '');
  END;

  -- 2d. 別人的草稿不能登記（RLS 的 INSERT 政策）
  EXECUTE 'RESET ROLE';
  INSERT INTO writing_submissions (student_id, submission_type, title, status)
    VALUES (v_other, 'image', '別人的拍照作文', 'DRAFT') RETURNING id INTO v_essay_other;
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM register_writing_image(
      v_essay_other, 1, v_student::text || '/' || v_essay_other::text || '/1.jpg', 100, 'image/jpeg');
    INSERT INTO t(name, verdict, detail) VALUES ('不能在別人的草稿上登記頁面', 'FAIL', '竟然允許');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('不能在別人的草稿上登記頁面', 'PASS', '');
  END;

  -- ══════════════════════════════════════════════════════
  -- 3. 學生不能自己把頁面標成處理完成
  -- ══════════════════════════════════════════════════════
  BEGIN
    UPDATE writing_images SET state = 'NORMALIZED' WHERE id = v_img;
    GET DIAGNOSTICS v_int = ROW_COUNT;
    INSERT INTO t(name, verdict, detail)
      VALUES ('學生無法把頁面改成 NORMALIZED',
              CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END,
              CASE WHEN v_int = 0 THEN '沒有 UPDATE 政策，影響 0 列' ELSE '竟然改到了' END);
  EXCEPTION WHEN OTHERS THEN
    -- 沒有 UPDATE 權限時會直接報錯，也算擋下
    INSERT INTO t(name, verdict, detail) VALUES ('學生無法把頁面改成 NORMALIZED', 'PASS', SQLERRM);
  END;

  -- 3b. 學生也不能刪掉自己的圖片頁（那是 Storage 檔案的唯一索引）
  BEGIN
    DELETE FROM writing_images WHERE id = v_img;
    GET DIAGNOSTICS v_int = ROW_COUNT;
    INSERT INTO t(name, verdict, detail)
      VALUES ('學生無法刪除圖片頁',
              CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('學生無法刪除圖片頁', 'PASS', SQLERRM);
  END;

  -- 3c. 圖片草稿不可由學生整篇刪除（會讓 Storage 檔案失去索引）
  BEGIN
    DELETE FROM writing_submissions WHERE id = v_essay;
    GET DIAGNOSTICS v_int = ROW_COUNT;
    INSERT INTO t(name, verdict, detail)
      VALUES ('學生無法刪除圖片草稿',
              CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('學生無法刪除圖片草稿', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- 文字草稿仍然刪得掉（Phase 1 的行為不能被這次改動弄壞）
  DECLARE
    v_text_draft UUID;
  BEGIN
    INSERT INTO writing_submissions (student_id, submission_type, title, status)
      VALUES (v_student, 'text', '文字草稿', 'DRAFT') RETURNING id INTO v_text_draft;
    EXECUTE 'SET ROLE authenticated';
    DELETE FROM writing_submissions WHERE id = v_text_draft;
    GET DIAGNOSTICS v_int = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO t(name, verdict, detail)
      VALUES ('文字草稿仍然刪得掉（Phase 1 未受影響）',
              CASE WHEN v_int = 1 THEN 'PASS' ELSE 'FAIL' END, '');
  END;

  -- ══════════════════════════════════════════════════════
  -- 4. 送出前的把關
  -- ══════════════════════════════════════════════════════

  -- 伺服器把第 1 頁處理完成（模擬 service_role 的寫入）
  UPDATE writing_images
     SET state = 'NORMALIZED',
         archive_path = v_student::text || '/' || v_essay::text || '/1-abc.jpg',
         archive_bytes = 921600, archive_width = 2200, archive_height = 1650,
         archive_created_at = now(), archive_verified_at = now()
   WHERE id = v_img;

  -- 再加一頁，故意讓它失敗
  INSERT INTO writing_images (essay_id, page_number, raw_path, state, error_code, error_message)
    VALUES (v_essay, 2, v_student::text || '/' || v_essay::text || '/2-def.jpg',
            'NORMALIZE_FAILED', 'DECODE_FAILED', '無法解讀這張圖');

  INSERT INTO writing_ocr_runs (essay_id, status, raw_text, page_texts, triggered_by, started_at, finished_at)
    VALUES (v_essay, 'SUCCEEDED', v_ocr_text, '[]'::jsonb, v_student, now(), now())
    RETURNING id INTO v_run;

  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM submit_writing_image_essay(v_essay, v_ocr_text, v_run);
    INSERT INTO t(name, verdict, detail) VALUES ('有頁面未處理完成時不可送出', 'FAIL', '竟然送出了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('有頁面未處理完成時不可送出', 'PASS', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- 修好第 2 頁
  UPDATE writing_images
     SET state = 'NORMALIZED', error_code = NULL, error_message = NULL,
         archive_path = v_student::text || '/' || v_essay::text || '/2-def.jpg',
         archive_bytes = 880000, archive_width = 2200, archive_height = 1650,
         archive_created_at = now(), archive_verified_at = now()
   WHERE essay_id = v_essay AND page_number = 2;

  -- 別篇作文的辨識紀錄不能拿來送出這篇
  INSERT INTO writing_ocr_runs (essay_id, status, raw_text, triggered_by, finished_at)
    VALUES (v_essay_other, 'SUCCEEDED', 'someone else text', v_other, now())
    RETURNING id INTO v_run_other;

  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM submit_writing_image_essay(v_essay, v_ocr_text, v_run_other);
    INSERT INTO t(name, verdict, detail) VALUES ('不能拿別篇的辨識紀錄送出', 'FAIL', '竟然允許');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('不能拿別篇的辨識紀錄送出', 'PASS', '');
  END;

  -- ══════════════════════════════════════════════════════
  -- 5. 送出：provenance 由資料庫比對決定
  -- ══════════════════════════════════════════════════════

  -- 5a. 一字未改 → OCR
  BEGIN
    PERFORM submit_writing_image_essay(v_essay, v_ocr_text, v_run);
    INSERT INTO t(name, verdict, detail) VALUES ('校對後可以送出', 'PASS', '');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('校對後可以送出', 'FAIL', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  SELECT provenance INTO v_txt FROM writing_texts WHERE essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('未修改 → provenance = OCR',
            CASE WHEN v_txt = 'OCR' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_txt, 'NULL'));

  SELECT source_ocr_run_id = v_run INTO v_bool FROM writing_texts WHERE essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('文字記得來自哪一次辨識',
            CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT status = 'SUBMITTED' AND submitted_at IS NOT NULL
    INTO v_bool FROM writing_submissions WHERE id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('送出後狀態正確', CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  -- 字數：OCR 文字走的是同一支 word_count 產生欄位
  SELECT word_count INTO v_int FROM writing_texts WHERE essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    -- 兩句各 9 字與 8 字，中間的空行不會多算一個字（btrim 帶字元集的那個修正）
    VALUES ('OCR 文字的字數正確（17 字）',
            CASE WHEN v_int = 17 THEN 'PASS' ELSE 'FAIL' END, '實際 ' || v_int);

  -- 5b. 送出兩次
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM submit_writing_image_essay(v_essay, v_ocr_text, v_run);
    INSERT INTO t(name, verdict, detail) VALUES ('不能重複送出', 'FAIL', '竟然送出兩次');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('不能重複送出', 'PASS', '');
  END;
  EXECUTE 'RESET ROLE';

  -- 5c. 改過字 → OCR_CORRECTED
  INSERT INTO writing_submissions (student_id, submission_type, title, status)
    VALUES (v_student, 'image', '第二篇', 'DRAFT') RETURNING id INTO v_essay2;
  INSERT INTO writing_images (essay_id, page_number, raw_path, state,
                              archive_path, archive_created_at, archive_verified_at)
    VALUES (v_essay2, 1, v_student::text || '/' || v_essay2::text || '/1.jpg', 'NORMALIZED',
            v_student::text || '/' || v_essay2::text || '/1.jpg', now(), now());
  INSERT INTO writing_ocr_runs (essay_id, status, raw_text, triggered_by, finished_at)
    VALUES (v_essay2, 'SUCCEEDED', 'teh quick brown fox', v_student, now())
    RETURNING id INTO v_run;

  EXECUTE 'SET ROLE authenticated';
  PERFORM submit_writing_image_essay(v_essay2, 'the quick brown fox', v_run);
  EXECUTE 'RESET ROLE';

  SELECT provenance INTO v_txt FROM writing_texts WHERE essay_id = v_essay2;
  INSERT INTO t(name, verdict, detail)
    VALUES ('改過字 → provenance = OCR_CORRECTED',
            CASE WHEN v_txt = 'OCR_CORRECTED' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_txt, 'NULL'));

  SELECT raw_text = 'teh quick brown fox' INTO v_bool FROM writing_ocr_runs WHERE id = v_run;
  INSERT INTO t(name, verdict, detail)
    VALUES ('機器原本讀到的文字仍然留著',
            CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  -- ══════════════════════════════════════════════════════
  -- 6. 辨識紀錄的存取與不可變
  -- ══════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO v_int FROM writing_ocr_runs WHERE essay_id = v_essay;
  EXECUTE 'RESET ROLE';
  INSERT INTO t(name, verdict, detail)
    VALUES ('別人讀不到我的辨識文字',
            CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '讀到 ' || v_int || ' 列');

  PERFORM set_config('request.jwt.claim.sub', v_student::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO v_int FROM writing_ocr_runs WHERE essay_id = v_essay;
  EXECUTE 'RESET ROLE';
  INSERT INTO t(name, verdict, detail)
    VALUES ('自己讀得到自己的辨識文字',
            CASE WHEN v_int >= 1 THEN 'PASS' ELSE 'FAIL' END, '');

  BEGIN
    UPDATE writing_ocr_runs SET raw_text = '改掉' WHERE id = v_run;
    INSERT INTO t(name, verdict, detail) VALUES ('成功的辨識紀錄不可修改', 'FAIL', '竟然改到了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('成功的辨識紀錄不可修改', 'PASS', '');
  END;

  -- ══════════════════════════════════════════════════════
  -- 7. 清理候選：RAW
  -- ══════════════════════════════════════════════════════
  --
  -- 下面要「讓時間往前走」——把 submitted_at / updated_at 往回撥。
  -- writing_submissions 的不可變 trigger 會擋下這種修改（那正是它的職責），
  -- 所以測試期間先停用它，最後再打開。這是測試手法，不是產品行為。
  EXECUTE 'ALTER TABLE writing_submissions DISABLE TRIGGER trg_writing_submissions_guard_immutable';
  EXECUTE 'ALTER TABLE writing_ocr_runs DISABLE TRIGGER trg_writing_ocr_runs_guard_final';

  -- 剛送出（12 小時緩衝內）不該出現
  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('RAW', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('剛送出的原檔不在清理名單（12 小時緩衝）',
            CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '');

  -- 把送出時間往回撥 13 小時
  UPDATE writing_submissions SET submitted_at = now() - interval '13 hours' WHERE id = v_essay;
  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('RAW', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('條件齊備的原檔會被列為候選（2 頁）',
            CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END, '列出 ' || v_int || ' 筆');

  -- 封存圖沒驗證過 → 不可刪原檔
  UPDATE writing_images SET archive_verified_at = NULL WHERE essay_id = v_essay AND page_number = 1;
  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('RAW', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('🛑 封存圖未驗證 → 原檔不可刪',
            CASE WHEN v_int = 1 THEN 'PASS' ELSE 'FAIL' END, '列出 ' || v_int || ' 筆（應為 1）');
  UPDATE writing_images SET archive_verified_at = now() WHERE essay_id = v_essay AND page_number = 1;

  -- 沒有成功的辨識 → 不可刪原檔
  UPDATE writing_ocr_runs SET status = 'FAILED', error_code = 'X', raw_text = NULL
    WHERE essay_id = v_essay;
  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('RAW', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('🛑 沒有成功的辨識 → 原檔不可刪',
            CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '列出 ' || v_int || ' 筆');
  UPDATE writing_ocr_runs SET status = 'SUCCEEDED', error_code = NULL, raw_text = v_ocr_text
    WHERE essay_id = v_essay;

  -- 沒有正式文字 → 不可刪原檔
  DELETE FROM writing_texts WHERE essay_id = v_essay;
  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('RAW', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('🛑 沒有正式文字 → 原檔不可刪',
            CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '列出 ' || v_int || ' 筆');
  INSERT INTO writing_texts (essay_id, content, provenance, source_ocr_run_id, created_by)
    VALUES (v_essay, v_ocr_text, 'OCR', v_run, v_student);

  -- ══════════════════════════════════════════════════════
  -- 8. 標記刪除
  -- ══════════════════════════════════════════════════════
  SELECT writing_images_mark_deleted(
           ARRAY(SELECT c.image_id FROM writing_images_cleanup_candidates('RAW', 100) c
                  WHERE c.essay_id = v_essay),
           'writing-raw')
    INTO v_int;
  INSERT INTO t(name, verdict, detail)
    VALUES ('標記刪除回報筆數', CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END, '標記 ' || v_int || ' 筆');

  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('RAW', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('標記後不再出現在候選名單',
            CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT count(*) INTO v_int FROM writing_images
   WHERE essay_id = v_essay AND raw_deleted_at IS NOT NULL;
  INSERT INTO t(name, verdict, detail)
    VALUES ('原檔刪除後資料列仍在（頁序與尺寸保留）',
            CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END, '');

  -- ══════════════════════════════════════════════════════
  -- 9. 清理候選：ARCHIVE（60 天）
  -- ══════════════════════════════════════════════════════
  UPDATE writing_submissions SET submitted_at = now() - interval '59 days' WHERE id = v_essay;
  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('ARCHIVE', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('第 59 天：封存圖還不刪',
            CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '');

  UPDATE writing_submissions SET submitted_at = now() - interval '61 days' WHERE id = v_essay;
  SELECT count(*) INTO v_int
    FROM writing_images_cleanup_candidates('ARCHIVE', 100) c WHERE c.essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('第 61 天：封存圖列入候選（2 頁）',
            CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END, '列出 ' || v_int || ' 筆');

  -- 刪掉封存圖之後，作文本身必須完全不受影響
  PERFORM writing_images_mark_deleted(
    ARRAY(SELECT c.image_id FROM writing_images_cleanup_candidates('ARCHIVE', 100) c
           WHERE c.essay_id = v_essay),
    'writing-archive');

  SELECT content = v_ocr_text INTO v_bool FROM writing_texts WHERE essay_id = v_essay;
  INSERT INTO t(name, verdict, detail)
    VALUES ('封存圖刪除後，作文文字完好',
            CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT count(*) INTO v_int FROM writing_ocr_runs WHERE essay_id = v_essay AND status = 'SUCCEEDED';
  INSERT INTO t(name, verdict, detail)
    VALUES ('封存圖刪除後，原始辨識文字仍在',
            CASE WHEN v_int >= 1 THEN 'PASS' ELSE 'FAIL' END, '');

  -- ══════════════════════════════════════════════════════
  -- 10. 清理候選：ABANDONED（草稿 30 天）
  -- ══════════════════════════════════════════════════════
  DECLARE
    v_draft UUID;
  BEGIN
    INSERT INTO writing_submissions (student_id, submission_type, title, status)
      VALUES (v_student, 'image', '放著沒動的草稿', 'DRAFT') RETURNING id INTO v_draft;
    INSERT INTO writing_images (essay_id, page_number, raw_path, state,
                                archive_path, archive_created_at, archive_verified_at)
      VALUES (v_draft, 1, v_student::text || '/' || v_draft::text || '/1.jpg', 'NORMALIZED',
              v_student::text || '/' || v_draft::text || '/1a.jpg', now(), now());

    UPDATE writing_submissions SET updated_at = now() - interval '29 days' WHERE id = v_draft;
    SELECT count(*) INTO v_int
      FROM writing_images_cleanup_candidates('ABANDONED', 100) c WHERE c.essay_id = v_draft;
    INSERT INTO t(name, verdict, detail)
      VALUES ('第 29 天的草稿不清理',
              CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '');

    UPDATE writing_submissions SET updated_at = now() - interval '31 days' WHERE id = v_draft;
    SELECT count(*) INTO v_int
      FROM writing_images_cleanup_candidates('ABANDONED', 100) c WHERE c.essay_id = v_draft;
    INSERT INTO t(name, verdict, detail)
      VALUES ('第 31 天的草稿：原檔與封存圖都列入（2 筆）',
              CASE WHEN v_int = 2 THEN 'PASS' ELSE 'FAIL' END, '列出 ' || v_int || ' 筆');

    -- 已送出的作文永遠不會被 ABANDONED 規則掃到
    SELECT count(*) INTO v_int
      FROM writing_images_cleanup_candidates('ABANDONED', 100) c WHERE c.essay_id = v_essay2;
    INSERT INTO t(name, verdict, detail)
      VALUES ('已送出的作文不受 ABANDONED 規則影響',
              CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, '');
  END;

  -- ══════════════════════════════════════════════════════
  -- 11. 清理函式只有伺服器可以呼叫
  -- ══════════════════════════════════════════════════════
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM writing_images_cleanup_candidates('RAW', 10);
    INSERT INTO t(name, verdict, detail)
      VALUES ('🛑 學生不能呼叫清理候選函式', 'FAIL', '竟然可以呼叫');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('🛑 學生不能呼叫清理候選函式', 'PASS', '');
  END;
  BEGIN
    PERFORM writing_images_mark_deleted(ARRAY[gen_random_uuid()], 'writing-raw');
    INSERT INTO t(name, verdict, detail)
      VALUES ('🛑 學生不能呼叫標記刪除函式', 'FAIL', '竟然可以呼叫');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('🛑 學生不能呼叫標記刪除函式', 'PASS', '');
  END;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET ROLE anon';
  BEGIN
    PERFORM writing_images_cleanup_candidates('RAW', 10);
    INSERT INTO t(name, verdict, detail) VALUES ('🛑 anon 不能呼叫清理候選函式', 'FAIL', '竟然可以呼叫');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('🛑 anon 不能呼叫清理候選函式', 'PASS', '');
  END;
  BEGIN
    PERFORM create_writing_image_draft('anon 的作文');
    INSERT INTO t(name, verdict, detail) VALUES ('🛑 anon 不能建立草稿', 'FAIL', '竟然可以呼叫');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('🛑 anon 不能建立草稿', 'PASS', '');
  END;
  EXECUTE 'RESET ROLE';

  -- ══════════════════════════════════════════════════════
  -- 12. 函式本身的安全屬性
  -- ══════════════════════════════════════════════════════
  SELECT bool_and(p.proconfig @> ARRAY['search_path=""'])
    INTO v_bool
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_writing_image_draft', 'register_writing_image',
                       'submit_writing_image_essay', 'writing_images_cleanup_candidates',
                       'writing_images_mark_deleted');
  INSERT INTO t(name, verdict, detail)
    VALUES ('五支函式都釘住 search_path',
            CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT bool_and(NOT p.prosecdef)
    INTO v_bool
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_writing_image_draft', 'register_writing_image',
                       'submit_writing_image_essay');
  INSERT INTO t(name, verdict, detail)
    VALUES ('學生用的三支是 SECURITY INVOKER（RLS 仍生效）',
            CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  SELECT bool_and(p.prosecdef)
    INTO v_bool
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('writing_images_cleanup_candidates', 'writing_images_mark_deleted');
  INSERT INTO t(name, verdict, detail)
    VALUES ('清理用的兩支是 SECURITY DEFINER',
            CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END, '');

  -- 把兩個不可變 trigger 裝回去，並確認它們真的還在守
  EXECUTE 'ALTER TABLE writing_submissions ENABLE TRIGGER trg_writing_submissions_guard_immutable';
  EXECUTE 'ALTER TABLE writing_ocr_runs ENABLE TRIGGER trg_writing_ocr_runs_guard_final';
  BEGIN
    UPDATE writing_submissions SET title = '偷改標題' WHERE id = v_essay2;
    INSERT INTO t(name, verdict, detail) VALUES ('送出後仍然不可修改', 'FAIL', '竟然改到了');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(name, verdict, detail) VALUES ('送出後仍然不可修改', 'PASS', '');
  END;

END;
$test$;

SELECT seq AS "#", name AS "項目", verdict AS "結果", detail AS "說明" FROM t ORDER BY seq;

SELECT
  count(*) FILTER (WHERE verdict = 'PASS') AS "PASS",
  count(*) FILTER (WHERE verdict = 'FAIL') AS "FAIL",
  CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0
       THEN '全部通過' ELSE '❌ 有失敗項目' END AS "結論"
FROM t;
