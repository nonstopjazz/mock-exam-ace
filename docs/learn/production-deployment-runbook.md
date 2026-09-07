# 正式環境部署 Runbook

> 前提：**staging 驗收已通過**（見 `docs/learn/staging-acceptance-runbook.md`）。
> 每一步都有回滾點。任何一步不如預期就停下來，不要往下走。

---

## 0. 開始之前

| 項目 | 說明 |
|---|---|
| 專案 | 正式 Supabase 專案 `ytzspnjmkvrkbztnaomm` |
| 管理員 | `nonstopjazz@gmail.com`（已確認）。**兩套機制都要成立** —— 見階段 1 |
| 部署 | Vercel Production |
| `DEEPSEEK_API_KEY` | 設在 **Production** 環境。你自己設，不要貼給任何人 |
| `SUPABASE_SERVICE_ROLE_KEY` | 已存在 |
| `VITE_SITE_ID` | 掛在 `gsat.ilearn.blog` 就**不必設**（網域含 `gsat`）。<br>🔴 **若用 `*.vercel.app` 網址上線就必須設 `gsat`**，否則字卡永遠不顯示（見 followups §6） |
| 時間 | migration 本身數秒；含驗證與煙霧測試抓 40 分鐘 |

### 🛑 絕對不要在正式環境跑的 SQL

```
tests/sql/learn_classes_security_test.sql
tests/sql/admin_rpc_authorization_test.sql
tests/sql/writing_analyses_security_test.sql
tests/sql/writing_teacher_feedback_security_test.sql
```

本機專用。會 `INSERT INTO auth.users`、寫入 `premium_memberships`，
而且需要一個讀 GUC 的 `is_admin()` 替身。在正式站只會噴錯並留下垃圾資料。

### 🛑 絕對不要跑的 migration

```
supabase/migrations/create_user_profiles_table.sql      ← 會覆寫 is_admin()
supabase/migrations/create_writing_submissions.sql
supabase/migrations/create_writing_texts.sql
supabase/migrations/add_premium_memberships.sql         ← 會把 premium 破口放回去
```

這四張表／函式在正式站已經存在。重跑會覆蓋既有定義，
其中兩支會直接把已修好的安全漏洞還原回去。

---

## 階段 1 — 部署前檢查（唯讀）

在正式站的 SQL Editor 執行：

```
tests/sql/production_preflight.sql
```

**必須全部 PASS 才往下走。** 它檢查：

| 區塊 | 內容 |
|---|---|
| 1 前置 | `writing_submissions` / `writing_texts` / `user_profiles` / `premium_memberships` / `app_admins` 都在，`is_admin()` 存在 |
| 2 待建立 | 七張新表**還不存在**（已存在代表跑過了 → 只補跑缺的那幾支） |
| 3 管理員 | `is_admin()` 比對的 email、`auth.users` 有沒有、**`app_admins` 裡有沒有對應列** |
| 4 破口 | anon 目前對四支 admin RPC 的 EXECUTE 數（部署後要對照） |
| 5 爆炸半徑 | 回滾各支會刪掉多少資料 |

> ★ **第 3 區塊最後一項最重要。** staging 就是卡在這裡：email 對得上
> `is_admin()`，但 `app_admins` 沒有對應列，前端 `RequireAdmin` 直接擋下。
> 兩套機制必須都指向同一個帳號。

**把階段 1 的輸出留著** —— 階段 3 要拿它對照第 4 區塊的數字。

再跑一次基線探測，同樣唯讀：

```
tests/sql/launch_surface_rpc_check.sql
tests/sql/launch_surface_rls_check.sql
```

預期：四支 admin RPC 顯示 🔴（破口存在），`learn_*` 與
`writing_analyses` / `writing_teacher_feedback` 顯示「不存在」。

🔴 若 `packs` / `user_pack_claims` / `user_stats` / `exam_attempts`
出現 **RLS 關閉** —— 停下來，不要部署。

### 回滾點 1R

**沒有東西需要回滾。** 這個階段完全唯讀。

---

## 階段 2 — 套用 migration

**一次一支。每支跑完先確認沒有 ERROR，再跑下一支。**

路徑一律是 `supabase/migrations/`。

### 2-1 `fix_admin_rpc_authorization.sql`

修掉四支 admin RPC 的未登入破口。**排第一位**：這次上線會把真實學生的
姓名、年級、學校寫進 `user_profiles`，破口是既有的，但曝險面是這次上線放大的。

> ⚠️ 正式站的 `admin_grant_premium` / `admin_revoke_premium` 是
> **anon 可執行且完全沒有授權分支**（staging 已被收過權限，正式站沒有），
> 所以這支在正式站比在 staging 更重要。

**回滾點 2-1R** — `fix_admin_rpc_authorization.rollback.sql`
只還原授權（重新 GRANT 給 anon），**不還原**函式本體的守門修正。
🛑 執行它等於把「未登入可讀取全部使用者、可自行開通／撤銷 premium」放回去。
除非確認是這支造成了其他問題，否則不要跑。
**無資料損失。**

### 2-2 `create_writing_analyses.sql`

**回滾點 2-2R** — `create_writing_analyses.rollback.sql`
⚠️ **會 DROP TABLE，所有分析結果一併刪除且無法復原。**
執行前先確認損失：
```sql
SELECT count(*) FILTER (WHERE status = 'COMPLETED') AS 已完成,
       count(*)                                     AS 全部
  FROM writing_analyses;
```
剛部署完是 0，愈晚回滾損失愈大。

### 2-3 `add_writing_analyses_analyzed_at.sql`

**回滾點 2-3R** — 只移除一個量測欄位。
**無資料損失**（稽核報告的 Stage 1 耗時會退回舊的推導方式）。

### 2-4 `add_writing_analyses_telemetry.sql`

**回滾點 2-4R** — 只移除兩個量測欄位。
**無資料損失**（重試與期限中斷在資料庫裡變成不可見）。

### 2-5 `add_writing_analyses_stage1_progress.sql`

**回滾點 2-5R** — 只移除跨請求的進度欄位。
已完成分析的三軸結果不受影響；
⚠️ **正在進行中（ANALYZING）的分析會失去進度，必須整個重跑。**

### 2-6 `create_writing_teacher_feedback.sql`

**回滾點 2-6R** — ⚠️ **會刪掉所有已寫下的老師講評。**
剛部署完是 0 筆。

### 2-7 `create_learn_classes_tasks.sql`

**回滾點 2-7R** — ⚠️ **會刪掉所有班級、名冊、任務、指派與打卡紀錄。**
🛑 一旦你開始建班級、加學生、指派作業，這支的回滾成本就會急速上升。
**這是整個部署裡最不該回滾的一支** —— 有問題優先想「往前修」而不是往後退。

### 回滾順序

若要回滾多支，**一律逆序**：2-7R → 2-6R → 2-5R → 2-4R → 2-3R → 2-2R → 2-1R。
順序錯了會因為相依性而失敗（例如 `writing_teacher_feedback` 參照
`writing_submissions`，`learn_task_logs` 參照 `learn_task_assignees`）。

---

## 階段 3 — 部署後驗證（唯讀）

四份腳本，全部可以直接貼進 SQL Editor。

| 腳本 | 預期 |
|---|---|
| `tests/sql/staging_writing_analyses_verify.sql` | 顯示「**全部通過**」、FAIL = 0、`writing_analyses` **36 欄** |
| `tests/sql/learn_classes_verify.sql` | **16 / 16** |
| `tests/sql/launch_surface_rpc_check.sql` | 四支 admin RPC：`anon可執行 = f`、`守門有防NULL = t` |
| `tests/sql/launch_surface_rls_check.sql` | 17 張表**無 🔴**；`learn_*` 五張與 `writing_teacher_feedback` 顯示「零授權 + RLS」 |

⚠️ **不要記固定的通過數字。** `staging_writing_analyses_verify` 的分母會變動：
最後一項在 `writing_analyses` 已有資料時記成 `INFO` 而非 `PASS`，
24 就會變成 23。**看「全部通過」四個字，不要看數字。**

判讀欄的 ℹ️ **觸發器函式**（`*_touch`、`*_guard_*`）不是問題：
它們回傳 `trigger`，PostgreSQL 拒絕被當一般函式呼叫，
PostgREST 也不會把它們收進 schema cache。

`get_user_profile` / `get_user_stats` / `is_admin` / `upsert_user_profile`
的 ⚠️ 同樣是刻意的 —— 它們本來就要讓未登入者呼叫並回 `NOT_AUTHENTICATED`。

### 3.2 未登入 HTTP 檢查 —— 唯一真正證明破口關上的一步

SQL Editor 是以資料庫擁有者身分執行的，**看不出 PostgREST 對 `anon` 的行為**。

在正式站前端開 DevTools Console。**兩步，不要改多行區塊。**

第 1 步 —— 打 `K = '` 然後貼上 **Production 的 anon / publishable key**，補上結尾引號，Enter：

```js
K = 'PASTE_KEY_HERE'
```

第 2 步 —— 整塊貼上，一個字都不用改：

```js
(async () => {
  if (typeof K !== 'string') return console.error('❌ 還沒做第 1 步');
  const key = K.trim();
  const ok = /^ey[A-Za-z0-9_\-.]+$/.test(key) || /^sb_publishable_[A-Za-z0-9_\-]+$/.test(key);
  if (!ok) return console.error('❌ 這串不像 key：', JSON.stringify(key.slice(0, 12)), '長度', key.length);

  const URL = 'https://ytzspnjmkvrkbztnaomm.supabase.co';
  const call = (fn, body = {}) =>
    fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async r => ({ fn, status: r.status, body: (await r.text()).slice(0, 90) }))
      .catch(e => ({ fn, status: 'ERROR', body: String(e).slice(0, 90) }));

  console.table(await Promise.all([
    call('get_user_profile'),
    call('admin_get_all_users'),
    call('admin_get_user_stats'),
    call('admin_grant_premium',  { p_user_id: '00000000-0000-0000-0000-000000000000' }),
    call('admin_revoke_premium', { p_membership_id: '00000000-0000-0000-0000-000000000000' }),
    call('learn_student_tasks'),
  ]));
})();
```

| fn | 預期 |
|---|---|
| `get_user_profile` | `200` + `NOT_AUTHENTICATED` ← **陽性對照** |
| 其餘五支 | `401` 或 `403`，body 含 `42501 permission denied for function` |

**陽性對照為什麼必要**：只看五個 401，你分不出「權限確實收掉了」和
「請求根本沒送到」（網址錯、key 錯、函式名拼錯都會失敗）。

🔴 陽性對照不成立 → 這次檢查不算數。
🔴 任何一列回 `200`，尤其 body 出現 email 或 `{"success":true}` → **立刻執行 2-1R 以外的路徑：先確認 2-1 有沒有真的套用**。

🛑 用 anon / publishable key。**`service_role` / `secret` 那把絕對不要用。**

### 回滾點 3R

**沒有東西需要回滾。** 階段 3 全部唯讀。
發現問題的話回到階段 2 的對應回滾點。

---

## ✅ 階段 1–3 實測結果（正式站，2026-09-06）

| 階段 | 結果 |
|---|---|
| 1 preflight | ✅ 全部 PASS。七張新表皆未建立（乾淨部署）；管理員兩套機制對齊；`auth.users` 22 人（與稽核記載一致，確認連對專案）；破口基線 **4 項授權 / 0-4 NULL-safe** |
| 2 七支 migration | ✅ 依序套用，無 ERROR |
| 3.1 `staging_writing_analyses_verify` | ✅ **24 / 24**、36 欄（正式站 `writing_analyses` 是全新的 0 列，所以分母是 24 而非 staging 的 23） |
| 3.1 `learn_classes_verify` | ✅ **16 / 16** |
| 3.1 `launch_surface_rpc_check` | ✅ 四支 admin RPC 全 `f` / `t` —— 基線的 `4 → 0`、`0/4 → 4/4` 都翻過來了 |
| 3.1 `launch_surface_rls_check` | ✅ 17 張表無 🔴。**`pack_item_progress` 在正式站存在**（staging 沒有），所以字卡進度可以在這裡驗 |
| 3.2 未登入 HTTP | ✅ 陽性對照 `200 NOT_AUTHENTICATED`；五支全 `401` + `42501 permission denied for function` |

**這次修補在正式站的實際價值**：部署前 `admin_grant_premium` 是 anon 可寫的
（staging 早就被收過權限，正式站沒有），也就是未登入者能替任意帳號開通 premium。
現在是 `401`。

### 與 staging 的一個差異（非問題）

正式站多數既有表顯示 `anon 授權 = 7`，包含 `exam_attempts`；staging 的
`exam_attempts` 是 `0 / 1`。這是 Supabase 的常態：**grant 開得寬，靠 RLS 收窄**。
稽核 §4.4 已確認 exam 領域的 RLS 是 owner-scoped 且正確，
`user_*` / `pack_item_progress` 也已確認是 owner-scoped 樣板。

---

## ⚠️ 階段 4 之前：前端還沒部署

**資料庫已經 migrate，但正式站的前端還是舊程式碼。**

Vercel Production 部署自 `main`，而這次的所有前端改動都在
`claude/security-architecture-continuation-i3hw1y`（領先 `main` 118 個 commit）。
所以正式站現在**還沒有** `/admin/classes`、沒有新的 Dashboard。

這是**安全且一致的中間狀態** —— 七支 migration 全是 additive，
舊前端只是忽略那些新表；`admin_get_all_users` 收成 authenticated-only 之後，
舊的 `/admin/users` 以管理員身分呼叫仍然正常。
**可以停在這裡，沒有時間壓力。**

要跑階段 4 的煙霧測試，必須先把這個分支合進 `main` 並讓 Vercel 部署 Production。

---

## 階段 4 — 正式站煙霧測試

不重跑完整 E2E（staging 已經驗過了）。這裡只確認「正式環境的接線是對的」。

需要兩個並行的登入工作階段：**Chrome 多重設定檔**（老師一個、學生一個）。

| # | 誰 | 動作 | 預期 |
|---|---|---|---|
| 1 | 老師 | 登入 → `/admin` | 看得到「班級管理」與「作文批改」兩張卡 |
| 2 | 老師 | `/admin/classes` | 空狀態「尚未建立任何班級」（**不是紅字錯誤**） |
| 3 | 老師 | 建第一個真實班級，設下次上課日期 | 卡片顯示正確人數與日期 |
| 4 | 老師 | 加入下週開課的真實學生 | 名冊顯示**姓名或 email 前段，不是 uuid** |
| 5 | 老師 | 指派一筆 HOMEWORK（全班）＋ 一筆 RECURRING | — |
| 6 | 學生 | 登入 → `/learn/student` | 「我的任務」顯示指派的內容；**沒有**「示範資料」標籤、**沒有**學生切換器 |
| 7 | 學生 | 標記完成 | 「我已完成 · 待老師確認」 |
| 8 | 老師 | 重新整理班級頁 | 出現「學生已標記」→ 點「完成」 |
| 9 | 學生 | 重新整理 | 「老師已確認完成」 |
| 10 | 學生 | 送出一篇作文 | 「等待老師批改」 |
| 11 | 老師 | `/admin/writing` → 「開始 AI 批改」**按一次** | 60–70 秒後顯示可讀報告（**不是原始 JSON**） |
| 12 | 學生 | 開該篇報告 → 回 `/learn/student` | 報告可讀；「最近的作文」卡出現 |
| 13 | 學生 | 檢查字卡區 | **正式站有 `pack_item_progress`** → 做幾張字卡後「已學習 %」應該**會上升**（staging 驗不到的就是這一項） |
| 14 | — | 完全登出後打 `/learn/student` | 被導去登入頁 |
| 15 | — | 登出後打 `/learn/parent`、`/learn/teacher/session` | 被擋下 |

第 11 步失敗 → 跑 `tests/sql/staging_writing_failure_probe.sql`（唯讀）看 telemetry。

### 回滾點 4R

煙霧測試發現問題時，**先判斷是資料問題還是 schema 問題**：

- **資料問題**（班級建錯、指派錯人）→ 用 UI 修，不要回滾 migration
- **schema 問題**（欄位缺、函式不存在）→ 回到階段 2 的對應回滾點
- **AI 批改失敗** → 通常是 `DEEPSEEK_API_KEY` 沒設在 Production，
  **不需要回滾任何 migration**，補設變數後重新部署即可

🛑 第 3–5 步之後才回滾 2-7，會刪掉你剛建的班級與名冊。

---

## 常見問題

### 批改時顯示「伺服器設定不完整」

環境變數問題，**不是程式或 schema 的問題**。不需要回滾任何 migration。

有**兩個**不同的原因會產生這句一模一樣的訊息（見下方缺陷記錄），
只能靠 Vercel 函式日誌分辨：

Vercel → 專案 → Deployments → 最新的 Production 部署 → **Logs** → 篩 `analyze-writing`

| log 那一行 | 缺的東西 |
|---|---|
| `[analyze-writing] 缺少 DEEPSEEK_API_KEY` | `DEEPSEEK_API_KEY` 沒設在 **Production** |
| `[essayAuth] 缺少 Supabase 環境變數` | `SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_URL` / anon key 其中之一 |

`requireEssayAccess` 跑在 `DEEPSEEK_API_KEY` 檢查【之前】，所以看到
`[essayAuth]` 那一行時，DEEPSEEK 的檢查根本還沒執行到。

**修法**：Settings → Environment Variables 補上該變數並勾 **Production**，
然後 **必須重新部署** —— serverless function 的環境變數是部署時注入的，
光存變數不會生效。

> 📌 **2026-09-07 正式站實際踩到這個**：`DEEPSEEK_API_KEY` 只勾了 Preview
> （staging 驗收時設的），Production 沒勾。log 顯示
> `[analyze-writing] 缺少 DEEPSEEK_API_KEY`，補勾並重新部署後解決。
> 階段 0 的環境變數檢查就是為了避免這一步，**不要跳過它**。

### 🐛 已知缺陷：這句錯誤訊息無法分辨原因

`api/analyze-writing.ts` 與 `api/_lib/essayAuth.ts` 兩個完全不同的失敗原因，
對老師顯示**同一句**「伺服器設定不完整」。

對老師沒差（兩者的下一步都是「找工程端」），但對除錯是障礙 ——
必須去翻 log 才知道是哪一個。應該改成兩句可分辨的訊息。

不影響功能，不擋上線。

---

## 完成判定

- [ ] 階段 1 preflight 全部 PASS
- [ ] 階段 2 七支 migration 依序套用，無 ERROR
- [ ] `staging_writing_analyses_verify` → 全部通過、36 欄
- [ ] `learn_classes_verify` → 16 / 16
- [ ] `launch_surface_rpc_check` → 四支 admin RPC 全 `f` / `t`
- [ ] `launch_surface_rls_check` → 17 張表無 🔴
- [ ] 未登入 HTTP 檢查 → 陽性對照成立、五支全 401
- [ ] 階段 4 煙霧測試 1–15 全過
- [ ] 字卡「已學習 %」確認會上升（staging 驗不到的那一項）

---

## 上線後仍待處理

完整清單見 `docs/learn/security-followups.md`。摘要：

| 項目 | 何時變成阻斷 |
|---|---|
| `essays` / `Essays` bucket 是公開的 | **啟用照片／OCR 作文上傳之前必須修好**。目前純文字流程不經 storage，不擋這次上線 |
| 稽核 §9.1 那 11 張 RLS 關閉的 legacy 表 | 屬於另一個應用程式，需要呼叫端分析後才能動 |
| `pack_item_progress` 沒有 migration | 環境可重現性的債；正式站有這張表，功能正常 |
| 「最近的成績」有資料時的路徑未驗 | 建第一份考卷後回頭補驗；另注意 `exam_attempts.total_score` 沒有任何地方會寫入 |
| `claim_pack_with_token` 忽略 `p_site` | 正式網域含 `gsat` 所以不受影響；換網域就會踩到 |
| 六支函式沒有釘住 `search_path` | 稽核 §9.7，無已知可利用路徑 |

---

## 清理

- [ ] 刪掉 staging 上那個沒用的 `nonstopjazz@gmail.com` 帳號
- [ ] staging 的測試資料（週六 A 班、測試作業、測試作文）留著無妨，
      但別跟正式資料搞混
