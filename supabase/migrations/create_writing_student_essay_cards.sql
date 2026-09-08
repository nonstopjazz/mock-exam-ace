-- =====================================================
-- Migration: writing_student_essay_cards() —— 學生作文列表（卡片版）
--
-- 為什麼要一支新的 RPC，而不是改前端的查詢：
--
--   目前 useEssayList() 走的是
--     from('writing_submissions').select('*, writing_texts(char_count, created_at)')
--   它拿得到標題、日期、字數，但【拿不到批改狀態】—— writing_analyses 的 RLS
--   只開放 admin 讀，學生讀不到自己那一列（這是刻意的：分析列裡有 provider /
--   model / error_detail / validation_issues，全都不該給學生看到）。
--   學生看得到的批改結果一律經過 writing_student_analysis() 策展。
--
--   卡片版面要在列表上就顯示「等待批改 / 批改中 / 已完成 + 等第」，若沿用舊查詢，
--   前端就得對每一篇各打一次 writing_student_analysis()，N 篇作文 N+1 次往返。
--   因此這裡補一支列表版的策展讀取函式，回傳的欄位是
--   writing_student_analysis() 已經允許學生看見的那個子集，不多一個欄位。
--
-- 安全模型（與 learn_student_tasks() 一致）：
--   · SECURITY DEFINER + SET search_path = ''
--   · 沒有 student_id 參數。過濾條件只有 auth.uid()，因此不存在「傳別人的 id」這種用法
--   · 未登入直接 42501，不回傳空陣列（空陣列會讓 UI 誤以為「這個人沒有作文」）
--   · 只 GRANT 給 authenticated；PUBLIC / anon 明確 REVOKE
--     （Supabase 的 ALTER DEFAULT PRIVILEGES 會自動把新函式的 EXECUTE 給
--      anon / authenticated / service_role，只 REVOKE FROM PUBLIC 是拿不掉的，
--      必須指名角色。）
--
-- 這份 migration 只新增一支唯讀函式：不建表、不改表、不動任何 RLS 政策。
-- =====================================================

-- 相依檢查：三張表都必須存在，否則大聲失敗。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'writing_analyses'
  ) THEN
    RAISE EXCEPTION 'writing_student_essay_cards 需要 public.writing_analyses，請先套用 create_writing_analyses.sql';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'writing_teacher_feedback'
  ) THEN
    RAISE EXCEPTION 'writing_student_essay_cards 需要 public.writing_teacher_feedback，請先套用 create_writing_teacher_feedback.sql';
  END IF;
END;
$$;


/**
 * 學生自己的作文列表，一列一張卡片。
 *
 * 回傳 JSONB 陣列（可能為空陣列 = 這個人真的還沒寫過作文）。每一筆：
 *
 *   essay_id, title, essay_topic, essay_date, submission_type,
 *   status            —— 提交狀態 DRAFT / SUBMITTED
 *   char_count        —— 目前文字的字數（append-only，取最新一列）
 *   submitted_at, created_at
 *   analysis_status   —— QUEUED / ANALYZING / ANALYZED / COMPLETED / FAILED，
 *                        還沒有人按過「開始分析」時為 NULL
 *   report_ready      —— analysis_status = 'COMPLETED'（沒有分析時為 false）
 *   overall_level     —— 只有 report_ready 才有值
 *   overall_headline  —— 只有 report_ready 才有值
 *   has_teacher_feedback
 *
 * 刻意【不】回傳：provider、model、error_detail、failed_pass、
 * validation_issues、requested_by、三軸內容。批改失敗在學生端只會呈現為
 * 一個狀態，不附任何技術細節 —— 與 writing_student_analysis() 的策展一致。
 */
CREATE OR REPLACE FUNCTION writing_student_essay_cards()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_rows JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'writing_student_essay_cards：需要登入' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
           jsonb_agg(row_to_json(c)::jsonb ORDER BY c.essay_date DESC, c.created_at DESC),
           '[]'::jsonb
         )
    INTO v_rows
    FROM (
      SELECT
        s.id AS essay_id,
        s.title,
        s.essay_topic,
        s.essay_date,
        s.submission_type,
        s.status,
        s.submitted_at,
        s.created_at,

        -- writing_texts 是 append-only，最新的一列才是目前的文字
        (SELECT t.char_count
           FROM public.writing_texts t
          WHERE t.essay_id = s.id
          ORDER BY t.created_at DESC
          LIMIT 1) AS char_count,

        a.status AS analysis_status,
        -- 沒有分析列時是 false，不是 NULL —— 讓 client 端不必處理三態
        coalesce(a.status = 'COMPLETED', false) AS report_ready,

        -- 綜合層欄位一律以 COMPLETED 為閘門，與 writing_student_analysis() 相同。
        -- 半完成的報告寧可不顯示，也不給學生一個會變動的等第。
        CASE WHEN a.status = 'COMPLETED'
             THEN a.overall_evaluation ->> 'level' END AS overall_level,
        CASE WHEN a.status = 'COMPLETED'
             THEN a.overall_evaluation ->> 'headline' END AS overall_headline,

        EXISTS (
          SELECT 1 FROM public.writing_teacher_feedback f
           WHERE f.essay_id = s.id
        ) AS has_teacher_feedback

      FROM public.writing_submissions s
      -- 最新一次分析。重新分析會插入新列（analysis_version+1），舊列保留，
      -- 列表只看最新的那一次。
      LEFT JOIN LATERAL (
        SELECT an.status, an.overall_evaluation
          FROM public.writing_analyses an
         WHERE an.essay_id = s.id
         ORDER BY an.analysis_version DESC
         LIMIT 1
      ) a ON true
     WHERE s.student_id = v_uid
    ) c;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION writing_student_essay_cards IS
  '學生自己的作文列表（卡片版）。過濾條件只有 auth.uid()，不接受 student_id 參數。批改結果經策展：等第與 headline 只在 COMPLETED 時提供，永不回傳 provider / model / error_detail / validation_issues。';

REVOKE ALL ON FUNCTION writing_student_essay_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_student_essay_cards() TO authenticated, service_role;
