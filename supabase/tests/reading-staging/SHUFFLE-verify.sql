-- =====================================================
-- 選項亂序的實機驗證（唯讀）
--
-- 🟢 只要在 production 執行一次。執行模式：Run without RLS。
--    （reading_question_keys 與換算函式都沒有發給 authenticated，
--      Run with RLS 會失敗——而那正是我們要的。）
--
-- ⚠️ 要【先練過至少一篇】才有東西可以驗。沒有作答紀錄時回傳零列。
--
-- 這支做兩件事：
--   1. 把每一筆作答存下來的「顯示位置」換回原始標籤，重新跟答案表比對一次，
--      看 is_correct 是不是真的一致。不一致代表換算鏈某一段錯了——
--      而那種錯不會報錯，只會讓正確率默默偏掉。
--   2. 看正解實際落在哪些位置。題庫原本 B 佔 47.2%。
-- =====================================================

WITH checked AS (
  SELECT a.is_correct,
         public.reading_option_to_canonical(a.session_id, a.question_id, a.selected_answer)
           = k.correct_answer                                    AS recomputed,
         public.reading_option_to_display(a.session_id, a.question_id, k.correct_answer)
                                                                 AS right_pos
    FROM public.reading_attempts a
    JOIN public.reading_question_keys k ON k.question_id = a.question_id
)
SELECT count(*)                                        AS "作答筆數",
       count(*) FILTER (WHERE is_correct)              AS "系統記為答對",
       count(*) FILTER (WHERE recomputed)              AS "重新驗算為答對",
       -- 🛑 這一格必須是 true。false 代表計分與換算對不起來。
       coalesce(bool_and(is_correct = recomputed), true) AS "完全一致",
       (SELECT jsonb_object_agg(right_pos, n)
          FROM (SELECT right_pos, count(*) AS n FROM checked
                 GROUP BY right_pos ORDER BY right_pos) d)      AS "正解落點分布"
  FROM checked;
