# Staging 驗收 Runbook

> 依序執行。每一階段都有「預期結果」，對不上就停下來，不要往下走。
> 🛑 **這份文件到 staging 為止。不部署 Production。**

---

## 0. 前置條件

| 項目 | 說明 |
|---|---|
| Staging Supabase 專案 | **不是** 正式專案 `ytzspnjmkvrkbztnaomm` |
| 管理員帳號 | 🛑 **不要假設是哪一個 email。先跑階段 0 查出來。** 每個環境的 `is_admin()` 比對的 email 可能不同 |
| 學生帳號 | 至少 1 個（建議 2 個，才能驗證學生之間互相看不到） |
| Preview 部署 | 指向 staging Supabase |
| `DEEPSEEK_API_KEY` | 設在 Preview 環境。**你自己設定，不要貼給任何人** |
| 兩個瀏覽器工作階段 | 老師用一般視窗、學生用無痕視窗（或另一個瀏覽器設定檔），避免互相登出 |

`writing_submission` 旗標寫在 `src/config/features.ts`，值是 `enabled`，
**不是資料庫設定** —— staging 不需要另外開。

---

## 先分清楚三個環境

這份 runbook 牽涉三個環境。**「本機」不是 staging，也不是正式站** ——
它是一個裝在開發容器裡、測完就丟的暫時 PostgreSQL。

| 環境 | 是什麼 | 這次跑什麼 |
|---|---|---|
| **本機 PostgreSQL** | 開發容器裡的暫時資料庫，測完即丟 | 下面那四份安全測試（**已完成：48/48、19/19**） |
| **Staging Supabase** | 你的測試專案 | 唯讀 verify 腳本 + 未登入 HTTP 檢查 + 瀏覽器 E2E |
| **Production** | 正式站 | 這次**什麼都不跑** |

---

## 🛑 這四份 SQL：staging 不跑，Production 更不跑

```
tests/sql/learn_classes_security_test.sql
tests/sql/admin_rpc_authorization_test.sql
tests/sql/writing_analyses_security_test.sql
tests/sql/writing_teacher_feedback_security_test.sql
```

它們**只能在本機跑，而且已經跑完了**。這不是政策問題，是技術上跑不動：

1. **會 `INSERT INTO auth.users`。** 真正的 Supabase 裡 `auth.users.id` 沒有
   DEFAULT，這個 insert 會直接違反 NOT NULL 而失敗。就算能寫，在認證系統裡
   塞假帳號本身就是壞主意。
2. **需要一個「假的 `is_admin()`」。** 測試要在同一個交易裡切換三種身分
   （未登入 → 學生 → 管理員），所以本機把 `is_admin()` 換成讀 GUC 的替身。
   staging 上的 `is_admin()` 是真的那一支，它讀 `auth.uid()`，而 `auth.uid()`
   讀的是 JWT —— **你在 SQL Editor 裡沒辦法偽造 JWT**，身分永遠切不動，
   測試只會全部走同一條路徑然後噴一堆看不懂的錯。
3. **會真的寫入** `premium_memberships`、`learn_*`，留下垃圾資料。

### 那 staging 上怎麼驗證安全性？

**用真的 JWT 走真的路徑**，這就是階段 3.2 與階段 4 存在的理由：

- **階段 3.2** —— 未登入的 HTTP 請求打四支 admin RPC。SQL Editor 是以資料庫
  擁有者身分執行的，天生看不出 PostgREST 對 `anon` 的行為；只有真的發一個
  沒有 JWT 的請求才算數。
- **階段 4** —— 老師與學生各自登入、各自帶著真的 JWT，驗證「學生看不到別人的
  作業」「學生按不到老師的確認鍵」。

### 那 `nonstopjazz@gmail.com` 這個 admin 帳號是幹嘛的？

**跟上面四份 SQL 完全無關。** 它是給**階段 4 用滑鼠點**的 —— 你要能登入
`/admin/classes` 建班級、加學生、指派作業、批改作文。`is_admin()` 硬編碼比對
這個 email，staging 上沒有它，瀏覽器裡所有老師功能都點不了。

一句話：**admin 帳號是給人用滑鼠點的，那四份 SQL 是給本機資料庫跑的，
兩件事沒有交集。**

---

## 階段 0 — 先確認「這個環境的管理員是誰」

🛑 **在建立任何帳號之前先做這一步。**

這個專案有【兩套彼此不相通】的管理員判斷，兩套都要成立老師端才會通：

| | 機制 | 判斷依據 |
|---|---|---|
| **[1] 前端閘門** | `RequireAdmin` → `useAdmin` | `app_admins` 表裡有沒有你的 `user_id` |
| **[2] 資料庫閘門** | `is_admin()` | `auth.users.email` 是否等於**該環境硬編碼的那個 email** |

而**每個環境硬編碼的 email 不一樣**。gsat-staging 用的是專屬的
staging 管理員帳號，**不是**正式站那個 —— 這是好做法，staging 的管理權
不該和正式站共用同一個 email。

在 staging 的 SQL Editor 跑（**完全唯讀**）：

```
tests/sql/diagnose_admin_identity.sql
```

看兩列：

- **`is_admin() 硬編碼比對的 email`** —— 這才是這個環境真正要的帳號
- **`★ 兩套機制是否都指向同一個帳號`** —— 顯示 ✅ 時，說明欄會告訴你是哪個帳號

用**那個**帳號登入，不要自己新建一個。多數環境早就有一個兩套都滿足的帳號了。

> ⚠️ 這一步是實戰教訓：先前照 repo migration 假設 staging 的管理員 email
> 與正式站相同，結果 staging 早已改成別的 email。新建帳號不但沒用，
> 還在 staging 多了一個沒有用途的帳號。**查，不要猜。**

沒有那個帳號的密碼時：Supabase Dashboard → Authentication → Users →
該使用者 → **直接設定新密碼**。不要走寄信重設 —— 測試用網域收不到信。

**通過條件**：用查出來的帳號登入 Preview 後，`/admin/classes` 打得開
（此時頁面會顯示「無法載入班級：Could not find the function
`public.learn_admin_classes`」—— 這是**正確的**，階段 2 還沒套用 migration。
能看到這行紅字就代表 `RequireAdmin` 已經放你進來了）。

---

## 階段 1 — 動任何東西之前的唯讀探測

（階段 0 確認完管理員身分之後再做這一步。）

在 staging 的 Supabase SQL Editor 依序貼上執行。**兩份都不寫入任何資料。**

### 1.1 `tests/sql/launch_surface_rpc_check.sql`

**gsat-staging 實測結果（2026-09-06）**：

| 函式 | anon可執行 | 守門有防NULL | 判讀 |
|---|---|---|---|
| `admin_get_all_users` | `t` | `f` | 🔴 破口存在 |
| `admin_get_user_stats` | `t` | `f` | 🔴 破口存在 |
| `admin_grant_premium` | `f` | `f` | ⚠️ 見下方 |
| `admin_revoke_premium` | `f` | `f` | ⚠️ 見下方 |

> ⚠️ **staging 與正式站不同**。稽核報告記載的是**正式站**的狀態
> （premium 兩支對 anon 開放）；staging 顯然已經收過權限。
>
> **但修補仍然必要**：兩支的「守門有防NULL」是 `f`，代表它們
> **仍然完全沒有授權分支**。anon 進不來，可是**任何已登入的學生**
> 都還能呼叫 `admin_grant_premium` 替自己開通 premium。
> 第二層擋住了，第一層還是空的。

`get_user_profile` / `get_user_stats` / `is_admin` / `upsert_user_profile`
顯示 ⚠️ 是**正常的** —— 它們本來就該讓未登入者呼叫（並在函式內回
`NOT_AUTHENTICATED`）。

`writing_*_guard_*` 那幾支是**觸發器函式**，顯示 ⚠️ 也是正常的：
直接呼叫它們會因為不在觸發器情境而報錯。與
`learn_touch_updated_at` 同一類，低風險，這次不處理。

`get_user_profile` / `is_admin` / `upsert_user_profile` 顯示 ⚠️ 是**正常的** ——
它們本來就該讓未登入者呼叫（並在函式內回 `NOT_AUTHENTICATED`）。

### 1.2 `tests/sql/launch_surface_rls_check.sql`

**gsat-staging 實測結果（2026-09-06）**：17 張表**沒有任何 🔴**。

- `learn_*` 五張、`writing_teacher_feedback` → 「不存在」（階段 2 才會建）
- `exam_attempts` → RLS ON、**anon 授權 0、authenticated 授權 1**，鎖得很乾淨
- `user_profiles` / `packs` / `pack_items` / `user_pack_claims` / `user_stats`
  / `exams` / `writing_submissions` / `writing_texts` → RLS ON + 政策

**🟡 已知的 staging 缺件（不是這次改動造成的）**

| 缺的東西 | 狀況 |
|---|---|
| `pack_item_progress` 表 | **repo 裡完全沒有它的 migration** —— 當初直接在正式站 Dashboard 建的，staging 從來沒有 |
| `get_all_word_progress()` | repo 有 migration，但 staging 沒套用（Console 會出現 `PGRST202` 404） |

也就是 **staging 的字卡後端本身就不完整**，與正式站有落差。
影響見階段 4.5。

🛑 **不要**為了補這個而在 staging 手動建 `pack_item_progress` ——
repo 裡沒有它的 DDL，只能用猜的，比缺一個百分比危險得多。

**若 `packs` / `user_pack_claims` / `user_stats` / `exam_attempts` 出現 🔴 RLS 關閉
—— 停下來回報，不要繼續。**

---

## 階段 2 — 套用 migration

**一次一支，每支跑完先確認沒有錯誤再跑下一支。**

| # | 檔案 | 回滾 |
|---|---|---|
| 1 | `fix_admin_rpc_authorization.sql` | `fix_admin_rpc_authorization.rollback.sql` |
| 2 | `create_writing_analyses.sql` | `create_writing_analyses.rollback.sql` |
| 3 | `add_writing_analyses_analyzed_at.sql` | `.rollback.sql` |
| 4 | `add_writing_analyses_telemetry.sql` | `.rollback.sql` |
| 5 | `add_writing_analyses_stage1_progress.sql` | `.rollback.sql` |
| 6 | `create_writing_teacher_feedback.sql` | `.rollback.sql` |
| 7 | `create_learn_classes_tasks.sql` | `.rollback.sql` |

第 1 支排最前面：這次上線會把真實學生的姓名、年級、學校寫進 `user_profiles`，
破口是既有的，但**曝險面是這次上線放大的**。

⚠️ **不要**套用 `create_writing_submissions.sql` / `create_writing_texts.sql` /
`create_user_profiles_table.sql` —— 那三張表在 staging 已經存在，重跑會覆蓋
既有定義。

> 這 7 支已在本機依同樣順序做過一次完整排練，全部乾淨套用。

---

## 階段 3 — 驗證

### 3.1 唯讀 SQL（Supabase SQL Editor）

| 腳本 | 預期 |
|---|---|
| `tests/sql/staging_writing_analyses_verify.sql` | **「全部通過」且 FAIL = 0**，`writing_analyses` **36 欄**。<br>⚠️ 分母**隨環境變動**：最後一項在 `writing_analyses` 已經有資料時會記成 `INFO` 而不是 `PASS`，分母就從 24 掉到 23。**看「全部通過」四個字，不要看數字。** |
| `tests/sql/learn_classes_verify.sql` | **16 / 16** |
| `tests/sql/launch_surface_rpc_check.sql` | 四支 admin RPC：「anon可執行」全 `f`、「守門有防NULL」全 `t` |
| `tests/sql/launch_surface_rls_check.sql` | 17 張表**沒有任何 🔴**，`learn_*` 與 `writing_analyses` / `writing_teacher_feedback` 顯示「✅ 零授權 + RLS」 |

`learn_classes_verify` 的第 16 項在**本機**會是 SKIP（本機沒有 writing 表），
在 staging 應該是 PASS，所以是 16/16 不是 15/15。

如果 `staging_writing_analyses_verify` 回報 32 / 33 / 34 欄，說明第 3～5 支
migration 有漏跑 —— 訊息本身會告訴你缺哪一支。

**gsat-staging 實測結果（2026-09-06，七支 migration 套用後）**

| 腳本 | 結果 |
|---|---|
| `staging_writing_analyses_verify.sql` | ✅ **23 / 23 全部通過**、36 欄（分母 23 是因為 `writing_analyses` 已有 15 列既有資料） |
| `learn_classes_verify.sql` | ✅ **16 / 16** |
| `launch_surface_rpc_check.sql` | ✅ 四支 admin RPC 全部 `anon可執行=f`、`守門有防NULL=t` |
| `launch_surface_rls_check.sql` | ✅ 17 張表無 🔴；`learn_*` 五張與 `writing_teacher_feedback` 皆「零授權 + RLS」 |

判讀欄出現 ℹ️ 的**觸發器函式**（`*_touch`、`*_guard_*`）不是問題：
它們回傳 `trigger`，PostgreSQL 直接拒絕被當一般函式呼叫
（`trigger functions can only be called as triggers`），
PostgREST 也不會把它們收進 schema cache，所以在 API 上根本不存在。

`get_user_profile` / `get_user_stats` / `is_admin` / `upsert_user_profile`
顯示 ⚠️ 同樣是刻意的 —— 它們本來就要讓未登入者呼叫，並在函式內回
`NOT_AUTHENTICATED`。

---

### 3.2 未登入 HTTP 檢查 —— **staging 上唯一能真正證明破口關上的方法**

SQL Editor 是以資料庫擁有者身分執行的，看不出 PostgREST 對 `anon` 的行為。
用**未登入**的 HTTP 請求打 staging，才是真的驗證。

在**無痕視窗**打開 staging 的前端，開 DevTools Console，貼上（`ANON_KEY` 用
staging 的 anon key —— 它本來就內建在 bundle 裡，不是機密；**service_role key
絕對不要用在這裡**）：

```js
const URL = 'https://<你的-staging-ref>.supabase.co';
const ANON = '<staging anon key>';
const call = (fn, body = {}) =>
  fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async r => [fn, r.status, (await r.text()).slice(0, 120)]);

Promise.all([
  call('admin_get_all_users'),
  call('admin_get_user_stats'),
  call('admin_grant_premium', { p_user_id: '00000000-0000-0000-0000-000000000000' }),
  call('admin_revoke_premium', { p_membership_id: '00000000-0000-0000-0000-000000000000' }),
]).then(r => console.table(r));
```

**預期：四列全部是 `401` 或 `403`**（PostgREST 因為沒有 EXECUTE 權限而拒絕）。

🔴 **任何一列回 `200` 就是驗收失敗**，尤其若 body 裡出現 email 或
`{"success":true}`。停下來回報。

---

## 階段 4 — 瀏覽器 E2E

依序做，後面的步驟依賴前面的資料。
**老師 = 一般視窗（`nonstopjazz@gmail.com`）；學生 = 無痕視窗。**

### 4.1 班級

| # | 動作 | 預期 |
|---|---|---|
| 1 | 老師開 `/admin` | 看得到「班級管理」與「作文批改」兩張卡 |
| 2 | 點進 `/admin/classes` | 空狀態「尚未建立任何班級」＋「點擊『新增班級』開始」 |
| 3 | 新增班級「週六 A 班」，下次上課日期填**下週某一天** | 卡片出現：0 位學生、顯示該日期 |
| 4 | 再新增一個「一對一 · 測試」不填日期 | 顯示「未排定上課日」，**不是**假日期 |
| 5 | 學生視窗直接打 `/admin/classes` | 被擋下（非管理員） |

### 4.2 名冊

| # | 動作 | 預期 |
|---|---|---|
| 1 | 進「週六 A 班」→「加入學生」 | 對話框開啟，顯示「請先輸入至少 2 個字」 |
| 2 | 只打 1 個字 | **維持**提示，不列出任何帳號 |
| 3 | 打學生 email 前 2～3 碼 | 出現該學生，顯示 email 與年級 |
| 4 | 勾選並加入 | 名冊出現該學生，**顯示姓名或 email 前段，不是 uuid** |
| 5 | 再搜尋同一位 | 顯示「已在班上」且不可勾選 |
| 6 | 把第 2 位學生也加入「一對一 · 測試」 | 驗證一人可屬多班 |

### 4.3 HOMEWORK

| # | 動作 | 預期 |
|---|---|---|
| 1 | 「新增作業」→ 標題「講義 P.20–25」→ 截止選「下次上課前」→ 指派給**全班** | 卡片顯示「下次上課前 · <日期> · N 位學生」，每位學生一列 |
| 2 | 再新增一筆，截止選「指定日期」，只勾**一位**學生 | 只有那位出現在列表 |
| 3 | 回班級頁頂端，把「下次上課」改成**再晚一週** | toast 顯示「N 筆『下次上課前』的作業一起移動」；第 1 筆日期跟著變，**第 2 筆不動** |
| 4 | 學生視窗開 `/learn/student/tasks` | 只看到指派給自己的；**看不到**只給別人的那一筆 |
| 5 | 學生點「我完成了」 | 狀態變「我已完成 · 待老師確認」 |
| 6 | 老師重新整理班級頁 | 該學生出現「學生已標記」徽章 |
| 7 | 老師點「部分完成」 | 學生端顯示「老師檢查：完成 50%」，**且學生端的自述按鈕消失** |
| 8 | 老師點「完成」 | 學生端顯示「老師已確認完成」 |

### 4.4 RECURRING

| # | 動作 | 預期 |
|---|---|---|
| 1 | 「新增練習」→「複習單字」→ 每天 1 次 → 全班 | 卡片顯示「每天 1 次」 |
| 2 | 學生端任務頁 → 常態練習區按 `+` | 進度變 `今天 1 / 1`、圓圈變勾、進度條滿 |
| 3 | 按 `−` | 回到 `0 / 1`，`−` 變成不可按 |
| 4 | 老師改成「每週 3 次」 | 學生端顯示「每週 3 次」、`本週 0 / 3` |
| 5 | 學生按 `+` 三次（同一天） | 顯示 `本週 3 / 3 · 已達成` |
| 6 | 老師看班級頁 | 該學生顯示「當期 3 / 3」 |

### 4.5 字卡

> 🟡 **staging 上這一段驗不完整。** `pack_item_progress` 表與
> `get_all_word_progress()` 在 staging 都不存在（見階段 1.2），
> 所以「已學習 %」會固定是 **0%**，Console 也會出現 `PGRST202` 404。
> **這是 staging 的環境缺件，不是這次改動的 bug。**
> 空狀態、字卡包清單、兌換流程仍然驗得到；進度百分比留到正式環境再驗。

| # | 動作 | staging 預期 |
|---|---|---|
| 1 | 用**沒有領過字卡包**的學生開 `/learn/student` | 我的字卡區顯示 **「尚未指派字卡」** ＋「前往字卡收藏」按鈕 |
| 2 | 老師在 `/admin/tokens` 產生兌換碼 | — |
| 3 | 學生兌換 | — |
| 4 | 學生重新整理 `/learn/student` | 出現真實字卡包封面與真實單字數；**`已學習 0%`（staging 預期如此）** |
| 5 | 做幾張字卡後回 Dashboard | staging：**百分比不會動**（缺 `pack_item_progress`）<br>正式環境：百分比應上升 ← **留到 Production 驗** |

### 4.6 模擬考成績

| # | 動作 | 預期 |
|---|---|---|
| 1 | 沒考過的學生看 Dashboard | 「最近的成績」顯示 **「還沒有測驗紀錄」** |
| 2 | 學生完整做完一份模擬考並**交卷** | — |
| 3 | 回 Dashboard | 出現該考卷**名稱**、總分、日期 |
| 4 | 檢查沒有任何「聽/說/讀/寫能力值」 | 只有考卷總分，**不得有**由題型分數換算出來的能力分數 |

> 若考卷名稱顯示成「模擬考」而不是真實名稱，代表 `exam_attempts → exams`
> 的外鍵 embed 失敗、走了退路查詢。**不是錯誤**，但請記下來。

### 4.7 Writing

| # | 動作 | 預期 |
|---|---|---|
| 1 | 學生 `/learn/student/writing/new` 貼一篇約 250 字英文作文並送出 | 狀態「等待老師批改」 |
| 2 | 老師 `/admin/writing` | 佇列出現該篇 |
| 3 | 老師點進去按「開始 AI 批改」**一次** | 進度文字出現；約 60～70 秒後完成 |
| 4 | 完成後 | 報告可讀（整體 / 值得肯定 / 需要處理 / 三軸摺疊），**不是原始 JSON** |
| 5 | 老師寫一段「老師講評」並儲存 | — |
| 6 | 學生開該篇報告 | 最上方出現「老師親筆」區塊；AI 內容分開標示 |
| 7 | 老師把講評清空儲存 | 學生端該區塊**整個消失**（不是空白框） |
| 8 | 學生回 Dashboard | 「最近的作文」卡出現，顯示整體評價 |
| 9 | **第二個學生**開第一個學生的作文網址 | 讀不到 |

若第 3 步失敗，在 SQL Editor 跑 `tests/sql/staging_writing_failure_probe.sql`
（唯讀）看 verdict 與 telemetry。

### 4.8 Student Dashboard 總驗

用**一個全新的、什麼都沒有的學生帳號**開 `/learn/student`：

| 區塊 | 預期 |
|---|---|
| 頁首 | 顯示該學生自己的名字（或 email 前段），**不是** Amy / Brian |
| 我的任務 | **「目前沒有新的任務」** —— 整張卡**不會消失** |
| 最近的作文 | 整張卡**不出現**（作文既有的 UX） |
| 我的學習表現 | **「尚未有足夠資料」**，**沒有**任何進度條 / 等級條 / 警示色 |
| 我的學習紀錄 | **「開始練習後，這裡會慢慢累積你的學習紀錄。」**，不是一排 0 |
| 我的字卡 | 「尚未指派字卡」 |
| 最近的成績 | 「還沒有測驗紀錄」 |
| 全頁 | **沒有**「示範資料」標籤、**沒有**學生切換器、**沒有**示範用途註腳 |

再用**有資料的**學生看同一頁，確認每一區都換成真資料。

最後三項：

- [ ] 未登入打 `/learn/student` → 被導去登入
- [ ] 未登入打 `/learn/parent`、`/learn/teacher/session` → 被擋下（已包進 `RequireAdmin`）
- [ ] 手機寬度看一遍 `/learn/student` 與 `/admin/classes` → 沒有橫向捲軸

---

## 驗收判定

**全部通過**才算 staging 驗收完成：

- [ ] 階段 0 已用 `diagnose_admin_identity.sql` 查出這個環境的管理員帳號，並成功登入
- [ ] 階段 1 兩份探測完成並記錄修補前狀態
- [ ] 階段 2 七支 migration 全部乾淨套用
- [ ] `staging_writing_analyses_verify.sql` → 顯示「全部通過」、FAIL = 0、36 欄
- [ ] `learn_classes_verify.sql` → 16 / 16
- [ ] `launch_surface_rpc_check.sql` → 四支 admin RPC 全 `f` / `t`
- [ ] `launch_surface_rls_check.sql` → 17 張表無 🔴
- [ ] 階段 3.2 未登入 HTTP 檢查 → 四列全 401/403
- [ ] 階段 4.1 ～ 4.8 全部符合預期

任何一項不符 —— 停下來回報，不要往 Production 走。

### 已知可接受的 staging 落差

這兩項**不算驗收失敗**，但要記錄，並在 Production 驗收時補驗：

- 字卡「已學習 %」固定 0%（staging 缺 `pack_item_progress`）
- Console 出現 `get_all_word_progress` 的 `PGRST202` 404（staging 缺該函式）

另外要補一支 migration 把 `pack_item_progress` 納入版本控制 ——
它目前只存在於正式站，repo 裡沒有 DDL。**這是上線後的工作，不擋這次驗收。**
