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
-- 一之二、分析內部又分成兩個階段，而且兩階段的失敗不可混為一談
--
--   Stage 1（四支平行、各自獨立驗證）
--     Pass 1  Writing Competency        全 23 個 skill
--     Pass 2  Writing Error             全 16 個 code
--     Pass 3a High-Score Feature H1–H3  全 17 個 feature
--     Pass 3b High-Score Feature H4–H5  全 12 個 feature
--
--   Stage 2（四支全部通過驗證之後才跑）
--     Pass 5  Synthesis  只產出 overall_evaluation / strengths / needs_work / next_steps
--
--   status           = Stage 1 的軸線分析生命週期
--     QUEUED → ANALYZING → ANALYZED → COMPLETED
--                        ↘ FAILED            ↘ FAILED
--     ANALYZED  = 四軸全部驗證通過並已寫入，但綜合層還沒完成
--     COMPLETED = 四軸 + 綜合都完成，學生報告才算 ready
--
--   synthesis_status = Stage 2 的生命週期，刻意獨立
--     PENDING → RUNNING → COMPLETED
--                       ↘ FAILED → RUNNING（可重試）
--
--   為什麼要拆開：Stage 1 是昂貴的四支呼叫，Stage 2 只是一支輕量摘要。
--   綜合層失敗【不得】丟掉四軸已驗證的結果，老師也不該為了重跑摘要而付
--   四支分析的代價。因此軸線資料在進入 ANALYZED 的那一刻就被資料庫凍結，
--   之後只有綜合層那四個欄位可以再被寫入。
--
--   綜合層的三條紅線（由 trigger 與 analysisContract.ts 共同守住）：
--     A. 綜合層不得產生任何新的 taxonomy finding
--     B. 綜合層不得覆寫或重新詮釋 Stage 1 的 canonical 結果
--     C. strengths / needs_work 必須引用 Stage 1 已驗證的 finding
--
--   綜合層失敗時，學生端看到的是「尚未完成、可重試」，
--   絕不會看到一個機械湊出來的假摘要。
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
--   Stage 1 任何一支 pass 驗證失敗 → status = FAILED，不得以 COMPLETED 發佈半套報告。
--   Stage 2 驗證失敗 → status 停在 ANALYZED、synthesis_status = FAILED。
--   四軸資料原封不動保留，老師可以只重跑綜合層，不必再付四支分析的代價。
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

  -- Stage 1 的生命週期。ANALYZED = 四軸都過了，但綜合層還沒完成。
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'ANALYZING', 'ANALYZED', 'COMPLETED', 'FAILED')),

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

  -- Stage 2：綜合層。摘要可以短，分析必須完整——上限只加在 next_steps（1–3 項）。
  -- 這四欄只有在 status = 'ANALYZED' 期間可以寫入；進入 COMPLETED 後永久凍結。
  overall_evaluation JSONB,
  strengths  JSONB,
  needs_work JSONB,
  next_steps JSONB,

  -- Stage 2 的生命週期，與 status 分開。綜合層失敗不等於軸線分析失敗。
  synthesis_status TEXT
    CHECK (synthesis_status IS NULL
           OR synthesis_status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  synthesis_started_at   TIMESTAMPTZ,
  synthesis_completed_at TIMESTAMPTZ,
  synthesis_failed_at    TIMESTAMPTZ,
  synthesis_error_detail TEXT,
  synthesis_validation_issues JSONB,
  synthesis_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (synthesis_attempt_count >= 0),

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


-- 同一篇作文同時間只能有一次分析在飛行中。ANALYZED 也算在內——它還欠一個綜合層。
-- COMPLETED / FAILED 不受限，才能保留歷次版本。
CREATE UNIQUE INDEX IF NOT EXISTS writing_analyses_one_active_per_essay
  ON writing_analyses (essay_id)
  WHERE status IN ('QUEUED', 'ANALYZING', 'ANALYZED');

-- 取某篇最新一次分析
CREATE INDEX IF NOT EXISTS idx_writing_analyses_latest
  ON writing_analyses (essay_id, analysis_version DESC);

-- 老師佇列：先看還沒跑完的
CREATE INDEX IF NOT EXISTS idx_writing_analyses_pending
  ON writing_analyses (status, requested_at)
  WHERE status IN ('QUEUED', 'ANALYZING', 'ANALYZED');


-- =====================================================
-- 不可修改保護
-- =====================================================

CREATE OR REPLACE FUNCTION writing_analyses_guard_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_axis_frozen BOOLEAN;
BEGIN
  -- 已完成的分析永久凍結：evidence 逐字引用當時的作文，就地改寫會讓證據與判斷脫節。
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION '已完成的分析不可修改；重新分析請插入新的一列（analysis_version + 1）'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'FAILED' THEN
    RAISE EXCEPTION '失敗的分析不可復活；請插入新的一列重跑' USING ERRCODE = '42501';
  END IF;

  -- 合法的 status 轉移，白名單。沒列出來的一律擋掉，而不是靠一條一條禁止規則。
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'QUEUED'    AND NEW.status IN ('ANALYZING', 'FAILED'))
      OR (OLD.status = 'ANALYZING' AND NEW.status IN ('ANALYZED', 'FAILED'))
      OR (OLD.status = 'ANALYZED'  AND NEW.status IN ('COMPLETED', 'FAILED'))
    ) THEN
      RAISE EXCEPTION '不合法的分析狀態轉移：% → %', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 這幾個欄位一旦寫下就是事實，不接受改寫。
  IF NEW.essay_id IS DISTINCT FROM OLD.essay_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.analysis_version IS DISTINCT FROM OLD.analysis_version THEN
    RAISE EXCEPTION 'essay_id / requested_by / requested_at / analysis_version 不可修改'
      USING ERRCODE = '42501';
  END IF;

  -- ── 紅線 B：綜合層不得覆寫或重新詮釋 Stage 1 的 canonical 結果 ──
  -- 一旦進入 ANALYZED，三軸資料就凍結。之後跑綜合層時，這條規則讓
  -- 「綜合層改寫了軸線結論」在資料庫層就不可能發生，而不是靠 prompt 拜託模型。
  v_axis_frozen := OLD.status IN ('ANALYZED', 'COMPLETED');
  IF v_axis_frozen AND (
       NEW.competency_analysis IS DISTINCT FROM OLD.competency_analysis
    OR NEW.error_analysis IS DISTINCT FROM OLD.error_analysis
    OR NEW.high_score_feature_analysis IS DISTINCT FROM OLD.high_score_feature_analysis
    OR NEW.taxonomy_version IS DISTINCT FROM OLD.taxonomy_version
  ) THEN
    RAISE EXCEPTION '四軸分析在 ANALYZED 之後即凍結；綜合層不得覆寫 canonical 結果'
      USING ERRCODE = '42501';
  END IF;

  -- 反過來，綜合層的產出只能在 ANALYZED 期間寫入。
  IF OLD.status <> 'ANALYZED' AND (
       NEW.overall_evaluation IS DISTINCT FROM OLD.overall_evaluation
    OR NEW.strengths  IS DISTINCT FROM OLD.strengths
    OR NEW.needs_work IS DISTINCT FROM OLD.needs_work
    OR NEW.next_steps IS DISTINCT FROM OLD.next_steps
  ) THEN
    RAISE EXCEPTION '綜合層結果只能在 status = ANALYZED 時寫入（目前為 %）', OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- 合法的 synthesis_status 轉移。FAILED → RUNNING 是刻意允許的：重試綜合層
  -- 不需要重跑四支昂貴的分析。
  IF NEW.synthesis_status IS DISTINCT FROM OLD.synthesis_status THEN
    IF NOT (
         (OLD.synthesis_status IS NULL      AND NEW.synthesis_status = 'PENDING')
      OR (OLD.synthesis_status = 'PENDING'  AND NEW.synthesis_status IN ('RUNNING', 'FAILED'))
      OR (OLD.synthesis_status = 'RUNNING'  AND NEW.synthesis_status IN ('COMPLETED', 'FAILED'))
      OR (OLD.synthesis_status = 'FAILED'   AND NEW.synthesis_status = 'RUNNING')
    ) THEN
      RAISE EXCEPTION '不合法的綜合層狀態轉移：% → %',
        coalesce(OLD.synthesis_status, 'NULL'), coalesce(NEW.synthesis_status, 'NULL')
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── 紅線 F：只有四軸有效【且】綜合層完成，報告才算 ready ──
  IF NEW.status = 'COMPLETED' THEN
    IF NEW.synthesis_status IS DISTINCT FROM 'COMPLETED' THEN
      RAISE EXCEPTION '綜合層尚未完成，不得標記為 COMPLETED（synthesis_status = %）',
        coalesce(NEW.synthesis_status, 'NULL') USING ERRCODE = '42501';
    END IF;
    IF NEW.competency_analysis IS NULL
       OR NEW.error_analysis IS NULL
       OR NEW.high_score_feature_analysis IS NULL
       OR NEW.overall_evaluation IS NULL
       OR NEW.next_steps IS NULL THEN
      RAISE EXCEPTION '三軸與綜合層必須全部齊備才能標記為 COMPLETED' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 進入 ANALYZED 代表四軸都通過驗證了——沒寫齊就不准宣稱。
  IF NEW.status = 'ANALYZED' AND OLD.status <> 'ANALYZED' THEN
    IF NEW.competency_analysis IS NULL
       OR NEW.error_analysis IS NULL
       OR NEW.high_score_feature_analysis IS NULL THEN
      RAISE EXCEPTION '四軸尚未全部寫入，不得標記為 ANALYZED' USING ERRCODE = '42501';
    END IF;
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

  -- 報告只有在四軸有效【且】綜合層完成時才算 ready。
  -- 未 ready 時綜合層四欄一律回傳 NULL：寧可讓 UI 顯示「還在產生」，
  -- 也不給學生看一個半套或機械湊出來的摘要。
  RETURN jsonb_build_object(
    'id',               v_row.id,
    'essay_id',         v_row.essay_id,
    'status',           v_row.status,
    'synthesis_status', v_row.synthesis_status,
    'report_ready',     (v_row.status = 'COMPLETED'),
    'analysis_version', v_row.analysis_version,
    'taxonomy_version', v_row.taxonomy_version,
    'requested_at',     v_row.requested_at,
    'completed_at',     v_row.completed_at,
    -- 四軸只要通過驗證就是可信的資料，即使綜合層還沒好也照常提供。
    'competency_analysis',         v_row.competency_analysis,
    'error_analysis',              v_row.error_analysis,
    'high_score_feature_analysis', v_row.high_score_feature_analysis,
    'overall_evaluation', CASE WHEN v_row.status = 'COMPLETED' THEN v_row.overall_evaluation END,
    'strengths',          CASE WHEN v_row.status = 'COMPLETED' THEN v_row.strengths END,
    'needs_work',         CASE WHEN v_row.status = 'COMPLETED' THEN v_row.needs_work END,
    'next_steps',         CASE WHEN v_row.status = 'COMPLETED' THEN v_row.next_steps END
  );
END;
$$;

COMMENT ON FUNCTION writing_student_analysis IS
  '學生讀自己作文的最新分析。report_ready 只有在四軸有效且綜合層完成時為 true；未 ready 時綜合層欄位一律 NULL。不回傳 provider / model / error_detail / validation_issues。非本人一律回傳 NULL。';

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
        a.attempt_count,
        a.synthesis_status,
        a.synthesis_error_detail,
        a.synthesis_attempt_count,
        (a.status = 'COMPLETED') AS report_ready
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

  -- 卡在 ANALYZED 而綜合層已經失敗的列：不擋住重跑，但也不丟掉它的四軸資料。
  -- 把它收成 FAILED（資料原封不動保留），再開新的一版。
  UPDATE public.writing_analyses a
     SET status = 'FAILED',
         failed_at = now(),
         failed_pass = 'synthesis',
         error_detail = coalesce(a.synthesis_error_detail, '綜合層失敗，已由重新分析取代')
   WHERE a.essay_id = p_essay_id
     AND a.status = 'ANALYZED'
     AND a.synthesis_status = 'FAILED';

  SELECT a.id INTO v_existing
    FROM public.writing_analyses a
   WHERE a.essay_id = p_essay_id AND a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
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


/**
 * 只重跑綜合層，不動已驗證的四軸資料。
 *
 * Stage 1 是四支昂貴的呼叫，Stage 2 只是一支輕量摘要。綜合層失敗時，老師應該
 * 能只重試那一支——這個函式把該列的 synthesis_status 推回 RUNNING，
 * 交給 api/analyze-writing.ts 的 synthesis-only 路徑接手。
 *
 * 三軸資料在 ANALYZED 之後由 trigger 凍結，所以重跑綜合層在資料庫層就不可能
 * 改寫 canonical 結果。
 */
CREATE OR REPLACE FUNCTION writing_retry_synthesis(p_analysis_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.writing_analyses%ROWTYPE;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_retry_synthesis：僅限管理員' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.writing_analyses a WHERE a.id = p_analysis_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這筆分析：%', p_analysis_id USING ERRCODE = '22023';
  END IF;

  IF v_row.status <> 'ANALYZED' THEN
    RAISE EXCEPTION '只有四軸已驗證完成（ANALYZED）的分析才能重跑綜合層，目前為 %', v_row.status
      USING ERRCODE = '22023';
  END IF;

  IF v_row.synthesis_status NOT IN ('FAILED', 'PENDING') THEN
    RAISE EXCEPTION '綜合層目前是 %，不需要重試', v_row.synthesis_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.writing_analyses
     SET synthesis_status = 'RUNNING',
         synthesis_started_at = now(),
         synthesis_attempt_count = synthesis_attempt_count + 1,
         synthesis_error_detail = NULL,
         synthesis_validation_issues = NULL
   WHERE id = p_analysis_id;

  RETURN p_analysis_id;
END;
$$;

COMMENT ON FUNCTION writing_retry_synthesis IS
  '只重跑綜合層，四軸已驗證的資料原封不動。僅限管理員。';

REVOKE ALL ON FUNCTION writing_retry_synthesis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION writing_retry_synthesis(UUID) TO authenticated, service_role;
