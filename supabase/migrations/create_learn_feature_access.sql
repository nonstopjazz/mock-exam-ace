-- =====================================================
-- learn_feature_access —— 「這個功能開放給誰」
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
--
-- 為什麼需要一張新表
--
--   這個專案現在有兩種開關，兩種都不是這件事：
--
--     site_settings.home_features   首頁卡片要不要顯示。站台層級，全體一致，
--                                   而且刻意只能【關掉】，不能越過 Phase 打開。
--     premium_memberships           是不是付費會員。一個全域布林，
--                                   與「口說開放給誰」是兩件不同的事——
--                                   拿它來擋口說，等於把「付錢」和「有這堂課」
--                                   綁成同一件事，日後拆不開。
--
--   缺的是【逐功能 × 逐對象】的開放控制。這張表就是那個。
--
--
-- 🛑 預設是關的
--
--   沒有任何 grant = 沒有任何學生看得到。這是刻意的：
--   新功能預設不開放，要開放是一個明確的動作，不是忘了關的結果。
--   管理員永遠看得到（否則你沒辦法測試自己剛開的功能）。
--
--
-- 兩種授權對象，取聯集
--
--   class_id   整班開放。學生加入班級就自動有，不必回來補勾
--   student_id 個別開放。處理插班、試用、或不屬於任何班級的人
--
--   一列只能是其中一種（CHECK num_nonnulls = 1）。做成兩張表會讓
--   「這個人到底有沒有權限」要查兩次還要 union，沒有比較清楚。
--
-- 回滾：supabase/migrations/create_learn_feature_access.rollback.sql
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


CREATE TABLE IF NOT EXISTS learn_feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 功能代號。與 src/config/gatedFeatures.ts 的 key 一致。
  -- 刻意用 TEXT 而不是 enum：新增一個功能不該需要一份 migration。
  feature TEXT NOT NULL CHECK (length(btrim(feature)) > 0),

  class_id   UUID REFERENCES learn_classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id)   ON DELETE CASCADE,

  granted_by UUID NOT NULL REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,

  -- 一列只授權一種對象
  CONSTRAINT learn_feature_access_one_subject
    CHECK (num_nonnulls(class_id, student_id) = 1)
);

COMMENT ON TABLE learn_feature_access IS
  '逐功能的開放對象（班級或個別學生，取聯集）。沒有任何列 = 沒有學生看得到；管理員不受此表限制。';

-- 同一個功能對同一個對象只授權一次。兩個部分唯一索引，因為其中一欄一定是 NULL。
CREATE UNIQUE INDEX IF NOT EXISTS learn_feature_access_class_unique
  ON learn_feature_access (feature, class_id) WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS learn_feature_access_student_unique
  ON learn_feature_access (feature, student_id) WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS learn_feature_access_feature_idx
  ON learn_feature_access (feature);


-- =====================================================
-- 權限：誰都不給，全部走函式
-- =====================================================

ALTER TABLE learn_feature_access ENABLE ROW LEVEL SECURITY;

-- Supabase 的 ALTER DEFAULT PRIVILEGES 會把新表的 ALL 明確授予這三個角色，
-- 所以必須點名收回——REVOKE FROM PUBLIC 收不掉明確的角色授權。
REVOKE ALL ON TABLE learn_feature_access FROM PUBLIC, anon, authenticated, service_role;

-- 刻意不建任何 RLS 政策：沒有 grant 就進不來，有了政策反而多一條路。
--
-- ⚠️ 學生【不能】直接讀這張表。能讀就等於能看到「誰有權限、哪些班在用」，
--    那是班級名冊層級的資訊。學生只透過 learn_feature_enabled() 問
--    「我有沒有」，那支只回傳一個布林。


-- =====================================================
-- 學生端：我有沒有這個功能
-- =====================================================

/**
 * 目前登入的人能不能用這個功能。
 *
 * 判斷順序：
 *   1. 管理員 → 永遠 true（否則你沒辦法測試自己剛開的功能）
 *   2. 未登入 → false
 *   3. 有個別授權 → true
 *   4. 屬於任何一個被授權的【啟用中】班級 → true
 *   5. 其他 → false
 *
 * 🛑 這支只回傳布林。不回傳「為什麼」、不回傳「還有誰有」——
 *    那些是管理端的資訊，不該從學生端問得出來。
 *
 * ⚠️ 前端的路由守衛會呼叫它，但那只是體驗。真正的把關必須由每一支
 *    資料 RPC 自己再做一次（見 create_speaking_rpcs.sql）——
 *    藏起來的頁面仍然打得到 API。
 */
CREATE OR REPLACE FUNCTION learn_feature_enabled(p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF coalesce(public.is_admin(), false) IS TRUE THEN
    RETURN true;
  END IF;
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.learn_feature_access a
     WHERE a.feature = p_feature
       AND a.student_id = v_uid
  ) OR EXISTS (
    SELECT 1
      FROM public.learn_feature_access a
      JOIN public.learn_class_members m ON m.class_id = a.class_id
      JOIN public.learn_classes c       ON c.id = a.class_id
     WHERE a.feature = p_feature
       AND m.student_id = v_uid
       AND c.status = 'ACTIVE'
  );
END;
$$;

COMMENT ON FUNCTION learn_feature_enabled IS
  '目前登入者能不能用某個功能。管理員永遠 true；其餘看個別授權或所屬啟用中班級的授權。只回傳布林，不透露任何名冊資訊。';

REVOKE ALL ON FUNCTION learn_feature_enabled(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_feature_enabled(TEXT) TO authenticated, service_role;


-- =====================================================
-- 管理端：看目前開放給誰、改開放對象
-- =====================================================

/**
 * 某個功能的開放狀況：所有啟用中班級（含是否已授權、人數）、個別授權的學生，
 * 以及實際看得到的總人數。/admin 的開放對象頁一次載入。
 *
 * reach 是【去重後】的實際人數：一個學生同時被班級與個別授權只算一次。
 * 這個數字是管理員真正關心的——「到底幾個人看得到」。
 */
CREATE OR REPLACE FUNCTION learn_admin_feature_access(p_feature TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.learn_require_admin('learn_admin_feature_access');

  SELECT jsonb_build_object(
    'feature', p_feature,
    'classes', (
      SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.name), '[]'::jsonb)
        FROM (
          SELECT c.id AS class_id,
                 c.name,
                 (SELECT count(*) FROM public.learn_class_members m WHERE m.class_id = c.id)::int
                   AS member_count,
                 EXISTS (SELECT 1 FROM public.learn_feature_access a
                          WHERE a.feature = p_feature AND a.class_id = c.id) AS granted
            FROM public.learn_classes c
           WHERE c.status = 'ACTIVE'
        ) x
    ),
    'students', (
      SELECT coalesce(jsonb_agg(row_to_json(y)::jsonb ORDER BY y.name), '[]'::jsonb)
        FROM (
          SELECT a.student_id,
                 public.learn_display_name(a.student_id) AS name,
                 a.granted_at,
                 a.note
            FROM public.learn_feature_access a
           WHERE a.feature = p_feature AND a.student_id IS NOT NULL
        ) y
    ),
    -- 去重：班級與個別授權重疊的人只算一次
    'reach', (
      SELECT count(*)::int FROM (
        SELECT a.student_id AS uid
          FROM public.learn_feature_access a
         WHERE a.feature = p_feature AND a.student_id IS NOT NULL
        UNION
        SELECT m.student_id
          FROM public.learn_feature_access a
          JOIN public.learn_class_members m ON m.class_id = a.class_id
          JOIN public.learn_classes c       ON c.id = a.class_id
         WHERE a.feature = p_feature AND c.status = 'ACTIVE'
      ) u
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION learn_admin_feature_access IS
  '某功能的開放狀況：啟用中班級（含是否授權）、個別授權學生、去重後的實際觸及人數。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_feature_access(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_feature_access(TEXT) TO authenticated, service_role;


/**
 * 開放或收回。p_granted = true 授權、false 收回。
 *
 * 恰好指定一個對象（班級或學生）。冪等：重複授權不會產生第二列，
 * 重複收回也不會報錯——管理員連按兩下是常態，不該變成錯誤訊息。
 */
CREATE OR REPLACE FUNCTION learn_admin_set_feature_access(
  p_feature TEXT,
  p_class_id UUID DEFAULT NULL,
  p_student_id UUID DEFAULT NULL,
  p_granted BOOLEAN DEFAULT true,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  PERFORM public.learn_require_admin('learn_admin_set_feature_access');

  IF num_nonnulls(p_class_id, p_student_id) <> 1 THEN
    RAISE EXCEPTION '必須指定一個班級或一位學生（只能其中一個）' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_feature), '') = '' THEN
    RAISE EXCEPTION '缺少功能代號' USING ERRCODE = '22023';
  END IF;

  IF NOT coalesce(p_granted, true) THEN
    DELETE FROM public.learn_feature_access a
     WHERE a.feature = p_feature
       AND a.class_id IS NOT DISTINCT FROM p_class_id
       AND a.student_id IS NOT DISTINCT FROM p_student_id;
    RETURN false;
  END IF;

  -- 目標不存在就不要建立一個指向空氣的授權。
  IF p_class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.learn_classes c WHERE c.id = p_class_id
  ) THEN
    RAISE EXCEPTION '找不到這個班級' USING ERRCODE = '22023';
  END IF;
  IF p_student_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p_student_id
  ) THEN
    RAISE EXCEPTION '找不到這位學生' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.learn_feature_access (feature, class_id, student_id, granted_by, note)
  VALUES (p_feature, p_class_id, p_student_id, v_uid, p_note)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION learn_admin_set_feature_access IS
  '開放或收回某功能給一個班級或一位學生。冪等。僅限管理員。';

REVOKE ALL ON FUNCTION learn_admin_set_feature_access(TEXT, UUID, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_set_feature_access(TEXT, UUID, UUID, BOOLEAN, TEXT)
  TO authenticated, service_role;
