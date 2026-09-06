# 班級與任務指派系統 —— 部署清單

> Phase 1 範圍：**HOMEWORK**（一次性作業）與 **RECURRING**（常態練習）。
> 🛑 沒有 Digital Assignment、沒有課表／堂次／行事曆、沒有 per-student 內容例外、
> 沒有通知／家長／附件／討論串／細部評分表。

---

## 1. 一次性 migration（staging 先跑）

在 Supabase SQL Editor 依序執行：

1. `supabase/migrations/create_learn_classes_tasks.sql`

這份 migration **完全 additive**：不動 `writing_*`、`packs`、`exam_*`、
`user_profiles`、`premium_memberships`、`is_admin()`。

回滾用 `supabase/migrations/create_learn_classes_tasks.rollback.sql`
（⚠️ 會刪掉所有班級、名冊、任務、指派與打卡紀錄）。

---

## 2. 部署後驗證（唯讀，可以直接在 staging / 正式環境貼上執行）

`tests/sql/learn_classes_verify.sql` → 預期 **15 / 15**

它檢查：五張表存在且欄位數正確、三條型別 CHECK、三組唯一鍵、
**五張表對 anon / authenticated / service_role 零授權**、RLS 已啟用且零政策、
15 支 RPC 皆 SECURITY DEFINER 且鎖定 search_path、anon 不能執行任何一支、
內部輔助函式不對 anon / authenticated 開放、既有系統未受影響。

> ⚠️ 「零授權」這一項是最容易在 staging 才爆的。Supabase 的
> `ALTER DEFAULT PRIVILEGES` 會自動把 ALL 授予三個角色，
> `REVOKE ... FROM PUBLIC` 收不掉——必須點名收回。
> 本機測試就是靠這一項抓到 `learn_touch_updated_at()` 漏掉 REVOKE。

---

## 3. 安全與行為測試（🛑 本機專用，會寫入資料）

```
psql -f tests/sql/_writing_local_harness.sql
psql -c "CREATE TABLE user_profiles (...);"     # 見 harness 檔頭
psql -f supabase/migrations/create_learn_classes_tasks.sql
psql -f tests/sql/learn_classes_security_test.sql
```

預期 **48 / 48**。涵蓋：

- 表層權限、RLS、政策數
- 學生不能建班／不能搜尋使用者目錄／不能替自己蓋老師確認章
- `is_admin()` 回 NULL 時也擋下
- 學生只拿到指派給自己的任務，回傳不含同班同學的任何資料
- 學生不能替別人打卡、不能自述沒指派給自己的作業
- **學生端函式原始碼裡沒有任何 `teacher_*` 欄位賦值**（靜態檢查）
- NEXT_CLASS 解析：`due_date` 保持 NULL、改班級日期會一起移動、CUSTOM_DATE 不受影響
- 全班指派只產生一列任務內容
- 名冊軟移除保留歷史、重新加入不會產生第二列
- 有紀錄的學生被移出指派名單時會保留而不是靜靜刪掉

---

## 4. 正式環境上線前

### Migration 順序（全部 additive）

| # | 檔案 | 作用 |
|---|---|---|
| 1 | `fix_admin_rpc_authorization.sql` | 🔴 **先跑這支**。修掉四支 admin RPC 未登入可呼叫的破口 |
| 2 | `create_writing_analyses.sql` | 作文分析 |
| 3 | `add_writing_analyses_analyzed_at.sql` | ↑ |
| 4 | `add_writing_analyses_telemetry.sql` | ↑ |
| 5 | `add_writing_analyses_stage1_progress.sql` | ↑ |
| 6 | `create_writing_teacher_feedback.sql` | 老師講評 |
| 7 | `create_learn_classes_tasks.sql` | 班級與任務 |

第 1 支排最前面，是因為這次上線會把真實學生的姓名、年級、學校寫進
`user_profiles` —— 破口本身是既有的，但曝險面是這次上線放大的。

### 驗證

- [ ] `tests/sql/launch_surface_rpc_check.sql`（唯讀）→ 四支 admin RPC 的
      「anon可執行」都是 f、「守門有防NULL」都是 t
- [ ] `tests/sql/launch_surface_rls_check.sql`（唯讀）→ 17 張表沒有 🔴
- [ ] `tests/sql/staging_writing_analyses_verify.sql` → 24 / 24、36 欄
- [ ] `tests/sql/learn_classes_verify.sql` → 15 / 15
- [ ] 正式環境跑 `create_learn_classes_tasks.sql`
- [ ] 正式環境跑 `learn_classes_verify.sql` → 15 / 15（`SKIP` 項應該變成 `PASS`）
- [ ] `/admin/classes` 已在管理員首頁導覽中（本次已加）
- [ ] 建第一個班、設定下次上課日期、加入學生（學生**必須先註冊過**）
- [ ] 指派一筆 HOMEWORK 給全班、一筆只給單一學生
- [ ] 指派一筆 RECURRING（例：每天複習單字 1 次）
- [ ] 用學生帳號確認 `/learn/student` 的「我的任務」卡與
      `/learn/student/tasks` 只看得到自己的任務
- [ ] 學生標記完成 → 老師在 `/admin/classes/:id` 看到「學生已標記」→ 老師確認
- [ ] 改班級的下次上課日期，確認 NEXT_CLASS 作業一起移動、CUSTOM_DATE 不動

---

## 已知的 Phase 1 取捨

| 取捨 | 理由 |
|---|---|
| 沒有 `mode`（TUTOR / GROUP）欄位 | 一對一 vs 小團班由在籍人數推導，少一個會和名冊不同步的欄位 |
| 內容不同 = 另一個任務 | 守住「不依學生複製內容」；per-student override 留給之後 |
| 打卡一天一列（`done_count` 記次數） | 好查好顯示，且不預先產生每日任務列 |
| 打卡只能補登過去 6 天 | 再往回補會讓「本週進度」失去意義 |
| 中途入班不自動補指派既有作業 | 不憑空產生他沒被交代過的任務；班級頁另有明確的補指派動作 |
| 學生端看不到同班同學名單 | 「看不到其他學生進度」的最保守解讀 |
| 時區固定 `Asia/Taipei` | 資料庫是 UTC，前後端各自推算一定漂移 |
