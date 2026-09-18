-- =====================================================
-- 補版控：把已經在 production 手動執行過的安全修正寫進 repo
--
-- 🟢 這一份對 production 是 no-op —— 2026-09-16 已經手動跑過了。
--    它存在的理由是【紀錄】：那些改動原本只存在於 production 的當下狀態，
--    重建環境或有人再動一次 schema，它們就會消失，而且沒有人會發現。
--
-- 🔴 staging 還是要跑一次（那邊沒跑過）。整份是冪等的，重跑安全。
--
--
-- 背景：2026-09-13 Supabase 寄來 rls_disabled_in_public 的警告，稽核後發現
--       三件事。這個專案是 mock 與 iLearn 共用的，問題全部出在早期
--       Lovable／iLearn 留下的表，不是 supabase/migrations 管理的那 22 張
--       （那些一律「零 grant + 只走 SECURITY DEFINER 函式」）。
--
-- 每一段都用 to_regclass 守衛：這些表多半只在 production 存在，
-- 沒有守衛的話同一份 SQL 在 staging 會直接中止。
-- =====================================================


-- ─────────────────────────────────────────────────────
-- 一、兌換碼不再對未登入者公開
--
-- invite_tokens 與 tokens 都有 token 明文欄位，而政策是
--   USING (is_active = true) TO {public}
-- PostgreSQL 的 {public} 角色【包含 anon】，所以任何人拿公開的 anon key
-- 就能把所有有效的兌換碼列出來，然後自己兌換付費字卡包。
--
-- 刪掉那條政策是安全的：兌換走 claim_pack_with_token() 這支 RPC，
-- 而且 src/pages/ClaimPack.tsx 第 45 行就擋掉未登入者，沒有任何功能依賴它。
-- ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can validate tokens" ON public.invite_tokens;

DO $$
BEGIN
  IF to_regclass('public.tokens') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can read active tokens" ON public.tokens';
    -- tokens 這張 repo 完全沒查（可能是 invite_tokens 的前身），
    -- 所以不刪功能，只要求登入。
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'tokens'
         AND policyname = 'Logged in users can read active tokens'
    ) THEN
      EXECUTE 'CREATE POLICY "Logged in users can read active tokens" ON public.tokens
                 FOR SELECT TO authenticated USING (is_active = true)';
    END IF;
    RAISE NOTICE 'tokens：已改成要求登入';
  ELSE
    RAISE NOTICE 'tokens：這個環境沒有這張表，略過';
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────
-- 二、11 張 RLS 未啟用的遺留表，收回 anon 的權限
--
-- ⚠️ Supabase 的 ALTER DEFAULT PRIVILEGES 會自動把 ALL 授予
--    anon／authenticated／service_role。所以在那裡建一張表而沒有明確 REVOKE，
--    它預設就對 anon 開放讀寫刪 —— RLS 是唯一擋住它的東西，而這 11 張沒開。
--
-- 這一步【只收 anon，不動 authenticated、不開 RLS】：已登入的使用者完全
-- 不受影響，擋掉的只有未登入的人。RLS 要等確認沒人在用之後才開
-- （見 lock_down_dead_legacy_tables.sql）。
-- ─────────────────────────────────────────────────────

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'users', 'user_course_access', 'student_tasks', 'courses', 'course_lessons',
    'assignments', 'assignment_submissions', 'exam_types', 'exam_records',
    'learning_progress_stats', 'vocabulary_sessions'
  ];
  v_t TEXT;
  v_done TEXT[] := '{}';
  v_skipped TEXT[] := '{}';
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || quote_ident(v_t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_t);
      v_done := v_done || v_t;
    ELSE
      v_skipped := v_skipped || v_t;
    END IF;
  END LOOP;

  RAISE NOTICE '已收回 anon：% 張 → %',
    coalesce(array_length(v_done, 1), 0), coalesce(array_to_string(v_done, ', '), '（無）');
  RAISE NOTICE '這個環境沒有：% 張 → %',
    coalesce(array_length(v_skipped, 1), 0), coalesce(array_to_string(v_skipped, ', '), '（無）');
END;
$$;


-- ─────────────────────────────────────────────────────
-- 三、pg_stat_statements 不再對一般角色開放
--
-- 這兩個 view 記錄資料庫執行過的所有 SQL。參數值有被正規化（不洩漏實際
-- 資料），但會洩漏完整的表名、欄位名與查詢邏輯 —— 攻擊者不必猜表名。
-- 它本身不算嚴重，與上面兩項放在一起就是放大器。
--
-- authenticated 一起收：註冊是免費的，所以「只有登入者看得到」跟
-- 「所有人看得到」在這件事上沒有差別。
-- Supabase Dashboard 的查詢效能分析走 postgres 角色，不受影響。
-- ─────────────────────────────────────────────────────

DO $$
DECLARE
  v_views TEXT[] := ARRAY['pg_stat_statements', 'pg_stat_statements_info'];
  v_v TEXT;
  v_done TEXT[] := '{}';
BEGIN
  FOREACH v_v IN ARRAY v_views LOOP
    IF to_regclass('extensions.' || quote_ident(v_v)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON extensions.%I FROM anon, authenticated', v_v);
      v_done := v_done || v_v;
    END IF;
  END LOOP;
  RAISE NOTICE 'pg_stat_statements：已收回 % 個', coalesce(array_length(v_done, 1), 0);
END;
$$;
