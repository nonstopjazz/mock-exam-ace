-- =====================================================
-- Lexical Model Phase 6：record_lexical_attempt() 與相容層
--
-- 🟢 只要在 production 執行一次。
--    前置：create_lexical_core.sql、create_lexical_progress.sql
--
-- 🛑 本次【沒有】發明新的 mastery / SRS 演算法。
--    下面兩支 compat 函式是把目前 src/store/vocabularyStore.ts 裡
--    那段 JavaScript 逐條搬到資料庫，數字、上下限、間隔表完全一樣。
--    差別只有：時間從 Unix 毫秒改成 TIMESTAMPTZ。
--
--    搬到後端的理由是規格要求「新資料寫入不得只靠前端 local state」
--    與「七個頁面不要再各自直接決定 mastery」，不是因為演算法要改。
-- =====================================================


-- =====================================================
-- 1. 相容間隔表 —— 對應 vocabularyStore.ts 的 SRS_INTERVALS
--
--   0: 0                          立即
--   1: 10 * 60 * 1000             10 分鐘
--   2: 1  * 24 * 60 * 60 * 1000   1 天
--   3: 3  * 24 * 60 * 60 * 1000   3 天
--   4: 7  * 24 * 60 * 60 * 1000   1 週
--   5: 14 * 24 * 60 * 60 * 1000   2 週
--   6: 30 * 24 * 60 * 60 * 1000   30 天
-- =====================================================

CREATE OR REPLACE FUNCTION lexical_compat_review_interval(p_mastery_level SMALLINT)
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_mastery_level
    WHEN 0 THEN INTERVAL '0'
    WHEN 1 THEN INTERVAL '10 minutes'
    WHEN 2 THEN INTERVAL '1 day'
    WHEN 3 THEN INTERVAL '3 days'
    WHEN 4 THEN INTERVAL '7 days'
    WHEN 5 THEN INTERVAL '14 days'
    WHEN 6 THEN INTERVAL '30 days'
    ELSE INTERVAL '0'
  END;
$$;

COMMENT ON FUNCTION lexical_compat_review_interval(SMALLINT) IS
  '相容層：逐條對應 src/store/vocabularyStore.ts 的 SRS_INTERVALS。這不是新演算法。';


-- =====================================================
-- 2. 相容升降規則 —— 對應 vocabularyStore.ts 的 updateWordProgress()
--
--   forgot          → max(0, 現值 - 2)
--   hard            → max(0, 現值 - 1)
--   easy 或 答對    → min(6, 現值 + 1)
--   其他（答錯）    → max(0, 現值 - 1)
--
-- ⚠️ 原本 JS 註解寫 forgot 是「Reset to level 1」，程式碼其實是 -2。
--    這裡照【程式碼】搬，不照註解 —— 相容層要相容的是實際行為。
-- =====================================================

CREATE OR REPLACE FUNCTION lexical_compat_next_mastery(
  p_current     SMALLINT,
  p_correct     BOOLEAN,
  p_self_rating TEXT
)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_self_rating = 'forgot'                        THEN greatest(0, p_current - 2)
    WHEN p_self_rating = 'hard'                          THEN greatest(0, p_current - 1)
    WHEN p_self_rating = 'easy' OR p_correct IS TRUE     THEN least(6,   p_current + 1)
    ELSE                                                      greatest(0, p_current - 1)
  END::SMALLINT;
$$;

COMMENT ON FUNCTION lexical_compat_next_mastery(SMALLINT, BOOLEAN, TEXT) IS
  '相容層：逐條對應 src/store/vocabularyStore.ts 的 updateWordProgress()。照程式碼搬，不照註解（forgot 實際是 -2 不是 reset to 1）。這不是新演算法。';


-- =====================================================
-- 3. record_lexical_attempt()
--
-- 七個 practice 頁面唯一的寫入入口。
--
-- 職責分離（規格 Phase 6）：
--   - attempt 一定寫（這是事實記錄）
--   - mastery 只在 p_apply_mastery = true 時才動
--     → 配對遊戲的誤點：寫 attempt、不動 mastery
--     → 翻卡曝光：寫 attempt、不動 mastery
--     → Mark as Known：寫 attempt（self_assessment）、動 mastery（保留舊行為）
--
-- 解析方式二選一：
--   (a) p_lexical_item_id 直接給
--   (b) p_legacy_source + p_legacy_id（'level_word' / 'pack_item'）
--       → 走 lexical_legacy_map 查。前端用這一種，省掉在瀏覽器快取
--         5,542 筆對照表。
--
-- 找不到對應時【不丟錯】，回 {recorded:false, reason:'UNMAPPED'}。
-- 練習頁面不能因為某個字還沒對應好就整個壞掉。
-- =====================================================

CREATE OR REPLACE FUNCTION record_lexical_attempt(
  p_exercise_type    TEXT,
  p_skill_dimension  TEXT,
  p_lexical_item_id  UUID    DEFAULT NULL,
  p_legacy_source    TEXT    DEFAULT NULL,
  p_legacy_id        TEXT    DEFAULT NULL,
  p_correct          BOOLEAN DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_attempt_count    INTEGER DEFAULT NULL,
  p_used_hint        BOOLEAN DEFAULT NULL,
  p_self_rating      TEXT    DEFAULT NULL,
  p_pack_id          UUID    DEFAULT NULL,
  p_assignment_id    UUID    DEFAULT NULL,
  p_session_id       UUID    DEFAULT NULL,
  p_metadata         JSONB   DEFAULT NULL,
  p_apply_mastery    BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student_id UUID;
  v_item_id    UUID;
  v_attempt_id UUID;
  v_current    SMALLINT := 0;
  v_next       SMALLINT;
  v_applied    BOOLEAN  := FALSE;
BEGIN
  v_student_id := auth.uid();
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'NOT_AUTHENTICATED');
  END IF;

  -- ── 解析 canonical item ────────────────────────────
  IF p_lexical_item_id IS NOT NULL THEN
    SELECT i.id INTO v_item_id
    FROM public.lexical_items i
    WHERE i.id = p_lexical_item_id;
  ELSIF p_legacy_source IS NOT NULL AND p_legacy_id IS NOT NULL THEN
    SELECT m.lexical_item_id INTO v_item_id
    FROM public.lexical_legacy_map m
    WHERE m.legacy_source = p_legacy_source
      AND m.legacy_id     = p_legacy_id;
  END IF;

  IF v_item_id IS NULL THEN
    -- 尚未對應（例如 manual_review_required 的 pack item）。
    -- 靜靜回報，不要讓練習頁面爆掉。
    RETURN jsonb_build_object('recorded', false, 'reason', 'UNMAPPED');
  END IF;

  -- ── 一律寫 attempt ─────────────────────────────────
  -- 先判斷這一次會不會動 mastery，好把結果一起寫進 affected_mastery。
  v_applied := p_apply_mastery
               AND (p_correct IS NOT NULL OR p_self_rating IS NOT NULL);

  INSERT INTO public.lexical_attempts (
    student_id, lexical_item_id, exercise_type, skill_dimension,
    correct, response_time_ms, attempt_count, used_hint, self_rating,
    pack_id, assignment_id, session_id, metadata, affected_mastery
  ) VALUES (
    v_student_id, v_item_id, p_exercise_type, p_skill_dimension,
    p_correct, p_response_time_ms, p_attempt_count, p_used_hint, p_self_rating,
    p_pack_id, p_assignment_id, p_session_id, p_metadata, v_applied
  )
  RETURNING id INTO v_attempt_id;

  -- ── mastery：只在該動的時候動 ───────────────────────
  IF NOT v_applied THEN
    RETURN jsonb_build_object(
      'recorded', true, 'attempt_id', v_attempt_id,
      'lexical_item_id', v_item_id, 'mastery_applied', false
    );
  END IF;

  SELECT m.mastery_level INTO v_current
  FROM public.student_lexical_mastery m
  WHERE m.student_id = v_student_id AND m.lexical_item_id = v_item_id;

  v_current := coalesce(v_current, 0::SMALLINT);
  v_next    := public.lexical_compat_next_mastery(v_current, p_correct, p_self_rating);

  INSERT INTO public.student_lexical_mastery AS m (
    student_id, lexical_item_id, mastery_level, next_review_at,
    review_count, correct_count, last_review_at
  ) VALUES (
    v_student_id, v_item_id, v_next,
    now() + public.lexical_compat_review_interval(v_next),
    1,
    CASE WHEN p_correct IS TRUE THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (student_id, lexical_item_id) DO UPDATE SET
    mastery_level  = v_next,
    next_review_at = now() + public.lexical_compat_review_interval(v_next),
    review_count   = m.review_count + 1,
    correct_count  = m.correct_count + CASE WHEN p_correct IS TRUE THEN 1 ELSE 0 END,
    last_review_at = now(),
    updated_at     = now();

  RETURN jsonb_build_object(
    'recorded', true, 'attempt_id', v_attempt_id,
    'lexical_item_id', v_item_id, 'mastery_applied', true,
    'mastery_level', v_next
  );
END;
$$;

COMMENT ON FUNCTION record_lexical_attempt(TEXT,TEXT,UUID,TEXT,TEXT,BOOLEAN,INTEGER,INTEGER,BOOLEAN,TEXT,UUID,UUID,UUID,JSONB,BOOLEAN) IS
  '七個 practice 頁面唯一的寫入入口。attempt 一定寫；mastery 只在 p_apply_mastery 且有客觀對錯或自評時才動，用的是 lexical_compat_* 兩支相容函式（＝既有前端公式）。找不到 legacy 對應時回 UNMAPPED 而不丟錯。';

REVOKE ALL ON FUNCTION record_lexical_attempt(TEXT,TEXT,UUID,TEXT,TEXT,BOOLEAN,INTEGER,INTEGER,BOOLEAN,TEXT,UUID,UUID,UUID,JSONB,BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_lexical_attempt(TEXT,TEXT,UUID,TEXT,TEXT,BOOLEAN,INTEGER,INTEGER,BOOLEAN,TEXT,UUID,UUID,UUID,JSONB,BOOLEAN)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION lexical_compat_review_interval(SMALLINT)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lexical_compat_next_mastery(SMALLINT,BOOLEAN,TEXT)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lexical_compat_review_interval(SMALLINT)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lexical_compat_next_mastery(SMALLINT,BOOLEAN,TEXT) TO authenticated, service_role;


-- =====================================================
-- 4. get_lexical_mastery_map()
--
-- 讓前端一次取回自己的熟練度（對照 get_all_word_progress()）。
-- Phase 1 還用不到，但留著讓之後的頁面不必直接查表。
-- =====================================================

CREATE OR REPLACE FUNCTION get_lexical_mastery_map()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student_id UUID;
  v_result     JSONB;
BEGIN
  v_student_id := auth.uid();
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'mastery', coalesce(jsonb_agg(jsonb_build_object(
      'lexical_item_id', m.lexical_item_id,
      'mastery_level',   m.mastery_level,
      'next_review_at',  m.next_review_at,
      'review_count',    m.review_count,
      'correct_count',   m.correct_count,
      'last_review_at',  m.last_review_at
    )), '[]'::jsonb)
  ) INTO v_result
  FROM public.student_lexical_mastery m
  WHERE m.student_id = v_student_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_lexical_mastery_map() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_lexical_mastery_map() TO authenticated, service_role;
