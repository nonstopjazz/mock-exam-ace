-- =====================================================
-- Migration: 建立 writing_analyses（寫作 AI 分析生命週期）
--
-- ⚠️ 命名前綴：正式環境的 Supabase 專案（ytzspnjmkvrkbztnaomm）是 mock 與 iLearn
--    共用的資料庫。所有寫作系統物件一律使用 writing_ 前綴，政策名稱一律以
--    「Writing:」開頭。理由與實測紀錄見 create_writing_texts.sql 檔頭。
--
--
-- 一、兩條獨立的狀態機（已核可的設計決策）
--
--   writing_submissions.status  = 提交生命週期（DRAFT → SUBMITTED），只此而已
--   writing_analyses.status     = AI 分析生命週期（QUEUED → ANALYZING → COMPLETED / FAILED）
--
--   兩者是各自獨立的 source of truth。學生看到的狀態是讀取時「推導」出來的，
--   不存在任何一張表裡，也不會有一個欄位同時代表兩件事。
--
--
-- 二、為什麼 COMPLETED 之後不可修改
--
--   分析結果裡的每一段 evidence 都逐字引用 writing_texts 當下的內容。
--   若已完成的分析可以就地改寫，學生看到的證據會與當初的判斷脫節，
--   而且不會有任何錯誤訊息。因此：
--     • COMPLETED 的列永久凍結（由 writing_analyses_guard_immutable() 強制）
--     • 重新分析 = 插入新的一列，analysis_version + 1
--     • 讀取時取該篇最新的一列 COMPLETED
--   這與 writing_texts 的 append-only 是同一個理由。
--
--
-- 三、為什麼有 validation_issues 這個欄位
--
--   每一支 pass 都必須回傳 canonical taxonomy 的【完整覆蓋】：
--   全部 23 個 Writing Competency skill、全部 16 個 Error code、
--   全部 29 個 High-Score Feature。
--
--   UNMEASURED  =  模型明確評估過該節點，判定本篇證據不足／該能力未被題目 elicit，
--                  並且寫出理由。
--   缺漏        =  模型根本沒有回傳該節點。
--
--   這兩件事永遠不可以互相取代。缺漏一律是 structured-output 驗證失敗，
--   由 api/analyze-writing.ts 重試或讓該 pass 失敗，【絕不】在伺服器端補成
--   UNMEASURED。validation_issues 保存失敗當下的完整缺漏清單，讓「AI 忘了分析」
--   永遠查得出來、而且永遠不會被誤讀成「學生沒有表現出來」。
--
--   任何一支 pass 驗證失敗 → 整筆分析標 FAILED，不得以 COMPLETED 發佈半套報告。
--
--
-- 四、權限模型
--
--   • anon / authenticated 對這張表【沒有任何直接權限】（REVOKE ALL）
--   • 學生只能透過 writing_student_analysis() 讀自己那篇的策展結果
--     （不含 provider / model / error_detail / validation_issues 等內部欄位）
--   • 老師／管理員透過 writing_admin_* 函式讀取與排入佇列
--   • 寫入只由 service_role 進行（Vercel 的 api/analyze-writing.ts）
--   • 學生無法觸發分析、無法寫入分析、無法修改已完成的分析——
--     這是資料庫層的保證，不是靠前端把按鈕藏起來
--
--   相依：public.is_admin()。正式環境已存在。
-- =====================================================

-- 相依檢查：is_admin() 不存在時大聲失敗，而不是安靜地建出一組沒人守門的函式。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'writing_analyses 需要 public.is_admin()，請先建立它再套用這份 migration';
  END IF;
END;
$$;


-- =====================================================
-- 表
-- =====================================================

CREATE TABLE IF NOT EXISTS writing_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id UUID NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'ANALYZING', 'COMPLETED', 'FAILED')),

  -- 誰按下「開始分析」。只可能是老師／管理員。
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at    TIMESTAMPTZ,

  -- 失敗時給老師看的一句話；不含 API key、不含 provider 原始回應。
  error_detail TEXT,
  -- 哪一支 pass 掛掉：competency / error / high_score_h1_h3 / high_score_h4_h5 / synthesis
  failed_pass  TEXT,
  -- 完整覆蓋驗證的缺漏清單（ValidationIssue[]）。診斷用，永不呈現給學生。
  validation_issues JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),

  provider TEXT NOT NULL DEFAULT 'deepseek',
  model TEXT,

  -- 分析當下使用的分類法版本。taxonomy 改版走 versioning（TR-17），舊報告照舊可讀。
  taxonomy_version TEXT NOT NULL DEFAULT 'writing-v1',
  -- 同一篇作文的第幾次分析。重新分析永遠是新的一列。
  analysis_version INTEGER NOT NULL DEFAULT 1 CHECK (analysis_version >= 1),

  -- 三軸。每一欄都是該軸【完整覆蓋】的結果，不是只有命中的項目。
  -- 形狀由 src/lib/writing/analysisContract.ts 定義並驗證。
  competency_analysis          JSONB,  -- 全 5 類 × 全 23 skill
  error_analysis               JSONB,  -- findings[] + 全 16 code 的 coverage[]
  high_score_feature_analysis  JSONB,  -- 全 29 feature

  -- 摘要層。摘要可以短，分析必須完整——上限只加在 next_steps（1–3 項）。
  overall_evaluation JSONB,
  strengths  JSONB,
  needs_work JSONB,
  next_steps JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE writing_analyses IS
  'AI 寫作分析的生命週期與結果。與 writing_submissions.status 是兩條獨立的狀態機。COMPLETED 後永久凍結，重新分析插入新列。';
COMMENT ON COLUMN writing_analyses.validation_issues IS
  '完整覆蓋驗證失敗時的缺漏清單。用來區分「模型判定 UNMEASURED」與「模型漏回傳節點」——後者永遠不得補成前者。';
COMMENT ON COLUMN writing_analyses.competency_analysis IS
  '全 23 個 Writing Competency skill 的狀態，含模型明確判定的 UNMEASURED 與其理由。';
COMMENT ON COLUMN writing_analyses.error_analysis IS
  'findings[] 為逐筆錯誤證據；coverage[] 必須列出全 16 個 error code，count = 0 代表本篇未發現此類錯誤（不代表已精熟）。';
COMMENT ON COLUMN writing_analyses.high_score_feature_analysis IS
  '全 29 個 High-Score Feature 的 quality。只有 EFFECTIVE 是 positive evidence（TR-05）；未出現不等於弱（TR-11）。';


-- 同一篇作文同時間只能有一次分析在跑。COMPLETED / FAILED 不受限，才能保留歷次版本。
CREATE UNIQUE INDEX IF NOT EXISTS writing_analyses_one_active_per_essay
  ON writing_analyses (essay_id)
  WHERE status IN ('QUEUED', 'ANALYZING');

-- 取某篇最新一次分析
CREATE INDEX IF NOT EXISTS idx_writing_analyses_latest
  ON writing_analyses (essay_id, analysis_version DESC);

-- 老師佇列：先看還沒跑完的
CREATE INDEX IF NOT EXISTS idx_writing_analyses_pending
  ON writing_analyses (status, requested_at)
  WHERE status IN ('QUEUED', 'ANALYZING');


-- =====================================================
-- 不可修改保護
-- =====================================================

CREATE OR REPLACE FUNCTION writing_analyses_guard_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 已完成的分析永久凍結：evidence 逐字引用當時的作文，就地改寫會讓證據與判斷脫節。
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION '已完成的分析不可修改；重新分析請插入新的一列（analysis_version + 1）'
      USING ERRCODE = '42501';
  END IF;

  -- 狀態只能往前走，不能倒回去。
  IF OLD.status = 'FAILED' AND NEW.status <> 'FAILED' THEN
    RAISE EXCEPTION '失敗的分析不可復活；請插入新的一列重跑' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'ANALYZING' AND NEW.status = 'QUEUED' THEN
    RAISE EXCEPTION '分析狀態不可從 ANALYZING 退回 QUEUED' USING ERRCODE = '42501';
  END IF;

  -- 這幾個欄位一旦寫下就是事實，不接受改寫。
  IF NEW.essay_id IS DISTINCT FROM OLD.essay_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.analysis_version IS DISTINCT FROM OLD.analysis_version THEN
    RAISE EXCEPTION 'essay_id / requested_by / requested_at / analysis_version 不可修改'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS writing_analyses_guard_immutable_trigger ON writing_analyses;
CREATE TRIGGER writing_analyses_guard_immutable_trigger
  BEFORE UPDATE ON writing_analyses
  FOR EACH ROW
  EXECUTE FUNCTION writing_analyses_guard_immutable();


-- =====================================================
-- 權限：一般使用者對這張表沒有任何直接管道
-- =====================================================

ALTER TABLE writing_analyses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON writing_analyses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON writing_analyses TO service_role;

-- RLS 開著但刻意不給 authenticated 任何 permissive policy：
-- 就算未來有人不小心把 GRANT 加回去，RLS 仍然擋住。兩層都要成立才進得來。
DROP POLICY IF EXISTS "Writing: service role manages analyses" ON writing_analyses;
CREATE POLICY "Writing: service role manages analyses"
  ON writing_analyses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =====================================================
-- 讀取路徑：學生
-- =====================================================

/**
 * 學生讀自己那篇作文的最新一次分析。
 *
 * 回傳的是策展過的內容：不含 provider / model / error_detail / validation_issues /
 * requested_by。學生看得到分析在跑（QUEUED / ANALYZING），看得到失敗（但只有一句
 * 「請告訴老師重新分析」），看得到完成的完整三軸結果。
 *
 * 找不到分析時回傳 NULL —— 這與「不是你的作文」在回應上不可區分，
 * 避免用這個函式探測別人的 essay_id 是否存在。
 */
CREATE OR REPLACE FUNCTION writing_student_analysis(p_essay_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.writing_analyses%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'writing_student_analysis：需要登入' USING ERRCODE = '42501';
  END IF;

  -- 擁有權：這篇作文必須是呼叫者自己的。
  IF NOT EXISTS (
    SELECT 1 FROM public.writing_submissions s
     WHERE s.id = p_essay_id AND s.student_id = v_uid
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id
   ORDER BY a.analysis_version DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',               v_row.id,
    'essay_id',         v_row.essay_id,
    'status',           v_row.status,
    'analysis_version', v_row.analysis_version,
    'taxonomy_version', v_row.taxonomy_version,
    'requested_at',     v_row.requested_at,
    'completed_at',     v_row.completed_at,
    'competency_analysis',         v_row.competency_analysis,
    'error_analysis',              v_row.error_analysis,
    'high_score_feature_analysis', v_row.high_score_feature_analysis,
    'overall_evaluation', v_row.overall_evaluation,
    'strengths',          v_row.strengths,
    'needs_work',         v_row.needs_work,
    'next_steps',         v_row.next_steps
  );
END;
$$;

COMMENT ON FUNCTION writing_student_analysis IS
  '學生讀自己作文的最新分析。不回傳 provider / model / error_detail / validation_issues。非本人一律回傳 NULL。';

REVOKE ALL ON FUNCTION writing_student_analysis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION writing_student_analysis(UUID) TO authenticated, service_role;


-- =====================================================
-- 讀取路徑：老師／管理員
-- =====================================================

/**
 * 批改佇列。老師需要知道是誰的作文才能批改，所以這裡確實回傳 student_id 與標題。
 * 每篇作文只帶最新一次分析的狀態；沒有分析過的作文 analysis_status 為 NULL。
 */
CREATE OR REPLACE FUNCTION writing_admin_queue()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- is_admin() 對未登入者回傳 NULL，不是 false。IF NOT is_admin() 不會成立，
  -- 因此一律用 coalesce(...) IS NOT TRUE。
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_queue：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.submitted_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        s.id            AS essay_id,
        s.student_id,
        s.title,
        s.essay_topic,
        s.essay_date,
        s.status        AS submission_status,
        s.submitted_at,
        t.char_count,
        a.id            AS analysis_id,
        a.status        AS analysis_status,
        a.analysis_version,
        a.requested_at  AS analysis_requested_at,
        a.completed_at  AS analysis_completed_at,
        a.failed_pass,
        a.error_detail,
        a.attempt_count
      FROM public.writing_submissions s
      LEFT JOIN LATERAL (
        SELECT wt.char_count
          FROM public.writing_texts wt
         WHERE wt.essay_id = s.id
         ORDER BY wt.created_at DESC
         LIMIT 1
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT wa.*
          FROM public.writing_analyses wa
         WHERE wa.essay_id = s.id
         ORDER BY wa.analysis_version DESC
         LIMIT 1
      ) a ON true
      WHERE s.status = 'SUBMITTED'
    ) q;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_queue IS
  '老師批改佇列：已送出的作文 + 最新一次分析狀態。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION writing_admin_queue() TO authenticated, service_role;


/** 管理員讀單篇的完整分析，含 error_detail 與 validation_issues 等診斷欄位。 */
CREATE OR REPLACE FUNCTION writing_admin_analysis(p_essay_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_admin_analysis：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.analysis_version DESC), '[]'::jsonb)
    INTO v_result
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_admin_analysis IS
  '管理員讀單篇作文的歷次分析（含診斷欄位）。僅限管理員。';

REVOKE ALL ON FUNCTION writing_admin_analysis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION writing_admin_analysis(UUID) TO authenticated, service_role;


-- =====================================================
-- 排入佇列：只有管理員做得到
-- =====================================================

/**
 * 建立一筆 QUEUED 分析。api/analyze-writing.ts 會在驗證 JWT 與 is_admin 之後呼叫，
 * 這裡再擋一次——授權不能只存在於應用層。
 *
 * 同一篇作文已經有 QUEUED / ANALYZING 時，回傳既有那一筆的 id 而不是報錯，
 * 讓重複點擊是冪等的。
 */
CREATE OR REPLACE FUNCTION writing_enqueue_analysis(p_essay_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing UUID;
  v_next INTEGER;
  v_id UUID;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_enqueue_analysis：僅限管理員' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.writing_submissions s
     WHERE s.id = p_essay_id AND s.status = 'SUBMITTED'
  ) THEN
    RAISE EXCEPTION '找不到這篇已送出的作文：%', p_essay_id USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.writing_texts t WHERE t.essay_id = p_essay_id
  ) THEN
    RAISE EXCEPTION '這篇作文沒有正規文字，無法分析：%', p_essay_id USING ERRCODE = '22023';
  END IF;

  SELECT a.id INTO v_existing
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id AND a.status IN ('QUEUED', 'ANALYZING')
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT coalesce(max(a.analysis_version), 0) + 1 INTO v_next
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id;

  INSERT INTO public.writing_analyses (essay_id, status, requested_by, analysis_version)
  VALUES (p_essay_id, 'QUEUED', v_uid, v_next)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION writing_enqueue_analysis IS
  '建立一筆 QUEUED 分析。僅限管理員——學生不得觸發 AI 分析，這是資料庫層的保證。重複呼叫為冪等。';

REVOKE ALL ON FUNCTION writing_enqueue_analysis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION writing_enqueue_analysis(UUID) TO authenticated, service_role;
