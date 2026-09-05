# PHASE D3 — staging 最小路徑執行清單

staging（gsat-staging `cwymrzcovgobfqxtithn`）現況已確認：

```
has_submissions = true    has_texts = true
has_analyses    = false   has_is_admin = true
```

所以**只缺 `writing_analyses`**。不重建、不 bootstrap `writing_submissions`、
`writing_texts`、`is_admin()`——它們已經在那裡，本次一律不碰。

全部步驟都在 Supabase SQL Editor 與瀏覽器完成，不需要任何本機指令。

---

## 步驟總覽

| # | 檔案 | 性質 | 回滾點 |
|---|---|---|---|
| 0 | 本文件的「步驟 0」查詢 | 唯讀 | 不適用 |
| 1 | `supabase/migrations/create_writing_analyses.sql` | 建表（改 schema） | 步驟 1R |
| 1R | `supabase/migrations/create_writing_analyses.rollback.sql` | 回滾 | — |
| 1b | `supabase/migrations/add_writing_analyses_analyzed_at.sql` | 純新增一欄（改 schema） | 步驟 1bR |
| 1bR | `supabase/migrations/add_writing_analyses_analyzed_at.rollback.sql` | 回滾 | — |
| 1c | `supabase/migrations/add_writing_analyses_telemetry.sql` | 純新增兩欄（改 schema） | 步驟 1cR |
| 1cR | `supabase/migrations/add_writing_analyses_telemetry.rollback.sql` | 回滾 | — |
| 2 | `tests/sql/staging_writing_analyses_verify.sql` | 唯讀 | 不適用 |
| 3 | Preview 上 `/admin/writing-debug` 跑真實分析 | 寫入 staging 資料 | 步驟 3R |
| 3R | 本文件的「步驟 3R」刪除語句 | 清掉測試分析列 | — |
| 4 | `tests/sql/staging_writing_audit_report.sql` | 唯讀 | 不適用 |
| 診斷 | `tests/sql/staging_writing_failure_probe.sql` | 唯讀（分析失敗時跑） | 不適用 |

**只有步驟 1、1b、1c 會改變 schema。** 步驟 3 只會在 `writing_analyses`
新增資料列，不動 schema。已經套過步驟 1 的環境只需要補跑步驟 1b 與 1c。

---

## 步驟 0 — 再確認一次現況（唯讀）

```sql
SELECT
  to_regclass('public.writing_analyses') IS NULL AS analyses_still_missing,
  to_regclass('public.writing_submissions') IS NOT NULL AS has_submissions,
  to_regclass('public.writing_texts') IS NOT NULL AS has_texts,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'is_admin') AS has_is_admin;
```

**預期：四欄全為 `true`。**

若 `analyses_still_missing = false`，代表已經套過了，直接跳到步驟 2。

---

## 步驟 1 — 套用 `create_writing_analyses.sql`（唯一的寫入步驟）

整份貼進 SQL Editor 執行。

**它會建立（全部都是新的 `writing_` 物件）：**

| 類別 | 內容 |
|---|---|
| 表 | `writing_analyses`（32 欄，步驟 1b 之後 33 欄）+ 3 個索引 + 註解 |
| trigger | `writing_analyses_guard_immutable_trigger`（狀態機白名單、四軸凍結、COMPLETED 前置條件） |
| 權限 | 啟用 RLS；`REVOKE ALL` 收回 anon / authenticated；只給 service_role `SELECT/INSERT/UPDATE` |
| 政策 | 1 個，只給 service_role |
| 函式 | `writing_student_analysis` `writing_admin_queue` `writing_admin_analysis` `writing_enqueue_analysis` `writing_retry_synthesis`，全部 `SECURITY DEFINER` + `SET search_path = ''`，`REVOKE ALL FROM PUBLIC` 後只 `GRANT EXECUTE TO authenticated, service_role` |

**它不會改動任何既有物件。** 檔案裡沒有任何一行 `ALTER`／`DROP`
指向 `writing_submissions`、`writing_texts`、`is_admin()` 或任何 iLearn 物件。
唯一對既有物件的引用是**外鍵與唯讀查詢**：
`REFERENCES writing_submissions(id)`、`REFERENCES auth.users(id)`、
`writing_admin_queue()` 內部讀取 `writing_texts`。

**預期結果：** `Success. No rows returned`

**若看到 `RAISE EXCEPTION: writing_analyses 需要 public.is_admin()`** ——
代表相依檢查擋下來了，不會留下任何半套物件。回頭確認步驟 0。

### 步驟 1R — 回滾點

出任何問題就整份執行 `create_writing_analyses.rollback.sql`。
它只 DROP 這份 migration 建立的物件，不碰 `writing_submissions`、
`writing_texts`、`is_admin()`。本機已驗證來回一次物件數完全復原
（3 表相關物件 / 8 函式 / 1 政策 → 0/2/0 → 3/8/1）。

⚠️ 回滾會連同已產生的分析結果一起刪除。步驟 1 剛套用完時表是空的，此時回滾零成本。

---

## 步驟 1b — 套用 `add_writing_analyses_analyzed_at.sql`

分析流程從「一次請求跑完兩個 Stage」拆成兩次請求之後，Stage 1 的結束時間
不再能從既有欄位推導（舊算法會把兩次請求之間的客戶端空檔算進 Stage 1）。
這一欄記錄四軸落地的那一刻，讓兩段延遲各自量得準。

整份貼進 SQL Editor 執行。它只有一行 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
與一行 `COMMENT`：不改既有欄位、不改資料、不改 RLS／grants／trigger，重複執行是冪等的。

**預期結果：** `Success. No rows returned`

### 步驟 1bR — 回滾點

`add_writing_analyses_analyzed_at.rollback.sql`。只 DROP 那一個量測欄位，
分析結果與狀態機都不受影響。

---

## 步驟 1c — 套用 `add_writing_analyses_telemetry.sql`

新增 `stage1_telemetry` 與 `synthesis_telemetry` 兩個 JSONB 欄位。

在這之前，失敗的分析在資料庫裡查不出三件事：`attempt_count` 是寫死的常數 1，
所以看不出有沒有發生驗證重試；被中斷的那次呼叫延遲記為 0，所以看不出它跑了多久；
失敗時只留最後一次的 `validation_issues`，所以 attempt 1 驗證失敗、attempt 2 撞上
期限時，重試的原因會被空陣列蓋掉。這兩欄逐支、逐次保留完整紀錄。

整份貼進 SQL Editor 執行。只有一段 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
與兩行 `COMMENT`：不改既有欄位、不改資料、不改 RLS／grants／trigger，冪等。

**預期結果：** `Success. No rows returned`

### 步驟 1cR — 回滾點

`add_writing_analyses_telemetry.rollback.sql`。只 DROP 那兩個量測欄位。

---

## 步驟 2 — 唯讀驗證

整份貼進 SQL Editor 執行：`tests/sql/staging_writing_analyses_verify.sql`

**預期：`24/24　全部通過`**

「欄位數」那一項期望 35。回報 32／33／34 時，訊息會直接說少了哪一步。

它檢查結構、索引、trigger、RLS、grants、五個函式的
`SECURITY DEFINER` 與 `search_path`、EXECUTE 授權，
並實際呼叫兩支管理員函式確認它們在 SQL Editor 身分下**擋得住**
（SQL Editor 的 `auth.uid()` 是 NULL，真正的 `is_admin()` 會回傳 NULL 而非 false，
這正是 `coalesce(is_admin(), false) IS NOT TRUE` 存在的理由）。

最後附上三張寫作表的政策數量對照，確認既有表沒被動到。

> 🛑 **不要**在 staging 執行 `tests/sql/writing_analyses_security_test.sql`。
> 那份是本機專用：它會 INSERT 進 `auth.users` 並依賴 `id` 有 DEFAULT
> （真正的 Supabase 沒有），也依賴本機把 `is_admin()` 換成讀 GUC 的替身。
> 在 staging 跑只會得到一堆看不懂的錯誤。行為面的驗證由步驟 3 完成。

---

## 步驟 3 — Preview 上跑真實 DeepSeek

前置：Preview 的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
必須指向 **gsat-staging**，否則端點會寫到別的資料庫去。

1. 用**管理員帳號**登入 Preview 站台
2. 開 `/admin/writing-debug`
3. 若佇列是空的，先用學生帳號在 `/learn/student/writing` 送出一篇作文
4. 對目標作文按「**開始 AI 批改**」——**只按這一次**

分析是兩次請求，但只需要按一次：Stage 1 成功之後，綜合層由頁面自動接續發出。
按鈕文字會從「Stage 1 進行中」變成「綜合層進行中」。

5. 頁面會把兩段分開列出：各自的 HTTP 狀態、耗時、以及對 50 秒期限的餘裕，
   還有兩段各自的原始 JSON 回應

**預期 Stage 1 成功回應：**
```json
{ "analysisId": "...", "stage": "stage1", "status": "ANALYZED",
  "synthesisStatus": "PENDING", "reportReady": false,
  "nextRequest": "synthesis", "stage1LatencyMs": 31800 }
```
`reportReady: false` 是正確的——四軸過了不等於報告可以給學生看。

**預期 Stage 2 成功回應：**
```json
{ "analysisId": "...", "stage": "synthesis", "status": "COMPLETED",
  "synthesisStatus": "COMPLETED", "reportReady": true, "stage2LatencyMs": 16000 }
```

**預期失敗回應（Stage 1 沒過完整覆蓋）：**
```json
{ "status": "FAILED", "failedPass": "high_score_h1_h3",
  "error": "...結構化輸出驗證失敗（N 項）", "issueCount": N }
```
這是設計上的行為，不是 bug——缺漏一律走失敗路徑，不補值。
缺漏清單會存進 `validation_issues`，步驟 4 會印出來。
**Stage 1 失敗時綜合層完全不會被呼叫**，頁面就停在這裡。

**預期綜合層失敗：**
```json
{ "stage": "synthesis", "status": "ANALYZED", "synthesisStatus": "FAILED",
  "reportReady": false, "retryable": true,
  "note": "四軸分析已保留，可只重跑綜合層" }
```
此時頁面會多出「只跑綜合層」按鈕。四軸資料在資料庫層已被凍結，
重跑綜合層不可能改寫它們，也不會重跑那四支昂貴的呼叫。

**重複點擊的防護：** Stage 1 已完成的作文再按一次「開始 AI 批改」，
端點回 `alreadyDone: true` 並直接指向綜合層，不會重跑四軸；
另一次請求還在飛時會回 409。

建議跑 2–3 篇不同程度的作文。
`tests/fixtures/writing/` 有三篇現成的（中等／弱／強），可以直接複製內文去送出。

### 步驟 3R — 回滾點

只想清掉測試分析、保留 schema：

```sql
-- 先看要刪什麼
SELECT id, essay_id, status, synthesis_status, analysis_version, requested_at
  FROM writing_analyses ORDER BY requested_at DESC;

-- 確認之後再刪（只刪分析列，不動作文與正文）
DELETE FROM writing_analyses WHERE id IN ('<貼上要刪的 id>');
```

---

## 步驟 4 — 可讀稽核報告（唯讀）

整份貼進 SQL Editor 執行：`tests/sql/staging_writing_audit_report.sql`

預設取最近一次分析。要指定某一篇，把檔案裡 `v_essay UUID := NULL;`
的 `NULL` 換成該篇的 `essay_id`。

輸出一張 `section / ord / line` 的表，包含：

1. 概況與延遲（Stage 1 / Stage 2 各自的耗時與對 50 秒期限的餘裕、牆鐘時間、嘗試次數）
   —— 牆鐘時間含兩次請求之間的空檔，**不要**拿它對照 50 秒
2. 完整覆蓋計數（23 / 16 / 29，直接數，不靠信任）
3. **引用查核** —— 每一段引用是否逐字出現在 `writing_texts` 的內文裡
4. 綜合層（學生的第一屏）
5. 全 23 個能力節點
6. 全部錯誤與修正
7. 全 29 個高分特徵，依 quality 排序
8. 學生原文

整張表貼回來即可判讀。**不含任何秘密。**

---

## 確認事項

- **完全沒有碰到正式專案** `ytzspnjmkvrkbztnaomm`。本清單所有步驟都在
  gsat-staging 執行，程式碼裡沒有任何指向正式專案的連線字串。
- **沒有部署正式站。** Vercel Preview 與 Production 是各自獨立的部署。
- **Mock Exam 與 Grammar 完全未動。**
- 分類法涵蓋範圍未縮減：仍是 23 / 16 / 17 / 12，缺漏一律走失敗路徑。
