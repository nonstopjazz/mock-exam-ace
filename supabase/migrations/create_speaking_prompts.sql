-- =====================================================
-- speaking_prompts —— 口說題庫
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
--
-- 出處與差異
--
--   結構取自 ieltscoach-dashboard 的 speaking_prompts（IELTS Part 1/2/3 一張表、
--   欄位依 part 可為 NULL）。那個形狀是對的：三種 part 的差別只是哪些欄位有值，
--   拆三張表會讓「列出所有題目」變成 union。
--
--   權限模型【沒有】照抄。那邊是：
--     GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;
--     再用 RLS 政策擋住非管理員的寫入。
--
--   這裡改成本專案一貫的做法：表對所有角色零 grant，唯一入口是 SECURITY DEFINER
--   函式。理由是這個正式環境與 iLearn 共用資料庫，多給一份 grant 就多一條路，
--   而且 Supabase 的 ALTER DEFAULT PRIVILEGES 會自動把 ALL 授予 anon——
--   只靠 RLS 擋，等於把安全押在「政策永遠寫對」上。
--
--
-- 為什麼 part 1/2/3 的欄位可以是 NULL
--
--   Part 1 / 3  topic + question      （簡答、來回問答）
--   Part 2      title + cue + bullets （一張卡片，準備 1 分鐘、講 2 分鐘）
--
--   CHECK 依 part 強制對應的欄位有值，所以「Part 2 沒有 cue」這種列建不出來。
--
-- 回滾：supabase/migrations/create_speaking_prompts.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'learn_require_admin'
  ) THEN
    RAISE EXCEPTION '需要 learn_require_admin()，請先套用 create_learn_classes_tasks.sql';
  END IF;
END;
$$;


CREATE TABLE IF NOT EXISTS speaking_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  part INTEGER NOT NULL CHECK (part IN (1, 2, 3)),

  -- Part 1 / 3
  topic    TEXT,
  question TEXT,

  -- Part 2
  title   TEXT,
  cue     TEXT,
  bullets TEXT[] NOT NULL DEFAULT '{}',

  -- 關掉的題目不再出現在學生的選單裡，但既有的練習紀錄仍然指得到它。
  -- 所以是停用，不是刪除。
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 依 part 強制該有的欄位。少了這個，畫面上會出現一張沒有題目的卡片，
  -- 而錯誤要到學生點進去才看得到。
  CONSTRAINT speaking_prompts_part_shape CHECK (
    (part IN (1, 3) AND length(btrim(coalesce(question, ''))) > 0)
    OR
    (part = 2 AND length(btrim(coalesce(title, ''))) > 0
             AND length(btrim(coalesce(cue, ''))) > 0)
  )
);

COMMENT ON TABLE speaking_prompts IS
  '口說題庫。Part 1/3 用 topic + question，Part 2 用 title + cue + bullets。停用（is_active=false）不刪除，既有練習紀錄仍指得到。';
COMMENT ON COLUMN speaking_prompts.is_active IS
  'false = 不再出現在學生的選題畫面，但既有的 speaking_recordings 仍然引用得到。刪除題目請用停用。';

CREATE INDEX IF NOT EXISTS speaking_prompts_pick_idx
  ON speaking_prompts (part, sort_order, created_at) WHERE is_active;


-- updated_at 由資料庫維護，不信任呼叫端傳進來的值。
DROP TRIGGER IF EXISTS trg_speaking_prompts_touch ON speaking_prompts;
CREATE TRIGGER trg_speaking_prompts_touch
  BEFORE UPDATE ON speaking_prompts
  FOR EACH ROW EXECUTE FUNCTION learn_touch_updated_at();


-- =====================================================
-- 權限：零 grant，只走函式
-- =====================================================

ALTER TABLE speaking_prompts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE speaking_prompts FROM PUBLIC, anon, authenticated, service_role;


-- =====================================================
-- 學生端：可以選的題目
-- =====================================================

/**
 * 學生的選題清單。
 *
 * 🛑 這裡【自己做一次開放檢查】，不依賴前端有沒有把頁面藏起來。
 *    藏起來的頁面仍然打得到 RPC；真正的把關必須在這裡。
 *
 * 只回傳啟用中的題目，而且不含 created_by / created_at 這些管理端欄位。
 */
CREATE OR REPLACE FUNCTION speaking_available_prompts(p_part INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF coalesce(public.learn_feature_enabled('speaking'), false) IS NOT TRUE THEN
    RAISE EXCEPTION '口說練習尚未對你開放' USING ERRCODE = '42501';
  END IF;

  -- 明確列出要回傳的欄位（不是 row_to_json 整列）：排序用得到 sort_order 與
  -- created_at，但那兩個是管理端的資訊，不必給學生。
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'id', sp.id, 'part', sp.part,
             'topic', sp.topic, 'question', sp.question,
             'title', sp.title, 'cue', sp.cue, 'bullets', sp.bullets)
           ORDER BY sp.part, sp.sort_order, sp.created_at), '[]'::jsonb)
    INTO v_result
    FROM public.speaking_prompts sp
   WHERE sp.is_active
     AND (p_part IS NULL OR sp.part = p_part);

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION speaking_available_prompts IS
  '學生的選題清單（僅啟用中）。自行檢查 learn_feature_enabled(''speaking'')，不依賴前端隱藏頁面。';

REVOKE ALL ON FUNCTION speaking_available_prompts(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_available_prompts(INTEGER) TO authenticated, service_role;


-- =====================================================
-- 管理端：題庫維護
--
-- ⚠️ 「列出題庫」那一支（speaking_admin_prompts）不在這裡，在
--    create_speaking_rpcs.sql —— 它要附上每題被練習過幾次，
--    而 speaking_recordings 這時候還不存在。把它放這裡會造成循環相依。
-- =====================================================

/**
 * 新增或更新一題。p_id 為 NULL 就是新增。
 *
 * 欄位的形狀由表上的 CHECK 把關，這裡不重複驗證——驗兩次遲早會有一邊漏掉，
 * 而資料庫那一份是繞不過去的那一份。
 */
CREATE OR REPLACE FUNCTION speaking_admin_upsert_prompt(
  p_id UUID,
  p_part INTEGER,
  p_topic TEXT DEFAULT NULL,
  p_question TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_cue TEXT DEFAULT NULL,
  p_bullets TEXT[] DEFAULT '{}',
  p_is_active BOOLEAN DEFAULT true,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  PERFORM public.learn_require_admin('speaking_admin_upsert_prompt');

  IF p_id IS NULL THEN
    INSERT INTO public.speaking_prompts
      (part, topic, question, title, cue, bullets, is_active, sort_order, created_by)
    VALUES
      (p_part, nullif(btrim(coalesce(p_topic, '')), ''), nullif(btrim(coalesce(p_question, '')), ''),
       nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_cue, '')), ''),
       coalesce(p_bullets, '{}'), coalesce(p_is_active, true), coalesce(p_sort_order, 0), v_uid)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.speaking_prompts
     SET part = p_part,
         topic    = nullif(btrim(coalesce(p_topic, '')), ''),
         question = nullif(btrim(coalesce(p_question, '')), ''),
         title    = nullif(btrim(coalesce(p_title, '')), ''),
         cue      = nullif(btrim(coalesce(p_cue, '')), ''),
         bullets  = coalesce(p_bullets, '{}'),
         is_active  = coalesce(p_is_active, true),
         sort_order = coalesce(p_sort_order, 0)
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這一題：%', p_id USING ERRCODE = '22023';
  END IF;
  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION speaking_admin_upsert_prompt IS
  '新增（p_id NULL）或更新一題。欄位形狀由表上的 CHECK 把關。僅限管理員。';

REVOKE ALL ON FUNCTION speaking_admin_upsert_prompt(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION speaking_admin_upsert_prompt(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER)
  TO authenticated, service_role;
