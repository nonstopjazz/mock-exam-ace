-- =====================================================
-- 影片長度自動補：從播放器讀回來的秒數寫進 duration_seconds
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_learn_courses.sql 那一整組與 add_learn_lesson_watch_tracking.sql。
--
--
-- 【為什麼需要】
--
--   duration_seconds 目前要管理員自己填。沒填就是 0，畫面顯示 0:00，
--   而且觀看門檻（duration × 90%）也會是 0——等於那支影片永遠不會被
--   判定為完成。
--
--   播放器知道真實長度。管理員預覽的時候順手讀回來寫進去就好。
--
--
-- 🛑 只有管理員能寫，而且這不是形式上的謹慎
--
--   duration_seconds 決定完成門檻。學生如果寫得動它，把它設成 1 秒，
--   每一支影片都會在開始播的瞬間完成——循序課的解鎖就整個失效了。
--
--   所以這支第一行就 learn_require_admin()。進度回報那支
--   （learn_lesson_progress_set）刻意【不】碰這個欄位。
--
-- 🛑 只在目前是 0 的時候填
--
--   已經有值就不動。一個在背景默默改資料的東西，比沒有那個東西更難信任——
--   管理員手動調過的數字不該被下一次預覽悄悄改回去。
--
--   影片換掉、長度變了要重新抓的話：在編輯畫面把秒數改成 0，再看一次。
--
-- 回滾：supabase/migrations/add_learn_lesson_duration_autofill.rollback.sql
-- =====================================================

CREATE OR REPLACE FUNCTION learn_admin_lesson_duration_set(
  p_lesson_id UUID,
  p_seconds   INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current INTEGER;
  v_secs    INTEGER;
BEGIN
  -- 🛑 這一行是這份 migration 最重要的一行。見檔頭。
  PERFORM public.learn_require_admin('learn_admin_lesson_duration_set');

  SELECT duration_seconds INTO v_current
    FROM public.learn_course_lessons WHERE id = p_lesson_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

  -- 播放器回報的是浮點數秒；四捨五入之後還要是個合理的值。
  -- 上限 24 小時：再長的不是課程影片，是壞掉的回報。
  v_secs := floor(coalesce(p_seconds, 0));
  IF v_secs <= 0 OR v_secs > 86400 THEN
    RAISE EXCEPTION '影片長度 % 秒不合理', v_secs USING ERRCODE = '22023';
  END IF;

  -- 已經有值就不動，並且如實說「沒有寫入」
  IF v_current > 0 THEN
    RETURN jsonb_build_object('updated', false, 'duration_seconds', v_current);
  END IF;

  UPDATE public.learn_course_lessons
     SET duration_seconds = v_secs, updated_at = now()
   WHERE id = p_lesson_id;

  RETURN jsonb_build_object('updated', true, 'duration_seconds', v_secs);
END;
$$;

COMMENT ON FUNCTION learn_admin_lesson_duration_set IS
  '把播放器讀到的影片長度寫進 duration_seconds。🛑 僅限管理員——這個欄位決定觀看完成門檻，學生寫得動就能讓每支影片瞬間完成。只在目前是 0 時填，不覆蓋手動設定的值。';

REVOKE ALL ON FUNCTION learn_admin_lesson_duration_set(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_admin_lesson_duration_set(UUID, INTEGER) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'learn_admin_lesson_duration_set'
      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])      AS "新函式（應為 1）",
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'learn_admin_lesson_duration_set'
      AND grantee IN ('anon', 'PUBLIC'))                               AS "🛑 anon 的授權（必須為 0）",
  -- 現在有幾支影片還沒填長度。管理員預覽過就會補上。
  (SELECT count(*) FROM public.learn_course_lessons
    WHERE duration_seconds = 0)                                        AS "還沒填長度的影片數";
