# 交接：給下一段對話

> 建立於 2026-09-20，因為上一段對話的 context 滿了。
> 分支：`claude/security-architecture-continuation-i3hw1y`
>
> **這份檔案本身就是提醒。下一段對話請先讀完第 0 節再做任何事。**

---

## 0. 🔴 現在最重要的一件事：iLearn 可能還是壞的

**`https://ilearn-blog-lms-on.vercel.app` 的老師打不開學生作業**，畫面噴：

```
permission denied for table student_tasks
```

**這是我（Claude）造成的**，來源是已經 merge 的 PR #124。細節見第 2 節。

### 下一段對話要做的第一件事

**先確認現況，不要假設。** 請使用者在 Supabase SQL Editor 跑這段（🟢 唯讀，兩個環境都可以跑）：

```sql
SELECT c.relname                                            AS "表",
       c.relrowsecurity                                     AS "RLS開著",
       has_table_privilege('anon', c.oid, 'SELECT')          AS "anon可讀",
       has_table_privilege('authenticated', c.oid, 'SELECT') AS "登入者可讀",
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS "政策數"
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND c.relname IN ('users','user_course_access','student_tasks','courses',
                     'course_lessons','assignments','assignment_submissions',
                     'exam_types','exam_records','learning_progress_stats',
                     'vocabulary_sessions')
 ORDER BY c.relname;
```

判讀：

| 看到 | 意思 | 要做什麼 |
|---|---|---|
| `anon可讀 = false` | iLearn 還是壞的 | 跑下面那份復原 SQL |
| `anon可讀 = true` 且 `政策數 >= 1` | 已經修好了 | 請使用者實際開一次 iLearn 確認，然後往第 1 節走 |
| `anon可讀 = true` 但 `RLS開著 = false` | iLearn 會動，但 Supabase 的 `rls_disabled_in_public` 警告會一直來 | 跑復原 SQL 把 RLS 補上 |

### 復原 SQL 已經寫好了，但**還沒有人執行過**

- `supabase/migrations/restore_ilearn_legacy_table_access.sql`
- `supabase/migrations/restore_ilearn_legacy_table_access.rollback.sql`

🔴 **這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。**

它做兩件事：把 `anon` / `authenticated` 的 grant 還原成 2026-09-18 之前的樣子；
然後 `ENABLE RLS` 並補一條**完全放行**的 policy。

第二步是關鍵，也是我一開始想錯的地方 —— 見第 2 節「第二個錯誤」。

⚠️ 不要把這份當成「資安修好了」。放行 policy 等於沒有保護，anon key 公開在前端 JS 裡。
這是在 iLearn 淘汰之前**刻意接受的風險**。使用者已經說過「這個網站要逐步淘汰掉了」。

---

## 1. 學生作文錯誤追蹤（Writing Error Intelligence）

### 目前進度：**盤點完成、計畫完成、一行 code 都還沒寫**

使用者兩次都明確要求唯讀：
- 盤點那次：「不要修改任何檔案／不要 commit／只做 read-only audit」
- 計畫那次：「只提供 plan，不實作」

**所以不要自作主張開始實作。** 要動工前，第 15 節的 D1–D7 必須先有答案（見下）。

### 產出在哪裡

| 目錄 | 內容 |
|---|---|
| `docs/exports/writing-audit/` | 現況盤點（6 個檔案，交付項 A–I + Q1–Q10 逐題） |
| `docs/plans/writing-error-intelligence-phase1/` | 第一階段實作計畫（4 個檔案，15 個交付項） |

這 10 個檔案原本只存在 scratchpad 裡，**這次 commit 才進 repo**，否則會隨 session 消失。

### 必須記住的三個語意地雷

1. **`writing_analyses` 的 COMPLETED 列是完全不可變的。**
   trigger 寫死 `IF OLD.status = 'COMPLETED' THEN RAISE EXCEPTION`，
   **不分欄位**。所以不能加 `is_latest` 旗標，也不能事後補欄位。
   任何「改一下既有分析列」的設計都是死路。

2. **`coverage.count = 0` 的意思是「本篇沒發現這類錯誤」，不是「學生已經學會」。**
   TR-12 / TR-13。第一版**刻意不做** `RESOLVED` / `MASTERED` 狀態就是為了這個。
   `IMPROVING` 是同一個陷阱的變形 —— 這就是 D7 傾向「先不要」的原因。

3. **`WRITE_ERR_GRAMMAR_OTHER` 是已知被濫用的 fallback。**
   2026-09-05 實測：一篇弱的作文 28 個 findings 裡有 7 個掉進這一類。
   它至少混了兩種真實類別，不能當成高可信度訊號。要用 `confidence` 欄位在資料層擋掉。

### 🔴 D1–D7：不決定就無法動工

| # | 決定 | 選項 | 我的傾向 |
|---|---|---|---|
| D1 | `MIN_ESSAYS`（低於幾篇算 `INSUFFICIENT_DATA`） | 2 / 3 / 4 | **3** |
| D2 | `recent_window_size`（最近 N 篇） | 3 / 5 / 8 | **5** |
| D3 | `PERSISTENT` 門檻（近 N 篇中至少 M 篇） | M=2 / 3 | 先 dry-run 再定 |
| D4 | 正規化：raw count vs errors per 100 words | O1 raw / O2 rate / O3 混合 / O4 雙門檻 | **O3** |
| D5 | class filter 語意 | S1 現在班籍 / S2 當時班籍 | **S1**（S2 在現有 schema 下做不對） |
| D6 | alert 冷卻期 | 7 天 / 14 天 / 一學期 | **7 天** |
| D7 | `IMPROVING` 要不要進第一版 | 要 / 先不要 | **先不要** |

### 動工前還需要一筆 DB 事實

`writing_analyses` 現在有幾列、JSONB 多大，repo 看不出來。回填規模取決於它：

```sql
SELECT count(*) AS 分析列數,
       pg_size_pretty(pg_total_relation_size('writing_analyses')) AS 表大小
  FROM writing_analyses;
```
（🟢 唯讀）

### 嚴格限制（使用者原話）

- 嚴格沿用既有的 `writing-v2` taxonomy，**不要設計新的 error taxonomy**
- 不要重寫 AI Prompt
- `api/_lib/taxonomy.ts`、`api/_lib/analysisContract.ts`、`writingPrompts.ts`、
  `writing_analyses` schema、`WritingReportView.tsx` —— **完全不動**

---

## 2. 資安問題、我犯的錯、最新處理近況

### 事情的經過

2026-09-18，我判定 11 張 legacy table 已經「死掉」，做了兩份 migration：

| migration | 做了什麼 |
|---|---|
| `secure_legacy_public_tables.sql` | 收掉 `anon` 的權限（當時認為是零風險止血） |
| `lock_down_dead_legacy_tables.sql` | 連 `authenticated` 一起收，並 `ENABLE RLS`（不寫 policy） |

兩份都進了 **PR #124，已經 merge**。結果 iLearn 的老師打不開學生作業。

### 🔴 第一個錯誤：我把唯一的反證論述掉了

`pg_stat_user_tables` 顯示這些表被讀了 3000+ 次。那是「有人在用」的唯一證據。

我怎麼把它解釋掉的：我找到 `assignments` 是一張空表、累計寫入 0、卻被讀了 3379 次，
於是推論那些讀取是 Dashboard Table Editor、PostgREST schema cache reload、備份掃描。
**然後我把這個從「一張表」的結論，套到全部 11 張表上。**

`student_tasks` 有 40 列、累計更新 26 次 —— 它跟 `assignments` 根本不是同一回事。

我甚至在自己的 migration 註解裡寫了「iLearn 那一側的 codebase 看不到」。
**我知道自己缺了一半的資訊，還是做了。**

### 🔴 第二個錯誤：我預測錯了「判斷錯誤的代價」

我在同一份 migration 裡寫：

> 症狀是 iLearn 的某個畫面變成空的（查詢不會報錯，只會回 0 列）。

實際上是硬的 `permission denied`。因為我不只開了 RLS，**還 REVOKE 了 grant**。
RLS 沒有 policy 會回 0 列；沒有 grant 會直接報錯。

如果我把這一步推完，我就會知道判斷錯的代價是**整個功能掛掉**，不是一個空面板。
代價估錯，就等於風險評估整個是假的。

### 🔴 第三個錯誤：我接著過度修正

使用者問能不能救回功能、同時滿足 Supabase 的資安要求時，我說「RLS 沒用，因為 iLearn 用 anon key」。

使用者反駁：「你真的沒辦法把功能救回來、然後同時能滿足 Supabase 的資安要求嗎?」

**使用者是對的。** `rls_disabled_in_public` 稽核的是「RLS 旗標有沒有開」，
**不是**「policy 嚴不嚴」。所以「ENABLE RLS + 放行 policy」可以同時滿足稽核與零行為變更。
我因為第一個錯誤而過度保守，直接放棄了一個可行解。

### ⚠️ 差一點犯第四次

後來 `pg_stat_statements` 查不到 iLearn 的流量，我差點又說「所以沒人在用」。

不能這樣說，原因有兩個：
- **`pg_stat_statements` 不記錄權限被拒的 statement** —— iLearn 現在的查詢全部被拒，所以本來就不會出現
- 它的 buffer 會淘汰低頻 entry

**「看不到」不等於「沒有」。** 這正是第一個錯誤的同一個形狀。

### 給下一段對話的規則

1. **iLearn 的 codebase 在這個 session 裡看不到。** 任何「這張表沒人用」的判斷都缺一半資訊。
2. **iLearn 用的是 Supabase anon key。** RLS 分不出它的老師和陌生人 —— anon key 就公開在前端 JS 裡。
3. **REVOKE grant 會讓前端直接報錯**；只開 RLS 不給 policy 才是回 0 列。兩者代價差很多。
4. **`service_role` 繞過 RLS，但不繞過 grant。** 收 grant 會連後端和排程一起鎖死。

### 最新狀態

| 項目 | 狀態 |
|---|---|
| PR #124（造成問題的那份） | **已 merge 進 main** |
| `lock_down_dead_legacy_tables.rollback.sql` | 使用者可能跑過（它只還 `authenticated`，**不還 `anon`**，所以跑完 iLearn 還是壞的） |
| `restore_ilearn_legacy_table_access.sql` | **這次 commit 才建立，還沒有人執行過** |
| iLearn 實際狀態 | **未確認。請先跑第 0 節的查詢。** |

---

## 3. 還沒處理的問題

### 🔴 急

| # | 項目 | 說明 |
|---|---|---|
| 1 | **iLearn 復原** | 見第 0 節。SQL 寫好了，沒執行。 |
| 2 | ~~**`learn_feature_enabled()` 的 `left_at` 缺漏**~~ | ✅ **已實作，commit `bf2186a`**，但 **SQL 還沒在 production 執行**。見下方。 |

`left_at` 是軟移除，「在籍」的判準是 `left_at IS NULL`。三項獨立證據確認這是 bug：
兩個部分索引都帶這個條件；擁有這張表的模組 5/5 查詢點都帶；模組外 4/4 都沒帶。

### ✅ 2026-09-20 更新：修正已經寫好並測過，但還沒執行

production 實測：**已退出 1 人、在籍 21 人、總計 22 人** → 不是潛在 bug，現在就在發生。

- `supabase/migrations/fix_class_membership_left_at.sql`（🟢 只要在 production 執行一次）
- `supabase/migrations/fix_class_membership_left_at.rollback.sql`
- `supabase/tests/class_membership_left_at_test.sql`（23 個 assertion，本機 PostgreSQL 16 全過）

共改 6 個查詢點、4 支函式。`writing_pending_digest()` 本身沒有 membership 查詢，
真正的修正在它委派的 `writing_pending_summary_internal()`，連帶修正 `writing_queue_summary()`。

原本盤點時列的四處：

| 對象 | 修法 | 標示 |
|---|---|---|
| `writing_admin_queue()` | LATERAL 的 WHERE 加 `AND m.left_at IS NULL` | 🟢 只要在 production 執行一次 |
| `writing_pending_digest()` | 同上 | 🟢 |
| `learn_feature_enabled()` | 同上 | 🟢 **建議獨立一支 migration**（改的是權限行為） |
| `learn_admin_feature_access()` | 同上 | 🟢 同上 |

動工前先確認實際影響範圍（🟢 唯讀）：

```sql
SELECT count(*) FILTER (WHERE left_at IS NOT NULL) AS 已退出,
       count(*) FILTER (WHERE left_at IS NULL)     AS 在籍,
       count(*)                                    AS 總計
  FROM learn_class_members;
```
`已退出 = 0` → 目前沒有實際影響，可以從容修。`已退出 > 0` → 四處現在就是錯的。

⚠️ 修 `writing_admin_queue()` 有一個副作用要先讓使用者知道：
學生退出「高二A」之後，他過去在該班時期寫的作文**會從班級篩選裡掉出來**。
這是 D5 選 S1 的後果。建議在 UI 的班級篩選加一行「只顯示目前在籍」。

### 🟡 已完成但還沒收尾

| # | 項目 | 說明 |
|---|---|---|
| 3 | **Lexical Phase 1 沒有開 PR** | 分支 `claude/security-architecture-continuation-i3hw1y`，commit `1205aeb`，已 push。9 支 migration + 9 支 rollback、`supabase/tests/lexical_phase1_test.sql`（89 個 assertion）、`src/lib/lexical/*`、7 支 practice 頁面改接、`docs/lexical/phase1.md`。**還沒開 PR，也還沒跑過任何一支 migration。** |

已 merge 的：PR #125（flashcards 翻轉卡重疊）、#126（ErrorBoundary + boot fallback）、#127（Google 登入提示）。
`origin/main` 在 `02d4a68`。

### ⚪ 使用者主動擱置的

| # | 項目 |
|---|---|
| 4 | 作文成本顯示 + 成本儀表板 |
| 5 | 閱讀測驗題組的檔案格式 |

### ⚪ 我提過、但從來沒處理的

| # | 項目 | 說明 |
|---|---|---|
| 6 | IELTS repo 的 `.env` 被 commit 進去，而且沒有 gitignore | 需要 rotate 金鑰，不只是刪檔 |
| 7 | `is_admin()` 寫死單一 email | Lexical Phase 1 已經改用正式機制，但 `is_admin()` 本身還沒動 |
| 8 | `src/data/mock-essay.ts` 確認是死檔 | 可以刪 |
| 9 | `api/send-writing-review-reminders.ts` 沒有 cron | 寫了但從來沒被觸發過 |
| 10 | 老師端播放的 `storage_path` 決策 | 未決 |
| 11 | speaking rubric evidence → skill mastery | 未決 |

---

## 4. 使用者的長期規則（每一段對話都適用）

1. **全程用繁體中文回覆。** code / SQL / 檔名 / function 名 / table 名 / 環境變數 / git 分支與 commit 名 / 錯誤訊息可以維持英文。
2. **絕對不要請使用者把 `DEEPSEEK_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`GEMINI_API_KEY` 貼到 source code、對話、log 或任何會被 commit 的檔案裡。** 秘密由使用者自己設定。
3. **不要重建或 bootstrap：`writing_submissions`、`writing_texts`、`is_admin()`。**
4. **不要碰 Mock Exam 和 Grammar。** 兩者維持凍結。
5. **使用者用的是 Claude Code web，不要請他跑本機 npm 指令。** 所有 SQL 都是他自己在 Supabase SQL Editor 執行。
6. **每一個 DB 變更都要明確標示**：
   🔴「這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行」
   或 🟢「只要在 production 執行一次」
7. **使用者不會 merge，直到我說出這一句**：「這批推完了，PR #___ 可以合併。」
8. **指定開發分支**：`claude/security-architecture-continuation-i3hw1y`。
   沒有明確許可，不要 push 到其他分支。
