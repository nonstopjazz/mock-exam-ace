# Writing / Admin Writing / AI Feedback —— 現況架構稽核

> **純唯讀盤點。** 沒有修改任何程式碼、資料庫、Prompt、API 或 UI；沒有建立 migration、沒有新增 table、沒有設計新 taxonomy、沒有 commit。
>
> 來源：`main` @ `02d4a68`（PR #127 合併後）· 日期 2026-09-20

---

## 一句話總結

**你要的東西有八成已經在了。** 三軸 taxonomy（含 17 個 error code）、句級 correction、批次觸發、佇列、成本護欄、Web Push —— 全部已上線。
真正缺的只有**兩件事**：錯誤資料存在 JSONB 裡**沒有可查詢的形狀**，以及**完全沒有任何跨篇的概念**。

---

## A. Current architecture diagram

```
┌─────────────── 學生端 ────────────────┐     ┌────────────── 老師端（admin）──────────────┐
│ /learn/student/writing                │     │ /admin/writing          收件匣（佇列）      │
│ /learn/student/writing/new            │     │ /admin/writing/:essayId 單篇批改            │
│ /learn/student/writing/:essayId       │     │   RequireAdmin → is_admin()                │
│   FeatureGate(writing_submission)     │     └─────────────┬──────────────────────────────┘
│   + ProtectedRoute                    │                   │
└──────────────┬────────────────────────┘                   │
               │ writing_student_essay_cards()              │ writing_admin_queue()
               │ writing_student_analysis()   ← 策展過       │ writing_admin_analysis()
               │ （只看得到自己的、只在 COMPLETED）           │ writing_queue_summary()
               ▼                                            ▼
┌───────────────────────────── Supabase（public schema）──────────────────────────────┐
│                                                                                     │
│  writing_submissions ──1:N──► writing_texts      （append-only，最新一列為準）        │
│        │                 └──► writing_images     （照片作文，raw → archive）          │
│        │                 └──► writing_ocr_runs   （Google Vision）                   │
│        │                                                                            │
│        ├──1:N──► writing_analyses   ★ 分析結果全部在這裡（JSONB）                     │
│        │           competency_analysis / error_analysis / high_score_feature_analysis│
│        │           overall_evaluation / strengths / needs_work / next_steps          │
│        │           + 佇列租約 + telemetry + 狀態機                                    │
│        │                                                                            │
│        ├──1:1──► writing_teacher_reviews   （老師按過「完成檢閱」）                    │
│        └──1:1──► writing_teacher_feedback  （老師手寫講評，選填）                      │
│                                                                                     │
│  learn_classes ──1:N──► learn_class_members ──► auth.users（學生）                   │
│                          （軟移除 left_at；一個學生可屬多班）                          │
│  push_subscriptions ──► auth.users                                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
               ▲                                            ▲
               │ service_role                               │ service_role
┌──────────────┴────────────────────────────────────────────┴──────────────────────────┐
│ Vercel serverless（api/）                                                             │
│   analyze-writing.ts        四支 pass + 綜合層，DeepSeek                               │
│   writing-queue-enqueue.ts  批次排入 + 踢 worker                                       │
│   writing-queue-worker.ts   認領租約 → 呼叫 analyze → 釋放 → 踢下一腳                   │
│   writing-images-process.ts / writing-images-cleanup.ts                               │
│   send-daily-reminders.ts   ← cron 0 12 * * *（順手帶作文提醒）                         │
│   send-writing-review-reminders.ts ← 同一模組，獨立端點（【沒有】自己的 cron）            │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼  https://api.deepseek.com/chat/completions
                              model: deepseek-chat
```

---

## B. `/admin/writing` current filter / data-flow diagram

```
掛載
 └─ useWritingQueue()
      ├─ supabase.rpc("writing_admin_queue")    ← ⚠️ 一次撈【全部】已送出作文
      │     SECURITY DEFINER · is_admin() 把關
      │     回傳一個 JSONB 陣列，沒有 LIMIT、沒有 OFFSET、沒有參數
      │     內含 LATERAL：最新 writing_texts、最新 writing_analyses、
      │                   teacher_reviews、teacher_feedback、class_names[]
      │     ORDER BY submitted_at DESC（伺服器端唯一的排序）
      └─ supabase.rpc("writing_queue_summary")  ← 統計卡片用

                    ▼ rows: WritingQueueRow[]（全部留在 React state）

篩選（100% 在瀏覽器，useMemo）
 ├─ classFilter   ← 從 rows 的 class_names[] 動態蒐集選項
 ├─ topicFilter   ← 從 rows 的 essay_topic 動態蒐集選項
 ├─ stateFilter   ← analysisState(row) 推導：NONE/QUEUED/RUNNING/DONE/FAILED
 ├─ reviewFilter  ← teacher_reviewed（預設 PENDING）
 └─ timeFilter    ← submitted_at：ALL / TODAY / 7D / 30D
                    ▼ visible: WritingQueueRow[]

勾選（Set<string>，只對 visible 且 isEnqueueable 的列有效）
                    ▼
批次動作
 ├─ 估算  supabase.rpc("writing_analysis_cost_estimate", { p_count })
 ├─ 確認  <BatchAnalyzeDialog>
 └─ 送出  POST /api/writing-queue-enqueue { essayIds, force }
              └─ writing_enqueue_analysis_batch() → 每日上限檢查 → kickWorker()

輪詢：只在 summary.worker_busy || work_waiting 時，每 10 秒 silent reload
```

**現況要點**

| 項目 | 現況 |
|---|---|
| filter state | 全部是 `useState`，**沒有 URL query、沒有 localStorage** —— 重新整理就回到預設 |
| 查詢位置 | **前端 filter**。Supabase 只做 `status='SUBMITTED'` 與排序 |
| 分頁 | **沒有** |
| 排序 | 固定 `submitted_at DESC`，UI 無法改 |
| 搜尋 | **沒有**（沒有學生姓名／標題的文字搜尋框） |
| bulk selection | ✅ 有，`Set<string>` + 全選 + 「重試失敗項目」 |
| 每列欄位 | 學生姓名、標題、班級（多班以「、」串接）、題目、字數、相對時間、分析版次、分析狀態 badge、有無講評 badge、錯誤摘要（失敗時）、檢閱勾勾 |
| detail 入口 | ✅ 整列連到 `/admin/writing/:essayId` |
| student detail 入口 | ❌ **沒有**。點不進「這個學生的所有作文」 |

---

## C. Writing AI pipeline diagram

```
學生送出
  └─ submit_writing_essay() / submit_writing_image_essay()
       writing_submissions.status = 'SUBMITTED'
       writing_texts 寫入一列（append-only）

            ⚠️ 這裡【沒有】任何自動觸發。送出不會開始分析。

老師在 /admin/writing 勾選 → 批次送出
  └─ POST /api/writing-queue-enqueue
       ├─ essayAuth：驗 JWT → 以該使用者身分呼叫 is_admin()
       ├─ writing_enqueue_analysis_batch(essayIds)
       │    · 每日上限 writing_daily_analysis_cap()
       │    · 每篇建立 writing_analyses 一列，status = 'QUEUED'
       │    · 逐篇結果：ENQUEUED / ALREADY_ACTIVE / SKIPPED_COMPLETED /
       │              NOT_SUBMITTED / NO_TEXT / DAILY_CAP
       └─ kickWorker() → POST /api/writing-queue-worker

/api/writing-queue-worker（背景，與瀏覽器無關）
  └─ writing_queue_claim()   ← pg_advisory_xact_lock(778811)，concurrency = 1
       取得租約 lease_expires_at / lease_worker_id
       └─ POST /api/analyze-writing

/api/analyze-writing  ── Stage 1：四支 pass，各自獨立驗證與重試 ──
  ├─ competency        competencyMessages()      → W1–W5 × 23 skills
  ├─ error             errorMessages()           → 17 error codes  ★
  ├─ high_score_h1_h3  highScoreMessages(H1–H3)
  └─ high_score_h4_h5  highScoreMessages(H4–H5)
        每支：callDeepSeek(model=deepseek-chat, response_format=json_object)
              → JSON.parse
              → validateXxxAnalysis()   ← 擋不合法 code、擋引文不在原文、擋 fallback 濫用
              → 失敗則把上一次的輸出 + repairInstruction 再送一次（MAX_PASS_ATTEMPTS = 3）
              → 每次嘗試寫進 stage1_telemetry
        四支全 VALID → status = 'ANALYZED'，三個 JSONB 欄位落地

  ── Stage 2：綜合層 ──
  └─ compressForSynthesis() → synthesisMessages(digest, citableRefs)
        → validateSynthesis()
        → overall_evaluation / strengths / needs_work / next_steps
        → status = 'COMPLETED'，report_ready

  worker 釋放租約 → 踢下一腳（鏈式，不是 for-loop）

呈現
  ├─ 學生：writing_student_analysis() → WritingReportView（僅 COMPLETED）
  └─ 老師：writing_admin_analysis()   → 同一個 WritingReportView（看到學生看到的東西）
```

**Pipeline 要點**

| 問題 | 答案 |
|---|---|
| 哪個 model | **DeepSeek `deepseek-chat`**，`https://api.deepseek.com/chat/completions` |
| Prompt 在哪 | `api/_lib/writingPrompts.ts`（559 行）：`competencyMessages` / `errorMessages` / `highScoreMessages` / `synthesisMessages` |
| Output 格式 | **JSON**（`response_format: json_object`），經 `api/_lib/analysisContract.ts` 逐項驗證 |
| 固定 error code | ✅ **有**，17 個，見 `E-` 檔 |
| 句級 correction | ✅ **有**，`ErrorFinding.correction` 是必填 |
| grammar/vocab/coherence 分類 | ✅ **有**，Axis 1 的 W1–W5 就是 |
| weakness / recurring 概念 | ⚠️ **只有單篇的 weakness**（`needs_work`）。**沒有任何 recurring／跨篇概念** |
| 保存 AI 原始 response | ❌ **沒有**。只存驗證後的 JSON + telemetry（token 數、延遲、outcome、validation issues、responseChars）。原始文字不落地 |
