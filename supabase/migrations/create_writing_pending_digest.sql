-- =====================================================
-- 每日提醒需要的兩支：排程讀得到的待處理摘要 + 推播對象
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
-- 🔴 必須在 create_writing_queue_rpcs.sql 之後執行。
--
--
-- 問題：排程沒有身分
--
--   writing_queue_summary() 用 is_admin() 把關，而 is_admin() 讀的是 auth.uid()。
--   排程是以 service_role 執行的，auth.uid() 是 NULL，所以它【叫不動】那一支。
--
--   最糟的解法是讓排程自己用 service_role 去查表，把「什麼叫待處理」再寫一次。
--   那個定義一旦有兩份，徽章說 12 篇、提醒信說 9 篇，而且沒有人會發現哪一邊錯。
--
--   所以這裡把定義抽成一支【誰都叫不動】的內部函式，兩個入口各自帶自己的守門：
--
--     writing_pending_summary_internal()   定義本身。沒有任何角色有 EXECUTE。
--       ├─ writing_queue_summary()         老師用，is_admin() 把關
--       └─ writing_pending_digest()        排程用，只有 service_role 有 EXECUTE
--
--   兩個入口的輸出形狀完全相同，因為它們回傳的是同一支函式的結果。
--
--
-- 收件人為什麼用 email 陣列傳進來
--
--   正式環境的 is_admin() 是寫死比對單一 email 的，而且它只回答「現在這個人」，
--   沒辦法反過來列舉「有哪些人是管理員」。在這裡把那個 email 再寫一次，等於把
--   授權規則複製成兩份。改用呼叫端傳入（環境變數），規則只有一份，而且收件人
--   可以在 Vercel 改，不必動資料庫。
--
-- 回滾：supabase/migrations/create_writing_pending_digest.rollback.sql
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'writing_queue_summary'
  ) THEN
    RAISE EXCEPTION '需要 writing_queue_summary()，請先套用 create_writing_queue_rpcs.sql';
  END IF;
END;
$$;


-- =====================================================
-- 定義本身
-- =====================================================

/**
 * 「待老師處理」的唯一定義：
 *
 *     已送出 AND 有正規文字 AND 沒有檢閱紀錄
 *
 * 自動排除草稿、OCR 還沒成功的圖片作文、不完整的提交、以及已處理完的。
 *
 * ⚠️ 這一支【不做任何授權檢查】，所以它也【不給任何角色 EXECUTE】。
 *    唯一能叫它的是下面兩支 SECURITY DEFINER 的包裝——它們以函式擁有者的身分
 *    執行，而擁有者因為所有權本來就叫得動它。
 */
CREATE OR REPLACE FUNCTION writing_pending_summary_internal()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH pending AS (
    SELECT s.id, s.submitted_at, s.student_id, a.status AS analysis_status
      FROM public.writing_submissions s
      LEFT JOIN LATERAL (
        SELECT wa.status
          FROM public.writing_analyses wa
         WHERE wa.essay_id = s.id
         ORDER BY wa.analysis_version DESC
         LIMIT 1
      ) a ON true
     WHERE s.status = 'SUBMITTED'
       AND EXISTS (SELECT 1 FROM public.writing_texts t WHERE t.essay_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM public.writing_teacher_reviews r WHERE r.essay_id = s.id)
  ),
  by_class AS (
    SELECT c.id AS class_id, c.name, count(*)::int AS count
      FROM pending p
      JOIN public.learn_class_members m ON m.student_id = p.student_id
      JOIN public.learn_classes c ON c.id = m.class_id
     WHERE c.status = 'ACTIVE'
     GROUP BY c.id, c.name
  )
  SELECT jsonb_build_object(
    'pending_total', (SELECT count(*) FROM pending),
    'awaiting_analysis', (SELECT count(*) FROM pending
                           WHERE analysis_status IS NULL OR analysis_status = 'FAILED'),
    'queued',    (SELECT count(*) FROM pending WHERE analysis_status = 'QUEUED'),
    'analyzing', (SELECT count(*) FROM pending WHERE analysis_status IN ('ANALYZING', 'ANALYZED')),
    'failed',    (SELECT count(*) FROM pending WHERE analysis_status = 'FAILED'),
    'awaiting_review', (SELECT count(*) FROM pending WHERE analysis_status = 'COMPLETED'),
    'oldest_pending_at', (SELECT min(submitted_at) FROM pending),
    'unclassed', (SELECT count(*) FROM pending p
                   WHERE NOT EXISTS (
                     SELECT 1 FROM public.learn_class_members m
                       JOIN public.learn_classes c ON c.id = m.class_id
                      WHERE m.student_id = p.student_id AND c.status = 'ACTIVE')),
    'by_class', (SELECT coalesce(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.count DESC), '[]'::jsonb)
                   FROM by_class b),
    'worker_busy', EXISTS (
      SELECT 1 FROM public.writing_analyses a
       WHERE a.status IN ('QUEUED', 'ANALYZING', 'ANALYZED')
         AND a.lease_expires_at IS NOT NULL
         AND a.lease_expires_at > now()),
    'work_waiting', EXISTS (
      SELECT 1 FROM public.writing_analyses a
       WHERE (a.lease_expires_at IS NULL OR a.lease_expires_at <= now())
         AND (a.status IN ('QUEUED', 'ANALYZING')
              OR (a.status = 'ANALYZED'
                  AND coalesce(a.synthesis_status, 'PENDING') IN ('PENDING', 'RUNNING', 'FAILED'))))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION writing_pending_summary_internal IS
  '「待老師處理」的唯一定義。不做授權檢查，因此不給任何角色 EXECUTE——只有 writing_queue_summary() 與 writing_pending_digest() 這兩個帶守門的包裝叫得動它。';

-- 誰都不給。包裝函式以擁有者身分執行，靠所有權叫得動。
REVOKE ALL ON FUNCTION writing_pending_summary_internal() FROM PUBLIC, anon, authenticated, service_role;


-- =====================================================
-- 入口一：老師（沿用原本的名字與形狀，只是改成委派）
-- =====================================================

CREATE OR REPLACE FUNCTION writing_queue_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(public.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'writing_queue_summary：僅限管理員' USING ERRCODE = '42501';
  END IF;
  RETURN public.writing_pending_summary_internal();
END;
$$;

COMMENT ON FUNCTION writing_queue_summary IS
  '老師端的佇列概況。定義在 writing_pending_summary_internal()，與每日提醒讀的是同一支。僅限管理員。';

REVOKE ALL ON FUNCTION writing_queue_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_queue_summary() TO authenticated, service_role;


-- =====================================================
-- 入口二：排程
-- =====================================================

/**
 * 每日提醒讀的摘要。與老師看到的數字保證一致——它們是同一支函式的結果。
 * 只有 service_role 叫得動。
 */
CREATE OR REPLACE FUNCTION writing_pending_digest()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.writing_pending_summary_internal();
END;
$$;

COMMENT ON FUNCTION writing_pending_digest IS
  '每日提醒用的待處理摘要。與 writing_queue_summary() 讀同一支定義，數字不會對不起來。僅限 service_role。';

REVOKE ALL ON FUNCTION writing_pending_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_pending_digest() TO service_role;


-- =====================================================
-- 推播對象
-- =====================================================

/**
 * 依 email 找出這些人的推播訂閱。
 *
 * 為什麼不在這裡判斷「誰是管理員」：正式環境的 is_admin() 是寫死比對單一
 * email，而且只回答「現在這個人」，無法列舉。把那個 email 複製到這裡等於
 * 讓授權規則有兩份。改由呼叫端傳入（Vercel 的環境變數），規則只有一份。
 *
 * ⚠️ 這一支會回傳推播端點，那是可以用來發通知給某個人的東西。
 *    所以只有 service_role 叫得動，而且它只讀不寫。
 */
CREATE OR REPLACE FUNCTION writing_reminder_push_targets(p_emails TEXT[])
RETURNS TABLE (user_id UUID, endpoint TEXT, p256dh TEXT, auth TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_emails IS NULL OR array_length(p_emails, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT ps.user_id, ps.endpoint, ps.p256dh, ps.auth
      FROM public.push_subscriptions ps
      JOIN auth.users u ON u.id = ps.user_id
     WHERE lower(u.email) = ANY (SELECT lower(e) FROM unnest(p_emails) e);
END;
$$;

COMMENT ON FUNCTION writing_reminder_push_targets IS
  '依 email 取得推播訂閱，給每日作文提醒用。收件人由呼叫端（環境變數）決定，不在這裡重寫一次管理員判斷。僅限 service_role。';

REVOKE ALL ON FUNCTION writing_reminder_push_targets(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_reminder_push_targets(TEXT[]) TO service_role;
