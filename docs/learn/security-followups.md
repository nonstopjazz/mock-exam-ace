# 上線後仍待處理的安全項目

> 這份清單只記錄**已確認**、但**刻意不在這次上線範圍內**處理的項目。
> 每一項都寫清楚：為什麼現在不擋上線、什麼時候會變成必須先做。

---

## 🔴 1. `essays` / `Essays` storage bucket 是公開的

**在啟用照片 / OCR 作文上傳之前，這一項必須先完成。**

### 現況

`PRODUCTION_SCHEMA_AUDIT.md` §9.2（Q24 確認）：

- 全部 8 個 bucket 都是 `public = true`，包含 **`essays` 與 `Essays` 兩個**
- bucket 的 `public` 旗標會**直接繞過** object 層級的 SELECT policy
- `essays_select_policy` 另外把 LIST 授予 `{public}`
- insert / update / delete policy 授予 `{authenticated}`，而且**沒有 owner 判斷式**
  —— 任何登入者都能覆蓋或刪除別人的作文檔案
- `essay_submissions` 有 86 筆真實作文，`image_thumbnail_url` 指進這些 bucket

### 為什麼不擋這次上線

這次上線的作文流程是**純文字打字**：學生的內容寫進 `writing_texts`（RLS 開啟、
owner-scoped、無 UPDATE / DELETE policy），**完全不經過 storage bucket**。
現行的 Writing 路徑上沒有任何一步會讀寫 `essays` / `Essays`。

已經存在於 bucket 裡的 86 筆歷史檔案仍然是公開的 —— 這是**既有**的暴露，
不是這次上線造成的，但也不會因為這次上線而被修好。

### 什麼時候變成阻斷

**Phase 2 的照片 / OCR 上傳一啟用，這一項就是硬性前置條件。**
在那之前若先開放上傳，等於是把新的學生作文寫進一個公開可讀、
且任何登入者都能覆寫的空間。

### 修法概要（不是這次的工作）

1. 先跑 R11 確認實際使用的是哪一個 bucket、路徑慣例是什麼
   （`essays` 與 `Essays` 兩個都要查）
2. 把 `public` 改成 `false`
3. 加上 owner 判斷式，慣例是
   `(storage.foldername(name))[1] = auth.uid()::text`
4. 把所有寫死的 public URL 換成 signed URL
5. 兩個 bucket 都要做 —— 只做一個等於沒做

⚠️ 第 2～4 步每一步都可能弄壞既有的作文應用程式，必須一起規劃、一起驗證。

---

## 🟠 2. 稽核 §9.1 的 11 張 legacy 表

`assignment_submissions · assignments · course_lessons · courses · exam_records ·
exam_types · learning_progress_stats · student_tasks · user_course_access · users ·
vocabulary_sessions`

RLS 關閉 + `anon` / `authenticated` 完整 CRUD + 零政策，兩個獨立查詢確認過。

**不在這次上線範圍內**：這些表屬於另一個應用程式，這個 repo 完全沒有引用它們。
未經呼叫端分析就 `REVOKE` 或開 RLS 會把那個應用弄壞。稽核報告本身也把它
延後到 Phase 0.5B-B，並且撤回了「全部一次 REVOKE」的建議。

⚠️ 命名碰撞要小心：`exam_records` / `exam_types` 屬於這一群，
和 `/exam` 保留領域的 `exams` / `exam_attempts` **不是同一回事**。
後者的 RLS 經稽核 §4.4 確認是正確的。

---

## 🟡 3. 六支函式沒有釘住 `search_path`

`admin_grant_premium`、`admin_revoke_premium`、`claim_pack_with_token(text,text)`、
`get_all_word_progress`、`is_premium_member`、`upsert_word_progress(8-arg)`
（稽核 §9.7）

前兩支在 `fix_admin_rpc_authorization.sql` 裡已補上 NULL-safe 的管理員把關，
但**沒有**加 `SET search_path` —— 那需要把函式內每一個物件都加上 schema 限定，
改動面比這次的授權修補大得多，且沒有已知的可利用路徑。

新寫的 `learn_*` 與 `writing_*` 函式全部都有釘住 `search_path`。

---

## 🟡 4. `invite_tokens` 可被 anon 列舉

稽核 §4.2。`Anyone can validate tokens USING (is_active = true)` 套用在 `{public}`，
且 `anon` 持有 SELECT。字卡兌換碼因此可被列舉。

這次上線沿用既有的「老師發兌換碼 → 學生兌換」流程，你已確認可接受。
班級系統**沒有**用到 `invite_tokens`（班級成員是由老師直接加入名冊）。

---

## ✅ 已於上線前修掉

| 項目 | 修補 |
|---|---|
| `admin_get_all_users` / `admin_get_user_stats` 未登入可讀全部使用者 | `fix_admin_rpc_authorization.sql` |
| `admin_grant_premium` / `admin_revoke_premium` 完全沒有授權分支 | 同上 |
| `/admin/users` 把 `{"success": false}` 當成成功 | `src/pages/admin/UsersAdmin.tsx` |
| `learn_touch_updated_at()` 漏掉具名 REVOKE | `create_learn_classes_tasks.sql` |
| `/learn/parent`、`/learn/teacher/session` 未登入可看到示範學生資料 | 包進 `RequireAdmin` |
