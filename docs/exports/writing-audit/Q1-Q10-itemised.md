# 逐項回答（第 1–10 題）

## 1. `/admin/writing` 現況

| 項目 | 現況 |
|---|---|
| route | `/admin/writing`（清單）· `/admin/writing/:essayId`（單篇），兩條都包 `<RequireAdmin>` |
| page | `src/pages/admin/WritingGrading.tsx`（523 行）· `WritingGradingDetail.tsx`（272 行） |
| component | `components/admin/writing/BatchAnalyzeDialog.tsx` 是**唯一**的專屬子元件 |
| hook | `useWritingQueue`（清單）· `useAdminWritingAnalysis`（單篇）· `useWritingGrading`（觸發） |
| 純函式 | `src/lib/writing/gradingQueue.ts`（狀態推導、badge、文案） |

**現有 filter（5 個，全部是單選 `<Select>`）**

| filter | 值 | 選項來源 |
|---|---|---|
| 班級 | `ALL` + 動態 | 從已載入的 rows 的 `class_names[]` 蒐集 |
| 題目 | `ALL` + 動態 | 從 rows 的 `essay_topic` 蒐集 |
| 分析狀態 | `ALL` / `NONE` / `QUEUED` / `RUNNING` / `DONE` / `FAILED` | `ANALYSIS_STATE_LABEL` 常數 |
| 檢閱狀態 | `PENDING`（預設）/ `REVIEWED` / `ALL` | `teacher_reviewed` |
| 提交時間 | `ALL` / `TODAY` / `7D` / `30D` | `submitted_at` 前端計算 |

**其他**：沒有錯誤分類、沒有等第、沒有字數、沒有文字搜尋。

- **filter state 怎麼保存**：5 個獨立 `useState`。**沒有 URL query、沒有 localStorage、沒有 context**。重新整理全部回預設
- **前端 filter 還是 Supabase query**：**100% 前端**。`useMemo` 對已載入的全部 rows 做 `.filter()`。Supabase 端唯一的條件是 `WHERE s.status = 'SUBMITTED'`
- **分頁**：❌ 沒有。`writing_admin_queue()` 一次回傳全部，沒有 LIMIT/OFFSET/cursor
- **sorting**：固定 `submitted_at DESC`（在 RPC 內），UI 無法改
- **search**：❌ 沒有
- **每列欄位**：學生姓名 · 標題 · 班級（多班以「、」串）· 題目 · 字數 · 相對時間 · 分析版次（>1 時）· 失敗原因（截兩行）· 「有講評」badge · 分析狀態 badge · 檢閱勾勾 · `>`
- **bulk selection**：✅ 有。`Set<string>`、全選、**只對 visible 且 `isEnqueueable` 的列生效**（已篩掉的不會被偷偷送出）、「重試失敗項目（N）」、「批次開始 AI 分析（N）」
- **detail 入口**：✅ 整列連到 `/admin/writing/:essayId`。❌ **沒有 student detail 入口**

---

## 2. Writing 相關資料庫
→ 見 **`D-database-map.md`**（9 張表逐欄、34 支 RPC、索引、RLS、trigger、讀寫者）

一句話：**全部有 DDL、全部有 rollback、全部 `SET search_path = ''`**。這個模組的安全衛生是整個專案最好的。

---

## 3. AI 作文批改流程
→ 見 **`00-INDEX-and-diagrams.md` 的 C 圖**

| 問題 | 答案 |
|---|---|
| model | **DeepSeek `deepseek-chat`** |
| prompt 位置 | `api/_lib/writingPrompts.ts` |
| output 格式 | **JSON**（`response_format: json_object`）+ 逐項驗證 |
| 固定 error code | ✅ **17 個** |
| 句級 correction | ✅ `ErrorFinding.correction` 必填 |
| grammar/vocab/coherence 分類 | ✅ W1–W5 |
| weakness / recurring | ⚠️ 單篇 `needs_work` 有；**recurring 完全沒有** |
| 保存 AI 原始 response | ❌ **沒有** |

⚠️ 注意：`analyze-writing.ts` 裡的 `prior` **是同一支 pass 的上一次嘗試**（修復迴圈），**不是前幾篇作文**。

---

## 4. 現有 Writing Taxonomy
→ 見 **`E-taxonomy-inventory.md`**（三軸完整清單 + 你點名的每個關鍵字逐一比對）

**H1–H5 就是 Axis 3 的五個 category**（句構技巧／字彙成熟度／篇章技巧／修辭風格／內容思維），不是 heading 層級。

---

## 5. 跨作文歷史資料

| 問題 | 答案 |
|---|---|
| 能以 `student_id` 查學生所有歷史作文？ | ⚠️ **資料表可以，但沒有 API**。`writing_submissions.student_id` 有索引；但唯一的清單函式 `writing_student_essay_cards()` **是 self-only、不收 `student_id` 參數**（註解明講「不存在『傳別人的 id』這種用法」） |
| 能依時間排序？ | ✅ 資料層可以（`essay_date` / `submitted_at` / `created_at`） |
| 已有 student writing history API / hook？ | ❌ **沒有 admin 端的**。學生端有 `useEssayCards`（只看自己） |
| AI 分析時讀前幾篇？ | ❌ **完全沒有**。prompt 只有這一篇的文字 |
| 已有跨篇 aggregation？ | ❌ 沒有。唯一的聚合是 `writing_queue_summary()`，那是**佇列統計**不是學習分析 |
| 已有 student-level writing profile？ | ❌ 沒有 |

---

## 6. 現有通知／排程機制
→ 見 **`F-G-automation-components.md`**

重點：**只有 Web Push，沒有 email，沒有 notification/alert 表**。
`api/send-writing-review-reminders.ts` 有端點但**沒掛 cron**，目前只能手動打。
queue / worker / 租約 / 每日上限 / 成本估算**非常完整**。

---

## 7. 現有 AI 手動觸發能力 — **這一項已經做好了**

| 問題 | 答案 |
|---|---|
| `/admin/writing` 有按鈕可重跑 AI？ | ✅ 「批次開始 AI 分析（N）」+「重試失敗項目（N）」 |
| 可針對單篇重新分析？ | ✅ `/admin/writing/:essayId` 有按鈕 → `POST /api/analyze-writing` |
| 可批次對多位學生執行 action？ | ✅ 勾選跨學生、跨班級都可以 |
| 有 Edge Function / API 可被按鈕觸發？ | ✅ `/api/writing-queue-enqueue`（批次）· `/api/analyze-writing`（單篇）· `/api/writing-queue-worker`（背景） |
| 有 loading / retry / error pattern 可沿用？ | ✅ `queue.busy` 停用按鈕 · `Loader2` 動畫 · `{ok, error}` outcome · `describeEnqueue()` 把跳過原因講成人話 · toast 分級（success/warning/error）· 「佇列卡住」的 Alert + 「繼續處理佇列」按鈕 |

---

## 8. 學生與班級關係

| 問題 | 答案 |
|---|---|
| submission 如何關聯 student | `writing_submissions.student_id` → `auth.users(id)` ON DELETE CASCADE |
| student 如何關聯 class | `learn_class_members(class_id, student_id)`，`UNIQUE(class_id, student_id)`，**軟移除 `left_at`** |
| 一個學生可屬多班？ | ✅ **可以**。所以 queue 用 `array_agg` 回 `class_names[]`，UI 以「、」串接 |
| class filter 的實際 query path | `writing_admin_queue()` 內的 LATERAL：`learn_class_members m JOIN learn_classes c ON c.id = m.class_id WHERE m.student_id = s.student_id AND c.status = 'ACTIVE'` → 回 `names[]`。**前端再比對字串** |
| teacher → class → student 權限限制 | ❌ **沒有**。所有老師端函式都是 `is_admin()` 全有或全無。而 `is_admin()` 本身硬編碼單一 email |

🛑 **一個實際的 bug 風險**：class filter 的 LATERAL **只過濾 `c.status = 'ACTIVE'`，沒有過濾 `m.left_at IS NULL`**。
學生退出班級後，他的舊作文**仍然會被算進那個班**。要做「依班級篩學生」之前應該先確認這是不是預期行為。

---

## 9. 可重用元件
→ 見 **`F-G-automation-components.md` 的 G 段**

**現成可用**：filter bar 版型 · Select · Checkbox 勾選邏輯 · bulk action toolbar · Badge + tone map · `BatchAnalyzeDialog`（確認 + 成本估算）· `WritingReportView`（AI 分析面板，錯誤區塊已完整）· `WritingLoading` · 空／錯誤狀態樣板 · `AdminPageHeader` · 統計卡 · 輪詢 · outcome 錯誤處理

**需要新做**：multiselect（`ui/command` + `ui/popover` 可組）· data table（`ui/table` 沒被用過）· pagination（`ui/pagination` 整個 admin 都沒用過）· 持久化 alert 清單 UI

---

## 10. Technical Debt / Gaps
→ 見 **`H-I-gaps-and-minimal-change.md`**（H1 可沿用 / H2 沒保存 / H3 一定要新增 / H4 資料不足的七個語意陷阱 / H5 無 DDL / H6 重複與 legacy）

**最重要的一句**：`count = 0` 的意思是「**本篇**未發現此類錯誤」，**不是**「已精熟」。
這條規則已經寫死在 `analysisContract.ts` 裡（TR-12 / TR-13）。做跨篇統計時如果把它當成能力訊號，會對學生說出沒有根據的話。
