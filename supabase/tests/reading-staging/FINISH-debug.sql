-- =====================================================
-- 「看結果」沒反應的診斷（唯讀）
--
-- 🟢 只要在 production 執行一次。執行模式：Run without RLS。
--
-- 這支只回答一個問題：reading_finish_session 到底有沒有跑完。
--   status = 'SUBMITTED'   → 跑完了，問題在前端／網路
--   status = 'IN_PROGRESS' → 沒跑完，問題在伺服器
--
-- 不呼叫任何 RPC，不寫入任何東西。
-- =====================================================

SELECT s.passage_id                                   AS "文章",
       s.status                                       AS "狀態",
       (SELECT count(*) FROM public.reading_attempts a
         WHERE a.session_id = s.id)                   AS "作答題數",
       to_char(s.started_at   AT TIME ZONE 'Asia/Taipei', 'MM-DD HH24:MI:SS') AS "開始",
       to_char(s.submitted_at AT TIME ZONE 'Asia/Taipei', 'MM-DD HH24:MI:SS') AS "收掉的時間",
       s.id                                           AS "session_id"
  FROM public.reading_sessions s
  JOIN auth.users u ON u.id = s.student_id
 WHERE u.email = 'nonstopjazz@gmail.com'
 ORDER BY s.started_at DESC
 LIMIT 5;
