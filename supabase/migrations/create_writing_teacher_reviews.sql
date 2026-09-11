-- =====================================================
-- writing_teacher_reviews —— 老師「處理完了」這個明確動作
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- 為什麼需要這張表
-- ----------------
-- 現在的系統能回答兩件事：
--   「AI 分析完成了嗎」 → writing_analyses.status = 'COMPLETED'
--   「有沒有老師講評」   → writing_teacher_feedback 有沒有那一列
-- 但沒有任何東西能回答第三件：**「老師看過並處理完了嗎」**。
--
-- 這三件事不能互相代替：
--   • AI 完成 ≠ 老師處理完（AI 剛跑完，老師還沒看）
--   • 有講評 ≠ 處理完（可能寫到一半；也可能老師打算改在課堂上口頭講）
--   • 沒講評 ≠ 沒處理（講評是選填的，這是既有的產品決策）
--
-- 檢閱狀態【不得】從以下任何一件事推導出來：開啟頁面、捲動、AI 完成、
-- 有沒有講評。它只代表老師明確按下「完成檢閱」。這也是每日提醒判斷
-- 「還有幾篇待處理」的唯一依據——推導出來的狀態會讓提醒信說謊。
--
-- 為什麼是新表，不是在既有表上加欄位
-- --------------------------------
-- writing_submissions 送出後被 trigger 完全凍結，而且學生對自己的 DRAFT 列
-- 有 UPDATE 權——在那張表上放一個「老師檢閱」欄位，等於給學生一條自己標記
-- 已檢閱的路。writing_analyses 的 COMPLETED 列則是永久凍結的，改不動。
-- 新表可以從零鎖死，而且完全不碰任何既有物件。
--
-- 安全模型：比照 writing_teacher_feedback
--   • 這張表對所有角色都沒有任何 grant，唯一入口是下面那支 SECURITY DEFINER 函式
--   • RLS 啟用且刻意不建任何政策：萬一 grant 被誤加回來，RLS 還擋著
--   • 只有管理員能寫（函式內 is_admin() 把關，不是靠前端藏按鈕）
--   • 學生完全讀不到，也不需要讀——這是老師端的工作流狀態，不是學生的報告內容
--
-- v1 範圍：一篇作文一個布林事實（檢閱過 / 沒有）。不做歷程、不做多位老師、
-- 不做部分完成。
--
-- 回滾：supabase/migrations/create_writing_teacher_reviews.rollback.sql
-- =====================================================

-- 相依檢查：is_admin() 不存在時大聲失敗，而不是安靜地建出沒人守門的函式。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'writing_teacher_reviews 需要 public.is_admin()，請先建立它再套用這份 migration';
  END IF;
END;
$$;


CREATE TABLE IF NOT EXISTS writing_teacher_reviews (
  -- 一篇作文一列。取消檢閱 = 刪這一列，不是存一個 false。
  -- 這樣「待處理」的查詢就是單純的 NOT EXISTS，不必再區分 false 與缺列。
  essay_id UUID PRIMARY KEY REFERENCES writing_submissions(id) ON DELETE CASCADE,

  reviewed_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE writing_teacher_reviews IS
  '老師明確標記「這篇處理完了」。一篇一列，取消即刪列。不由開啟頁面、捲動、AI 完成或有無講評推導。每日提醒的「待處理」以這張表為唯一依據。';
COMMENT ON COLUMN writing_teacher_reviews.reviewed_by IS
  '按下完成檢閱的管理員。重新標記會覆寫成最後一位。';


-- =====================================================
-- 權限：誰都不給，唯一入口是下面那支函式
-- =====================================================

ALTER TABLE writing_teacher_reviews ENABLE ROW LEVEL SECURITY;

-- Supabase 的 ALTER DEFAULT PRIVILEGES 會把新表的 ALL 明確授予這三個角色，
-- 所以必須點名收回——REVOKE FROM PUBLIC 收不掉明確的角色授權。
REVOKE ALL ON TABLE writing_teacher_reviews FROM PUBLIC, anon, authenticated, service_role;

-- 刻意【不】建立任何 RLS 政策：沒有 grant 就進不來，有了政策反而多一條路。


-- =====================================================
-- 唯一的寫入路徑
-- =====================================================

/**
 * 標記或取消「已檢閱」。
 *
 * p_reviewed = true  → 寫入／覆寫該列
 * p_reviewed = false → 刪除該列
 *
 * 回傳現在的狀態（true = 已檢閱）。重複呼叫是冪等的。
 *
 * 只接受已送出的作文：草稿還沒到老師手上，標記它沒有意義，
 * 而且會讓「待處理」的計數出現一篇根本還看不到的作文。
 */
CREATE OR REPLACE FUNCTION writing_set_teacher_reviewed(
  p_essay_id UUID,
  p_reviewed BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- is_admin() 對未登入者回傳 NULL，不是 false。一律用 coalesce(...) IS NOT TRUE。
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_set_teacher_reviewed：僅限管理員' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.writing_submissions s
     WHERE s.id = p_essay_id AND s.status = 'SUBMITTED'
  ) THEN
    RAISE EXCEPTION '找不到這篇已送出的作文：%', p_essay_id USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_reviewed, true) THEN
    INSERT INTO public.writing_teacher_reviews (essay_id, reviewed_by, reviewed_at)
    VALUES (p_essay_id, v_uid, now())
    ON CONFLICT (essay_id) DO UPDATE
      SET reviewed_by = excluded.reviewed_by,
          reviewed_at = excluded.reviewed_at;
    RETURN true;
  END IF;

  DELETE FROM public.writing_teacher_reviews WHERE essay_id = p_essay_id;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION writing_set_teacher_reviewed IS
  '標記／取消「老師已檢閱」。僅限管理員，冪等。取消即刪列，不存 false。';

REVOKE ALL ON FUNCTION writing_set_teacher_reviewed(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_set_teacher_reviewed(UUID, BOOLEAN) TO authenticated, service_role;
