-- =====================================================
-- 把學生導覽指到真正的頁面（正式環境）
--
-- 為什麼要這樣做：導覽的 label / path / enabled 存在
-- site_settings.navigation_tabs 這個 JSON 欄位裡，但 /admin/settings
-- 的後台只讓你改 label / enabled / order，【不能改 path】。
-- 所以重新指向只能走 SQL。
--
-- 改完【立刻生效，不需要重新部署】—— 前端每次載入都會讀這張表。
--
-- 🛑 沿用既有的 key（dashboard / essay），只換 label 與 path：
--    Navbar 的 iconMap 是用 key 對圖示的，換 key 會掉圖示。
--    dashboard → LayoutDashboard、essay → PenTool，正好合用。
--
-- 🛑 舊的 /dashboard 與 /essay 路由【保留】，只是從選單移除。
--    直接砍路由會讓任何既存連結變成 404。
-- =====================================================

-- ── 步驟 1：先看現況並留底 ─────────────────────────────
-- 把輸出整個複製下來存著，這就是你的回滾資料。
SELECT id,
       jsonb_pretty(navigation_tabs) AS 目前的導覽設定,
       current_phase,
       updated_at
  FROM site_settings
 WHERE id = 'gsat';


-- ── 步驟 2：套用變更 ───────────────────────────────────
-- coalesce 是必要的：某個 key 不存在時 `NULL || jsonb` 會得到 NULL，
-- 那會把整個 key 寫成 null 而不是新增它。
UPDATE site_settings
   SET navigation_tabs = navigation_tabs || jsonb_build_object(
         -- 1. 我的學習 —— 真實的學生首頁（任務 / 作文 / 字卡 / 紀錄）
         'dashboard',
           coalesce(navigation_tabs -> 'dashboard', '{}'::jsonb) || jsonb_build_object(
             'label', '我的學習', 'path', '/learn/student', 'enabled', true, 'order', 1),

         -- 2. 單字練習 —— 不變，只調順序
         'vocabulary',
           coalesce(navigation_tabs -> 'vocabulary', '{}'::jsonb) || jsonb_build_object(
             'enabled', true, 'order', 2),

         -- 3. 我的作文 —— 真正的提交與批改結果
         'essay',
           coalesce(navigation_tabs -> 'essay', '{}'::jsonb) || jsonb_build_object(
             'label', '我的作文', 'path', '/learn/student/writing', 'enabled', true, 'order', 3),

         -- 4. 學習專欄 —— 不變
         'blog',
           coalesce(navigation_tabs -> 'blog', '{}'::jsonb) || jsonb_build_object(
             'enabled', true, 'order', 4),

         -- 5. 學測模考 —— 沒有考卷，從選單移除（路由保留）
         'exams',
           coalesce(navigation_tabs -> 'exams', '{}'::jsonb) || jsonb_build_object(
             'enabled', false)
       ),
       updated_at = now()
 WHERE id = 'gsat';


-- ── 步驟 3：確認結果 ───────────────────────────────────
SELECT key                       AS 鍵,
       value ->> 'label'         AS 標籤,
       value ->> 'path'          AS 路徑,
       (value ->> 'enabled')::boolean AS 顯示,
       (value ->> 'order')::int  AS 順序
  FROM site_settings s,
       jsonb_each(s.navigation_tabs)
 WHERE s.id = 'gsat'
 ORDER BY (value ->> 'enabled')::boolean DESC, (value ->> 'order')::int;
