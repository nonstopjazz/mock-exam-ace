-- 回滾 nav_repoint_student_entries.sql
--
-- 還原成改動前的樣子：dashboard → /dashboard、essay → /essay、
-- exams 重新顯示。
--
-- ⚠️ 如果你在改動之後又用 /admin/settings 調過導覽，這份會把那些調整
--    一併蓋掉。以步驟 1 留下來的那份輸出為準比較保險。

UPDATE site_settings
   SET navigation_tabs = navigation_tabs || jsonb_build_object(
         'dashboard',
           coalesce(navigation_tabs -> 'dashboard', '{}'::jsonb) || jsonb_build_object(
             'label', '學習儀表板', 'path', '/dashboard', 'enabled', true, 'order', 5),
         'essay',
           coalesce(navigation_tabs -> 'essay', '{}'::jsonb) || jsonb_build_object(
             'label', 'AI 作文批改', 'path', '/essay', 'enabled', true, 'order', 3),
         'exams',
           coalesce(navigation_tabs -> 'exams', '{}'::jsonb) || jsonb_build_object(
             'enabled', true, 'order', 2),
         'vocabulary',
           coalesce(navigation_tabs -> 'vocabulary', '{}'::jsonb) || jsonb_build_object(
             'order', 1),
         'blog',
           coalesce(navigation_tabs -> 'blog', '{}'::jsonb) || jsonb_build_object(
             'order', 4)
       ),
       updated_at = now()
 WHERE id = 'gsat';
