# 口說練習 — 上線手冊

> 學生挑一題、錄一段、上傳。錄音檔保存 90 天。
> **預設不對任何人開放**，要在 `/admin/feature-access` 逐班或逐人打開。

---

## 這一批做了什麼、沒做什麼

| 做了 | 沒做 |
|---|---|
| 口說題庫（IELTS Part 1／2／3 形狀） | AI 批改（**下一批**） |
| 學生選題、錄音、試聽、上傳 | 分數、band、回饋 |
| 「我練過的」：回頭播放自己的錄音 | 老師端聽錄音、寫評語 |
| 逐班／逐人的開放控制（預設全關） | 開放給「所有人」的一鍵開關 |
| 錄音檔 90 天保存、到期清理用的 RPC | 排定清理排程（見下方「還沒接上的那一步」） |

**畫面上為什麼一個字都沒提批改**：這一批沒有批改。寫「分析中」而後面沒有東西接，
比什麼都不寫更糟——學生會等，等不到之後就不再相信這個網站上的其他狀態。

---

## 上線順序

### 1. 🔴 五份 SQL：先在 gsat-staging 執行並確認，再在 production 執行

**必須照這個順序**，後面每一份都依賴前一份：

1. `supabase/migrations/create_learn_feature_access.sql`
2. `supabase/migrations/create_speaking_prompts.sql`
3. `supabase/migrations/create_speaking_recordings.sql`
4. `supabase/migrations/create_speaking_rpcs.sql`
5. `supabase/migrations/create_speaking_bucket.sql`

第 5 份**只能在真正的 Supabase 專案執行**（本機 PostgreSQL 沒有 `storage` schema）。
它會建立私有 bucket `speaking-recordings`（20 MB 上限、只收音訊型別）與四條
Storage 政策。

每一份都有對應的 `.rollback.sql`。第 5 份的回滾**刻意不刪 bucket**——
bucket 裡是學生的錄音，刪掉就沒了。

### 2. 部署前端

不需要新的環境變數。

### 3. 建題庫

`/admin` →「口說練習」→ 新增題目。
Part 1／3 填主題（選填）與問題；Part 2 填卡片標題、提示語與要點。

### 4. 開放給人

`/admin/feature-access`。勾班級、或用搜尋逐個加學生。
**沒有這一步，學生端什麼都看不到**——包含已經部署好的頁面。

頁面最上方的「目前看得到的人」是去重後的實際人數（班級與個別重疊只算一次）。
那個數字是 0 就代表還沒有人看得到。

---

## 驗證（staging）

跑完五份 SQL 之後，在 SQL Editor 執行：

```sql
-- 1. 五張表／函式都在
SELECT to_regclass('public.learn_feature_access')  IS NOT NULL AS t_access,
       to_regclass('public.speaking_prompts')      IS NOT NULL AS t_prompts,
       to_regclass('public.speaking_recordings')   IS NOT NULL AS t_recordings;

-- 2. bucket 是私有的
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets WHERE id = 'speaking-recordings';
-- 期待：public = false

-- 3. 沒有任何角色拿得到表的直接權限（學生的寫入一律走函式）
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_name IN ('speaking_prompts', 'learn_feature_access');
-- 期待：0 列

-- 4. 清理函式只有 service_role 叫得到
SELECT has_function_privilege('authenticated', 'speaking_cleanup_candidates(integer)', 'EXECUTE')
         AS authenticated_can_execute;
-- 期待：false
```

畫面上再走一次：

1. 用**沒有被開放**的學生帳號打開 `/learn/student/speaking` → 應該看到「功能未開放」。
2. 在 `/admin/feature-access` 把那位學生加進去 → 重新整理 → 進得去了。
3. 錄一段 10 秒，上傳 → 「我練過的」出現一列，按播放聽得到。
4. 回到 `/admin/feature-access` 收回 → 學生重新整理 → 又看不到了，
   **但「我練過的」那筆紀錄沒有消失**（收回的是可見性，不是資料）。

---

## 安全上的兩個重點

**開放檢查在資料庫裡，不在前端。**
`StudentFeatureGate` 只決定畫面出不出現。藏起來的頁面仍然打得到 RPC，所以
`speaking_available_prompts()` 與 `speaking_start_practice()` 各自再檢查一次
`learn_feature_enabled('speaking')`。把閘拆掉、直接用 fetch 打 RPC，一樣會被擋。

**路徑歸屬。**
清理排程是用 service_role 去 Storage 刪檔的，那把鑰匙繞過 Storage RLS。
所以 `speaking_register_recording()` 要求 `storage_path` 必須以
`<自己的 uid>/<這次練習的 id>/` 開頭。少了這一條，學生可以把別人的錄音
登記成自己的練習、或讓清理排程刪掉別人的檔案。與拍照作文的
`register_writing_image` 是同一個防護。

---

## 保存期與清理：還沒接上的那一步

`speaking_cleanup_candidates()` 與 `speaking_mark_deleted()` 已經寫好了，
但**還沒有任何排程在呼叫它們**。錄音檔目前會一直留著。

要接的時候，順序是固定的：

```
speaking_cleanup_candidates(200)   ← 撈出上傳超過 90 天的
  → supabase.storage.remove(paths) ← 先刪 Storage
  → speaking_mark_deleted(ids)     ← 成功之後才標記
```

反過來會留下「資料庫說刪了、檔案還在」的孤兒，而且再也掃不到。

⚠️ 90 天是從 **`uploaded_at`** 起算，不是 `created_at`。
學生可能開了一次練習就跑掉、三個月後才回來錄音；用 `created_at` 的話，
那個檔案一上傳就符合刪除條件，他隔天就聽不到自己剛錄的東西。

---

## 錄音格式

| 瀏覽器 | MediaRecorder 實際給的 |
|---|---|
| Chrome／Edge／Firefox | `audio/webm;codecs=opus` |
| Safari（iOS／macOS） | `audio/mp4` |

上傳時送的 `contentType` 是**主型別**（`audio/webm`），不是完整字串——
bucket 的 `allowed_mime_types` 是精確比對，`audio/webm;codecs=opus` 會被擋在門外。
見 `src/lib/speaking/audio.ts` 的 `baseMimeOf()`。

錄音需要 **https**（或 localhost）。http 的頁面 `getUserMedia` 直接不給。

---

## 本機測試

```bash
createdb sp
psql -d sp -f tests/sql/_writing_local_harness.sql
psql -d sp -c "CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES auth.users(id), display_name TEXT, email TEXT);"
psql -d sp -f supabase/migrations/create_learn_classes_tasks.sql
psql -d sp -f supabase/migrations/create_learn_feature_access.sql
psql -d sp -f supabase/migrations/create_speaking_prompts.sql
psql -d sp -f supabase/migrations/create_speaking_recordings.sql
psql -d sp -f supabase/migrations/create_speaking_rpcs.sql
psql -d sp -f tests/sql/speaking_test.sql      # FAIL 0 / PASS 73
```

`create_speaking_bucket.sql` 不在本機測——沒有 `storage` schema。

測試一開頭會先清掉自己的夾具，所以可以在同一個資料庫重複執行。

---

## 下一批（AI 批改）要動到什麼

- `speaking_recordings.status` 已經允許 `'GRADED'`，CHECK 不用改。
- `ai_*` 欄位刻意還沒建：等真的接上模型、知道確切形狀時，用一份 additive
  migration 加上去。先開一堆空欄位只會在下一批被改掉一次，而中間這段時間，
  任何人讀 schema 都會以為那些欄位有意義。
- gsat 既有的口說能力分類（`LEARNING_DOMAIN_MODEL.md` §9.12）本來就是
  IELTS 的那四項、同樣的順序：S1 Fluency & Coherence／S2 Lexical Resource／
  S3 Grammatical Range & Accuracy／S4 Pronunciation & Intonation。
  批改結果要對進這組 skill code，不要另外發明一套。
