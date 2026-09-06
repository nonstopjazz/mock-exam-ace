-- =====================================================
-- writing_teacher_feedback —— 老師的選填講評
--
-- 產品定位（2026-09-06 決策）
-- ---------------------------
-- AI 分析完成後學生【立即】看得到報告。老師講評是額外的人味層，
-- **不是發布關卡**：沒有講評不會擋住、也不會延後 AI 報告。
-- 老師也可以完全不寫，改在課堂上口頭講——那是這個產品主要的人味交付方式。
--
-- 為什麼是新表，而不是在 writing_submissions 加欄位
-- ------------------------------------------------
-- writing_submissions 是既有的正式環境表，帶著 5 條 RLS 政策，其中包含
-- 學生對自己的列的寫入權。在那張表上加一個 teacher_feedback 欄位，等於讓
-- 學生有機會自己寫「老師講評」——欄位層級的權限無法在不動既有政策的前提下
-- 保證擋住。新表可以從零開始鎖死，而且完全不碰任何既有物件。
--
-- 安全模型（比照 writing_analyses，只有更嚴）
-- ------------------------------------------
--   • 這張表【對所有角色都沒有任何 grant】。anon / authenticated / service_role
--     都碰不到它——唯一的存取路徑是下面兩支 SECURITY DEFINER 函式。
--   • RLS 仍然啟用且沒有任何政策：萬一哪天 grant 被誤加回來，RLS 還擋著。
--   • 寫入僅限管理員（函式內 is_admin() 把關，不是靠前端藏按鈕）。
--   • 學生只能讀自己那篇作文的講評；別人的一律回 NULL。
--   • 學生不能新增、修改、刪除——他們連能寫入的函式都不能執行。
--
-- v1 範圍：一篇作文一則當前講評（essay_id UNIQUE）。不做版本歷史、
-- 不做行內註解、不做富文本、不做審核流程。
--
-- 回滾：supabase/migrations/create_writing_teacher_feedback.rollback.sql
-- =====================================================

-- 相依檢查：is_admin() 不存在時大聲失敗，而不是安靜地建出沒人守門的函式。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'writing_teacher_feedback 需要 public.is_admin()，請先建立它再套用這份 migration';
  END IF;
END;
$$;


CREATE TABLE IF NOT EXISTS writing_teacher_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 一篇作文一則當前講評。要改就是覆寫同一列。
  essay_id UUID NOT NULL UNIQUE REFERENCES writing_submissions(id) ON DELETE CASCADE,

  -- 老師寫的內容。純文字，不是富文本。
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),

  -- 誰寫的。學生端會顯示這個人的 display_name。
  author_id UUID NOT NULL REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE writing_teacher_feedback IS
  '老師對某一篇作文的選填講評。不是發布關卡——沒有講評不影響 AI 報告對學生可見。一篇作文一則。';
COMMENT ON COLUMN writing_teacher_feedback.body IS
  '純文字。CHECK 保證非空白：要「清除講評」請直接刪列（由 writing_upsert_teacher_feedback 處理），而不是存一列空字串。';

CREATE INDEX IF NOT EXISTS writing_teacher_feedback_essay_idx
  ON writing_teacher_feedback(essay_id);


-- updated_at 由資料庫維護，不信任呼叫端傳進來的值。
CREATE OR REPLACE FUNCTION writing_teacher_feedback_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  -- created_at 與 essay_id 是事實，不接受改寫。
  NEW.created_at := OLD.created_at;
  NEW.essay_id   := OLD.essay_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS writing_teacher_feedback_touch_trigger ON writing_teacher_feedback;
CREATE TRIGGER writing_teacher_feedback_touch_trigger
  BEFORE UPDATE ON writing_teacher_feedback
  FOR EACH ROW EXECUTE FUNCTION writing_teacher_feedback_touch();


-- =====================================================
-- 權限：誰都不給，全部走 SECURITY DEFINER 函式
-- =====================================================

ALTER TABLE writing_teacher_feedback ENABLE ROW LEVEL SECURITY;

-- Supabase 的 ALTER DEFAULT PRIVILEGES 會把新表的 ALL 明確授予這三個角色，
-- 所以必須點名收回——REVOKE FROM PUBLIC 收不掉明確的角色授權。
REVOKE ALL ON TABLE writing_teacher_feedback FROM PUBLIC, anon, authenticated, service_role;

-- 刻意【不】建立任何 RLS 政策：沒有 grant 就進不來，有了政策反而多一條路。


-- =====================================================
-- 寫入路徑：僅限管理員
-- =====================================================

/**
 * 新增或更新一篇作文的講評。body 給空白 = 刪除該列（清除講評）。
 *
 * 為什麼「清除」是刪列而不是存空字串：學生端的判斷是「有沒有這一則」，
 * 空字串會變成一個要在每一層都記得過濾的特例。沒有列 = 沒有講評，一致。
 */
CREATE OR REPLACE FUNCTION writing_upsert_teacher_feedback(p_essay_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_body TEXT := btrim(coalesce(p_body, ''));
  v_row  public.writing_teacher_feedback%ROWTYPE;
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_upsert_teacher_feedback：僅限管理員' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.writing_submissions s WHERE s.id = p_essay_id) THEN
    RAISE EXCEPTION '找不到這篇作文：%', p_essay_id USING ERRCODE = '22023';
  END IF;

  IF v_body = '' THEN
    DELETE FROM public.writing_teacher_feedback f WHERE f.essay_id = p_essay_id;
    RETURN jsonb_build_object('essay_id', p_essay_id, 'body', NULL, 'cleared', true);
  END IF;

  INSERT INTO public.writing_teacher_feedback (essay_id, body, author_id)
  VALUES (p_essay_id, v_body, v_uid)
  ON CONFLICT (essay_id) DO UPDATE
    SET body = EXCLUDED.body,
        author_id = EXCLUDED.author_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'essay_id',   v_row.essay_id,
    'body',       v_row.body,
    'updated_at', v_row.updated_at,
    'cleared',    false
  );
END;
$$;

COMMENT ON FUNCTION writing_upsert_teacher_feedback IS
  '新增／更新／清除某篇作文的老師講評。僅限管理員——這是資料庫層的保證，不是靠前端藏按鈕。body 空白代表清除。';

REVOKE ALL ON FUNCTION writing_upsert_teacher_feedback(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_upsert_teacher_feedback(UUID, TEXT) TO authenticated, service_role;


-- =====================================================
-- 讀取路徑：本人學生或管理員
-- =====================================================

/**
 * 讀一篇作文的老師講評。
 *
 * 兩種身分共用一支：回傳的內容完全相同（講評本來就是要給學生看的），
 * 所以不像分析那樣需要分成 student / admin 兩個版本。
 *
 * 沒有講評、或不是自己的作文，都回 NULL——學生端據此決定「整個區塊不顯示」。
 */
CREATE OR REPLACE FUNCTION writing_teacher_feedback_for(p_essay_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_row   public.writing_teacher_feedback%ROWTYPE;
  v_name  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'writing_teacher_feedback_for：需要登入' USING ERRCODE = '42501';
  END IF;

  -- 管理員可讀任何一篇；學生只能讀自己那篇。
  IF coalesce(public.is_admin(), false) IS NOT TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.writing_submissions s
        WHERE s.id = p_essay_id AND s.student_id = v_uid
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
    FROM public.writing_teacher_feedback f
   WHERE f.essay_id = p_essay_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT p.display_name INTO v_name
    FROM public.user_profiles p
   WHERE p.user_id = v_row.author_id;

  RETURN jsonb_build_object(
    'essay_id',    v_row.essay_id,
    'body',        v_row.body,
    'author_name', v_name,
    'created_at',  v_row.created_at,
    'updated_at',  v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION writing_teacher_feedback_for IS
  '讀某篇作文的老師講評。管理員可讀任何一篇，學生只能讀自己的；沒有講評或無權限一律回 NULL。不回傳 author_id。';

REVOKE ALL ON FUNCTION writing_teacher_feedback_for(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_teacher_feedback_for(UUID) TO authenticated, service_role;
