# F. Existing automation / notification inventory

## Cron（`vercel.json`）

| path | schedule | 與 writing 的關係 |
|---|---|---|
| `/api/send-daily-reminders` | `0 12 * * *`（UTC＝台北 20:00） | ★ **順手帶一腳作文提醒**（見下） |
| `/api/writing-images-cleanup` | `20 19 * * *` | 刪過期原圖，與分析無關 |
| `/api/speaking-cleanup` | `40 19 * * *` | 口說模組 |

⚠️ `api/send-writing-review-reminders.ts` **存在但沒有自己的 cron**。它是同一個模組
（`api/_lib/writingReviewReminder.ts`）的第二個呼叫者，目前只能手動打，
註解寫明是「手動試跑，以及之後想換時間時直接掛自己的 cron」。

## 既有的通知管道

**只有 Web Push。** `api/_lib/writingReviewReminder.ts` 第 4 行寫明：
> 走 Web Push（這個專案既有的通知管道），不是 email —— **專案裡沒有任何寄信能力**。

| 元件 | 現況 |
|---|---|
| `push_subscriptions` 表 | ✅ 有 |
| `writing_reminder_push_targets()` | ✅ 有 —— 找出該收作文提醒的人 |
| `writing_pending_digest()` | ✅ 有 —— 待處理篇數摘要 |
| `writing_pending_summary_internal()` | ✅ 有 —— `REVOKE ALL` 連 service_role 都收回，只給其他函式呼叫 |
| email | ❌ **完全沒有** |
| notification 表（站內信／alert 收件匣） | ❌ **完全沒有** |
| admin notification | ⚠️ 只有 push，沒有持久化的 alert |
| queue / background worker | ✅ **有，而且很完整**（見下） |

**既有的抑制規則**（做 weekly alert 時應該沿用）：
> 🛑 沒有待處理的作文就【什麼都不送】。每天一則「目前沒有待處理」的通知，三天之後就會被當成雜訊關掉，連帶真的有事的那天也看不到。

## 既有的 queue / worker

| 元件 | 說明 |
|---|---|
| `writing_queue_claim()` | `pg_advisory_xact_lock(778811)`，**concurrency = 1 由資料庫保證** |
| 租約 | `lease_expires_at` / `lease_worker_id` / `queue_attempts`，過期可被重新認領 |
| `writing_queue_release()` | 釋放 |
| `kickWorker(depth, path)` | 鏈式接力，不是 for-loop；老師關瀏覽器照跑 |
| `writing_daily_analysis_cap()` / `_used()` | 每日上限 |
| `writing_analysis_cost_estimate()` | 依**實際 telemetry** 估算，不是寫死常數 |

## 對照你的三個未來需求

| 需求 | 可以直接沿用嗎 |
|---|---|
| 每篇作文完成後觸發分析 | ⚠️ **半套**。worker 鏈與 `kickWorker` 都在，但**送出時完全沒有觸發點** —— `submit_writing_essay()` 不會 enqueue。需要一個新的觸發（trigger 或送出端呼叫 `writing_enqueue_analysis`） |
| 每週定期掃描 | ⚠️ **半套**。cron 機制在（Vercel crons），`send-writing-review-reminders.ts` 這個殼也在，但**沒有掛上 schedule**，也沒有「掃描什麼」的邏輯 |
| 建立老師 alert / insight | ❌ **沒有**。只有即時 push，**沒有任何 alert/insight 的持久化表**。push 送出去沒人看到就沒了 |

---

# G. Reusable components list

## 直接可用（已經在 `/admin/writing` 用著）

| 需求 | 現成的東西 | 位置 |
|---|---|---|
| filter bar | 5 個 `<Select>` 排在 `<Card className="p-6">` 裡的 grid | `WritingGrading.tsx:280–340` |
| select | `@/components/ui/select`（shadcn） | ✅ |
| checkbox selection | `@/components/ui/checkbox` + `Set<string>` + 全選 + 「只對 visible 生效」的既有邏輯 | `WritingGrading.tsx:131–165` |
| bulk action toolbar | 獨立 `<Card>`：全選 label + 計數 + 動作按鈕（含「重試失敗項目」） | `WritingGrading.tsx:344–395` |
| badge | `@/components/ui/badge` + `analysisBadge()` 的 tone map | `gradingQueue.ts` |
| modal | `<BatchAnalyzeDialog>` —— **確認框 + 成本估算 + loading，已經寫好了** | `components/admin/writing/BatchAnalyzeDialog.tsx` |
| AI analysis panel | `<WritingReportView>` —— 三軸 accordion，**錯誤區塊已含 code badge / 原文引用 / 改成 / 理由** | `components/learn/writing/report/WritingReportView.tsx` |
| loading | `<WritingLoading label="…">` | `components/learn/writing/writingShared.tsx` |
| 空狀態 | 既有的「沒有符合篩選條件」兩行式樣板 | `WritingGrading.tsx:406–418` |
| 錯誤狀態 | `<Alert variant="destructive">` + `toast.error` | 同上 |
| admin 頁首 | `<AdminPageHeader icon title subtitle action>` | `components/admin/AdminPageHeader.tsx` |
| 統計卡 | 三張 `bg-gradient-to-br from-X/10 to-Y/10 border-X/20`（設計系統的招牌樣式） | `WritingGrading.tsx:228–278` |
| 輪詢 | `useWritingQueue` 的「只在有事在動時每 10 秒 silent reload」 | `hooks/learn/useWritingQueue.ts` |
| 重試 / error handling | `enqueue()` 回 `{ok, result, error}` 的 outcome 樣式 + `describeEnqueue()` 把跳過原因講成人話 | 同上 |

## 需要新做（shadcn 原生有底，但專案內沒有組過）

| 需求 | 現況 |
|---|---|
| **multiselect** | ❌ 沒有。`ui/command.tsx` + `ui/popover.tsx` 都在，但沒有組成 multi-select。錯誤分類篩選大概會需要它（17 個 code 用單選 Select 很難用） |
| **data table** | ❌ 沒有用 `ui/table.tsx`。`/admin/writing` 是 `divide-y` 的清單，不是表格。要做排序欄位得自己來 |
| **pagination** | ❌ `ui/pagination.tsx` 存在但**整個 admin 沒有任何地方用過** |
| drawer / sheet | ⚠️ `ui/drawer.tsx` / `ui/sheet.tsx` 存在；`Sheet` 只有 Navbar 手機選單用過 |
| notification / alert 元件 | ⚠️ 只有 `ui/alert.tsx` 與 sonner toast。**沒有持久化的 alert 清單 UI** |
