# Class filter bug / Migration / Test / Scope / Risks（交付項 11–15 + §J）

## 11. §J. Class filter bug —— 確認結果與影響

### ✅ 確認：**是 bug，而且不只 `/admin/writing` 一處**

`learn_class_members.left_at` 是**軟移除**，由 `learn_admin_remove_class_member()` 寫入：
```sql
UPDATE public.learn_class_members SET left_at = now()
 WHERE class_id = p_class_id AND student_id = p_student_id AND left_at IS NULL;
```
重新加入則把它清回 NULL（不新增第二列）。所以「在籍」的判準就是 `left_at IS NULL`。

**三項證據顯示 `left_at IS NULL` 是設計上的約定：**

1. 兩個**部分索引**都帶這個條件：
   ```sql
   idx ON learn_class_members(class_id)   WHERE left_at IS NULL
   idx ON learn_class_members(student_id) WHERE left_at IS NULL
   ```
   索引是為了某個存取樣式而建的 —— 建成這樣，就是預期查詢會帶這個條件。

2. **擁有這張表的模組，5 個查詢點全部都帶**：
   | 位置 | 用途 |
   |---|---|
   | `create_learn_classes_tasks.sql:395` | `member_count` |
   | `:583` | `already_member` |
   | `:738` | 指派名單 |
   | `:748` | 「不是這個班的在籍成員」驗證 |
   | `:979` | 班級名冊 |

3. **模組外的 4 個查詢點，全部都沒帶**：
   | 位置 | 影響 |
   |---|---|
   | `writing_admin_queue()` | 退出班級的學生，舊作文仍被算進該班 → **class filter 顯示錯誤** |
   | `writing_pending_digest():89` | `by_class` 待處理統計偏高 |
   | `learn_feature_enabled():145` | 🔴 **退出班級的學生保有功能權限** |
   | `learn_admin_feature_access():219` | 管理後台的「已開放學生」名單偏多 |

➡️ **模式很清楚**：寫這張表的人有一致的約定，後來跨模組使用的人沒有跟上。這不是 writing 模組的個別疏忽。

### 🔴 最嚴重的不是 writing，是 `learn_feature_enabled()`

那是**權限函式**。學生被移出班級後，透過班級取得的功能（例如口說）**不會被收回**。
這超出 Phase 1 範圍，但既然查出來了就該列給你 —— 建議獨立處理，優先度高於 class filter。

### 影響範圍取決於一件事：**有沒有人真的被移出過班**

請在 Supabase 跑（唯讀）：
```sql
SELECT count(*) FILTER (WHERE left_at IS NOT NULL) AS 已退出,
       count(*) FILTER (WHERE left_at IS NULL)     AS 在籍,
       count(*)                                    AS 總計
  FROM learn_class_members;
```
- `已退出 = 0` → **目前沒有任何實際影響**，是潛在 bug。可以從容修
- `已退出 > 0` → 上述四個地方**現在就是錯的**，`learn_feature_enabled` 要儘快處理

### 修正方案

| 對象 | 修法 | 標示 |
|---|---|---|
| `writing_admin_queue()` | LATERAL 的 WHERE 加 `AND m.left_at IS NULL` | 🟢 production 執行一次 |
| `writing_pending_digest()` | 同上 | 🟢 |
| `learn_feature_enabled()` / `learn_admin_feature_access()` | 同上 | 🟢 但**建議獨立一支 migration**，因為它改的是權限行為 |

三支都是 `CREATE OR REPLACE FUNCTION`，**不動任何資料**，rollback 就是再 replace 回舊定義。

### 會不會影響既有的 historical essay display？

**會，而且這正是要討論的地方。**

修正後：學生退出「高二A」→ 他過去在高二A時期寫的作文，**class_names 會變空或少一個班**。

兩種語意，要你選：

| 選項 | 行為 | 適合 |
|---|---|---|
| **S1 現在的班籍** | 加 `left_at IS NULL`。退出後舊作文不再歸在該班 | 「這個班現在有哪些學生要我看」 |
| **S2 當時的班籍** | 依 `essay_submitted_at` 落在 `[joined_at, coalesce(left_at,∞))` 區間 | 「這篇作文當時屬於哪個班」 |

- **S1** 一行就好，符合模組內既有約定，但**會讓退出學生的歷史作文「掉出」班級篩選**
- **S2** 語意最正確（歷史歸屬是事實），但 LATERAL 變複雜，且 `joined_at` 在重新加入時被重設為 `now()`，**會破壞更早的區間判斷** → S2 在現有 schema 下其實**做不對**

➡️ **建議 S1**，並在 UI 的班級篩選加一行說明「只顯示目前在籍」。
S2 若之後真的需要，得先改 `learn_class_members` 的歷史模型（保留多段 membership 區間），那是另一個題目。

---

## 12. Migration / rollback strategy

### 建議拆 6 支 + 6 支 rollback，全部 🟢（production 執行一次，先在 staging 驗）

| # | migration | 類型 | 破壞性 |
|---|---|---|---|
| 1 | `create_writing_error_findings.sql` | 建表 + 索引 + RLS | 純新增 |
| 2 | `create_writing_error_findings_rpcs.sql` | `sync` / `backfill` / `reconcile` | 純新增 |
| 3 | `create_student_writing_error_profiles.sql` | 建表 + `refresh` 函式 | 純新增 |
| 4 | `create_writing_error_alerts.sql` | 建表 + `evaluate` / `admin_alerts` | 純新增 |
| 5 | `update_writing_admin_queue_error_codes.sql` | `CREATE OR REPLACE`，多回一欄 | 相容（多一欄） |
| 6 | `fix_class_membership_left_at.sql` | `CREATE OR REPLACE` ×2（queue + digest） | **行為改變**，見 §11 |

**回填是獨立的一步，不放在 migration 裡**：
```sql
-- 手動分批跑，可中斷可重跑
SELECT writing_backfill_error_findings(p_limit => 200);
```
理由：回填要掃 `writing_analyses` 全表展開 JSONB，放在 migration 裡會讓 SQL Editor 逾時。

### Rollback

| migration | rollback 會遺失什麼 |
|---|---|
| 1–4 | 三張新表的資料。**全部可從 `error_analysis` 重建**（findings → profiles → alerts 依序重跑）。⚠️ 例外：老師的 `reviewed_at` / `dismissed_at` 與 AI 產生的 `ai_summary` **重建不回來**，回滾前要備份 |
| 5 | 回到不含 `error_codes` 的版本。前端若已上線會拿到 `undefined` → 前端要能容忍（filter 視為「無資料」） |
| 6 | 再 replace 回不帶 `left_at` 條件的版本 |

**零破壞性保證**：這 6 支**沒有任何一支**修改 `writing_analyses`、`writing_submissions`、`writing_texts`、`learn_class_members` 的資料或結構。

### 部署順序（前後端相依）

```
1. 跑 migration 1–4（新表，前端還沒用到 → 零影響）
2. 分批回填 findings
3. 跑 refresh profiles（全體一次）
4. 跑 migration 5（queue 多一欄，舊前端會忽略它 → 零影響）
5. 部署前端（Error filter + Student tab）
6. 跑 migration 6（class 修正）+ 觀察
7. 最後才加 weekly cron
```
每一步都可以停下來，不會卡在中間態。

---

## 13. Test plan

### 資料層（`supabase/tests/writing_error_intelligence_test.sql`，沿用既有 `t_assert` harness）

| 群組 | 重點斷言 |
|---|---|
| **A. sync 正確性** | 17 個 code 都能入庫 · finding 欄位逐一對得上 JSONB · `is_fallback_code` 正確 |
| **B. ★ latest-only** | 同一篇跑 v1 → findings 來自 v1；跑 v2 → **findings 全數換成 v2，總數不是相加** · 拿 v1 的 id 再 sync 一次 → 回 `SUPERSEDED`，表內不變 |
| **C. 非 COMPLETED** | QUEUED / ANALYZING / FAILED 的分析 sync → no-op · 最新版 FAILED 時，上一版 COMPLETED 的 findings **仍在** |
| **D. 冪等** | 同一個 analysis_id sync 三次 → 列數不變 |
| **E. 聚合正確** | 一篇 5 個 findings 的作文，`total_word_count` **只算一次**（不是 ×5） · 未分析的作文不進分母 · `word_count IS NULL` 的作文排除在 rate 分母外但仍計入 count |
| **F. status 規則** | n=1 → `INSUFFICIENT_DATA` · 兩篇有 → `REPEATED` · 近期視窗達標 → `PERSISTENT` · **沒有任何路徑產生 `RESOLVED`/`MASTERED`** |
| **G. ★ GRAMMAR_OTHER** | 它照常入庫、照常算 profile、`confidence` 恆為 `LOW`、**永遠不產生 alert** |
| **H. alert 去重** | 同 (student, code) 未處理時不重複建 · dismiss 後過冷卻期可再建 · 新建的是新列，舊列還在 |
| **I. RLS** | 學生讀不到任何一張新表 · 學生 A 讀不到 B 的 profile/alert · anon 全擋 |
| **J. class left_at** | 學生在 A 班有作文 → 移出 A 班 → 修正後的 queue **不再**把他算進 A 班 · 重新加入 → 又回來 |
| **K. 對帳** | `reconcile()` 在正常狀態回 0 列 · 手動刪一列 findings 後回 1 列 |

### 前端（沿用 `tests/preview/` 的 Playwright harness 模式）

| 斷言 |
|---|
| Error multiselect 選一個 code → 只剩含該 code 的列 |
| 選兩個 code → OR 語意（不是 AND） |
| Error filter 與既有 5 個 filter 疊加正確 |
| 勾選狀態在 filter 變動後不會把被藏起來的列送出去（沿用既有保證） |
| Student tab 的勾選 + `BatchAnalyzeDialog` 正常開闔 |
| `ai_status='PENDING'` 的 alert **仍然顯示**（顯示「摘要生成中」而不是消失） |
| 390px / 1280px 無橫向捲軸 · 深色模式 token 正確 |

### Dry-run（上線前必做，§F 提過）

在 staging 用**真實資料**跑規則引擎，但 **`p_dry_run => true` 只印不建**：
- 會產生幾則 alert？
- 分布在幾位學生？
- 有沒有某個 code 洗版？

**先看數字再定門檻**，不要先定門檻再上線。

---

## 14. Estimated change scope by file

### 新增

| 檔案 | 估計 | 說明 |
|---|---|---|
| `supabase/migrations/` ×6 + rollback ×6 | ~900 行 | 見 §12 |
| `supabase/tests/writing_error_intelligence_test.sql` | ~450 行 | 對照既有 `lexical_phase1_test.sql` 的密度 |
| `src/lib/writing/errorIntel.ts` | ~120 行 | 型別、status label、badge tone（比照 `gradingQueue.ts`） |
| `src/hooks/learn/useWritingErrorStudents.ts` | ~90 行 | 比照 `useWritingQueue` |
| `src/hooks/learn/useWritingErrorAlerts.ts` | ~80 行 | |
| `src/components/ui/multi-select.tsx` | ~120 行 | `ui/command` + `ui/popover` 組成 |
| `src/components/admin/writing/ErrorFilterBar.tsx` | ~100 行 | 三個 tab 共用 |
| `src/components/admin/writing/StudentErrorList.tsx` | ~180 行 | |
| `src/components/admin/writing/ErrorAlertList.tsx` | ~150 行 | |
| `api/writing-error-weekly-scan.ts` | ~120 行 | 比照 `send-writing-review-reminders.ts` |
| `api/writing-error-digest-worker.ts` | ~180 行 | 比照 `writing-queue-worker.ts` |
| `api/_lib/errorDigestPrompt.ts` | ~150 行 | compact digest + 驗證 |

### 修改（刻意壓到最小）

| 檔案 | 估計 | 改什麼 |
|---|---|---|
| `src/pages/admin/WritingGrading.tsx` | **+~60 行** | 包一層 Tabs、filter 拉到共用元件、`visible` 多 3 行條件、每列多一排 badge。**既有 5 個 filter / 勾選 / 批次 / 統計卡零改動** |
| `src/hooks/learn/useWritingQueue.ts` | **+2 行** | type 多一欄 `error_codes` |
| `src/lib/writing/gradingQueue.ts` | **+1 行** | `WritingQueueRow` 多一欄 |
| `api/analyze-writing.ts` | **+~10 行** | 標記 COMPLETED 後呼叫 sync/refresh/evaluate |
| `vercel.json` | **+4 行** | weekly cron |

**完全不動**：`taxonomy.ts` · `analysisContract.ts` · `writingPrompts.ts` · `writing_analyses` schema · `WritingReportView.tsx` · 四支 pass 的任何邏輯。

---

## 15. Risks / open decisions

### 🔴 必須由你決定（不決定就無法動工）

| # | 決定 | 選項 | 我的傾向 |
|---|---|---|---|
| D1 | `MIN_ESSAYS`（低於幾篇算 `INSUFFICIENT_DATA`） | 2 / 3 / 4 | **3**。2 篇的「重複」幾乎沒有意義 |
| D2 | `recent_window_size`（最近 N 篇） | 3 / 5 / 8 | **5** |
| D3 | `PERSISTENT` 門檻（近 N 篇中至少 M 篇） | M=2 / 3 | 先 dry-run 再定 |
| D4 | §F 的正規化選項 | O1 raw / O2 rate / O3 混合 / O4 雙門檻 | **O3** |
| D5 | class filter 語意 | S1 現在班籍 / S2 當時班籍 | **S1**（S2 在現有 schema 下做不對） |
| D6 | alert 冷卻期 | 7 天 / 14 天 / 一學期 | **7 天** |
| D7 | `IMPROVING` 要不要進第一版 | 要 / 先不要 | **先不要**。它的措辭風險最高，而且要 §F 定案後才算得準 |

### ⚠️ 技術風險

| 風險 | 影響 | 緩解 |
|---|---|---|
| **回填量體未知** | `writing_analyses` 有幾列、JSONB 多大，repo 看不出來 | 動工前先查 `count(*)` 與 `pg_total_relation_size`。分批回填，每批 200 |
| **`writing_admin_queue()` 已經沒有分頁** | 多一個 `error_codes[]` 會讓它更重；Student tab 若也一次撈全部會再重一次 | Student tab **從一開始就在 RPC 裡做篩選與 LIMIT**，不要重蹈 essay view 的覆轍 |
| **findings 與 JSONB 脫節** | 統計錯誤且難察覺 | `reconcile()` 視圖 + 定期比對；任何時候可清空重建 |
| **老師被 alert 洗版** | 功能被關掉，連真的有事那天也看不到 | 先 dry-run 看數量；沿用「沒事不送」；冷卻期 |
| **AI digest 成本估不準** | 老師按下去不知道要花多少 | 前幾批 `sample_size = 0`（既有 dialog 已處理）；累積 telemetry 後自動變準 |

### 🛑 語意風險（最容易出事，也最難事後補救）

| 風險 | 說明 |
|---|---|
| **把 `count = 0` 當成精熟** | TR-12/TR-13。第一版不做 RESOLVED/MASTERED 就是為此。**但 `IMPROVING` 是同一個陷阱的變形** —— 見 D7 |
| **GRAMMAR_OTHER 混入高可信度訊號** | 已知它混了至少兩種真實類別。用 `confidence` 欄位在資料層擋掉，不靠人記得 |
| **題型難度沒有正規化** | 同一學生寫不同文體錯誤分布本來就不同。`essay_topic` 是自由文字，**現在做不到**。第一版明確不做，但要寫進文件，否則之後會把題目難度誤讀成學生問題 |
| **AI 複述錯數字** | 驗證層擋掉與 `evidence_summary` 不符的數字宣稱 |
| **n 很小就下判斷** | 目前學生可能只有 1–3 篇。`INSUFFICIENT_DATA` 狀態 + `confidence` 就是為此 |

### 📌 範圍外但已查出，建議另案處理

**`learn_feature_enabled()` 的 `left_at` 缺漏是權限問題**（退出班級仍保有功能權限），
嚴重度高於 class filter 顯示問題，但不屬於 Writing Error Intelligence。建議獨立一個 PR，優先處理。
