# 作文收件匣與批次分析佇列 — 上線手冊

> 老師勾選多篇 → 按一次 → 系統一篇一篇分析 → 老師逐篇檢閱。
> 佇列在伺服器端，關掉瀏覽器照跑。

---

## 這一版做了什麼、沒做什麼

| 做了 | 沒做 |
|---|---|
| 收件匣：學生姓名、班級、五種分析狀態、五個篩選 | email 提醒（**專案沒有寄信能力，暫時擱置**） |
| 每日待處理提醒（Web Push，共用既有的 20:00 排程） | 22:00 的獨立排程 |
| 多選 + 「批次開始 AI 分析（N）」 | 即時通知中心 |
| 伺服器端佇列，concurrency = 1 | concurrency ≥ 2 |
| 「重試失敗項目」 | 自動無限重試 |
| 老師檢閱狀態 + 「儲存並下一篇」 | 強制填寫講評（講評仍然選填） |
| `/admin` 上的「N 篇待處理」徽章 | 即時／逐篇通知 |

**為什麼是推播不是信**：這個專案完全沒有寄信的能力 —— repo 裡沒有
Resend／SendGrid／Nodemailer／SES 任何一個。既有的每日提醒
（`api/send-daily-reminders.ts`）本來就是 **Web Push**（`web-push` + VAPID），
所以作文提醒沿用同一個管道、同一條排程。要改成 email 得先引入新平台。

---

## 上線順序

### 1. 🔴 五份 SQL：先在 gsat-staging 執行並確認，再在 production 執行

依這個順序（有相依）：

```
1. add_writing_queue_lease.sql          ← 租約欄位
2. create_writing_teacher_reviews.sql   ← 老師檢閱狀態
3. create_writing_queue_rpcs.sql        ← 依賴 1
4. update_writing_admin_queue.sql       ← 依賴 1 與 2
5. create_writing_pending_digest.sql    ← 依賴 3（每日提醒用）
```

跑完之後自己看一眼：

```sql
-- 四支 worker 專用的函式：anon 與 authenticated 都不能有 EXECUTE
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('writing_queue_claim','writing_queue_release',
                     'writing_queue_ensure_analysis','writing_queue_begin_synthesis');
-- 兩欄都必須全部 false

-- 檢閱表：三個角色都不能有任何權限
SELECT r AS role,
       has_table_privilege(r,'writing_teacher_reviews','SELECT') AS can_select,
       has_table_privilege(r,'writing_teacher_reviews','INSERT') AS can_insert
  FROM unnest(ARRAY['anon','authenticated','service_role']) r;
-- 全部 false

-- 收件匣有沒有把人名帶出來
SELECT writing_admin_queue()->0->>'student_name';
```

### 2. 環境變數：只有一個要新設

| 變數 | 用途 |
|---|---|
| **`WRITING_REMINDER_ADMIN_EMAIL`** | **要新設**。收每日提醒的 email，逗號分隔。沒設就完全不送提醒（其餘功能不受影響） |
| `CRON_SECRET` | worker 與提醒端點的鑰匙（已經有了） |
| `DEEPSEEK_API_KEY` | 分析（已經有了） |
| `SUPABASE_SERVICE_ROLE_KEY` | worker 寫入（已經有了） |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 推播（已經有了，學生的單字提醒在用） |

`WORKER_SELF_URL` 是選填的覆寫。平常靠 Vercel 自己注入的 `VERCEL_URL`
就能找到自己，不用設。

### 3. `vercel.json` 沒有改

佇列**不靠排程推進**，所以沒有新增 cron。原本那兩條維持不變。

---

## 每日待處理提醒

```
Vercel Cron  0 12 * * *（台灣 20:00）
      ↓
/api/send-daily-reminders        ← 既有的學生背單字提醒
      ├─ 送學生的單字推播（原本就有的邏輯，沒動）
      └─ sendWritingReviewReminders()   ← 多的一行
               ↓
         writing_pending_digest()   有待處理才送，沒有就完全不送
               ↓
         推播給 WRITING_REMINDER_ADMIN_EMAIL 名單上的人
```

### 要設一個環境變數

| 變數 | 說明 |
|---|---|
| `WRITING_REMINDER_ADMIN_EMAIL` | 收提醒的 email，逗號分隔。**沒設就完全不送**，不猜 |

為什麼不從 `is_admin()` 撈：正式環境的 `is_admin()` 是寫死比對單一 email，
而且只回答「現在這個人是不是管理員」，無法反過來列舉。在提醒程式裡把那個
email 再寫一次，等於讓授權規則有兩份。

⚠️ **收件人那個帳號必須先在瀏覽器開啟通知權限**，否則沒有推播訂閱可送。
端點會在 log 裡說「有 N 篇待處理，但收件人沒有任何推播訂閱」——那不是程式壞了。

### 通知長什麼樣

```
有 12 篇作文待處理
202609 週六寫作大師班 8 篇、高二英文班 4 篇
4 篇 AI 已完成待檢閱
最早提交：昨天
```

點下去直接到 `/admin/writing`。

**沒有待處理就什麼都不送。** 每天一則「目前沒有待處理」的通知，三天之後就會被
當成雜訊關掉，連帶真的有事的那天也看不到。

### 手動試跑

```
GET /api/send-writing-review-reminders?dryRun=1
Authorization: Bearer <CRON_SECRET>
```

只算不送，回傳會送出的標題與內文。

### 想改成別的時間

`/api/send-writing-review-reminders` 是完整的獨立端點，只是目前沒有掛 cron。
要改成 22:00（台灣）就在 `vercel.json` 加一條：

```json
{ "path": "/api/send-writing-review-reminders", "schedule": "0 14 * * *" }
```

然後把 `api/send-daily-reminders.ts` 結尾那一次 `sendWritingReviewReminders()`
呼叫拿掉，免得一天送兩次。⚠️ 先確認你的 Vercel 方案允許三條 cron。

---

## 佇列是怎麼運作的

```
老師勾 15 篇 → POST /api/writing-queue-enqueue
                  ├─ writing_enqueue_analysis_batch()  寫 15 列 QUEUED
                  └─ 踢 worker 一腳
                          ↓
              POST /api/writing-queue-worker
                  ├─ writing_queue_claim()   認領 1 個單位（拿租約）
                  ├─ 跑 runStage1 或 runSynthesisOnly
                  ├─ writing_queue_release() 放開租約
                  └─ 踢下一腳 ────────────┐
                          ↑                │
                          └────────────────┘
                     沒工作了就安靜停下
```

**一個單位 ≠ 一篇作文。** 一篇作文的 Stage 1 最多要 4 次請求（某一支 pass 沒通過
驗證就再跑一次），加綜合層 1 次。每一次都是獨立的認領，各自擁有完整的 50 秒。
`stage1_progress` 讓已經 VALID 的 pass 永遠不重跑。

15 篇大約需要 15 × 2～5 個單位 × 50 秒 ≈ **25–60 分鐘**。老師不必等。

### concurrency = 1 在哪裡保證

`writing_queue_claim()` 裡的兩道，**都在資料庫**：

1. `pg_advisory_xact_lock` — 同時只有一個認領交易進得來
2. 活租約檢查 — 只要有任何一列握著未過期的租約，這一次就回 BUSY

前端把按鈕停用只是禮貌。直接用 curl 打 worker 端點也繞不過去。

> ⚠️ 判準是**租約**，不是 status。認領一列 QUEUED 時 status 還是 QUEUED
> （是 `runStage1` 稍後才推到 ANALYZING）。早期版本的忙碌檢查只看
> `ANALYZING`/`ANALYZED`，結果第二個 worker 會在那一小段空窗裡認領下一篇，
> concurrency 悄悄變成 2。本機測試的「第二個 worker 拿到 BUSY」抓到了這件事。

---

## 出事的時候

| 症狀 | 原因 | 怎麼辦 |
|---|---|---|
| 佇列停住不動 | 自我串接的鏈被平台中斷 | 收件匣會出現「繼續處理佇列」，按一下。按幾次都沒有副作用 |
| 某一篇一直是「分析中」 | worker 死了，租約還沒到期 | 等最多 150 秒，下一次認領會把它放回佇列 |
| 某一篇變成「分析失敗」且訊息是逾時 | 重新認領 3 次仍未完成 | 按「重試失敗項目」。已通過驗證的 pass 會保留 |
| 一篇失敗之後其他篇有沒有受影響 | 不會 | FAILED 不佔租約也不擋認領，worker 同一次就接下一篇 |
| 老師不小心把同一篇選兩次 | 不會有事 | `writing_enqueue_analysis` 本來就冪等，加上唯一部分索引，重複分析在資料庫層不可能發生 |
| 兩個管理員同時按批次分析 | 不會有事 | 兩批工作都排進去，但同時只有一篇在跑 |

「繼續處理佇列」只在**有工作等著、但沒有人在跑**的時候才出現
（`writing_queue_summary()` 的 `work_waiting && !worker_busy`）。

---

## 「待處理」的定義

只有一個地方說了算 —— `writing_pending_summary_internal()`。徽章、收件匣與
每日提醒讀的都是它（分別透過 `writing_queue_summary()` 與
`writing_pending_digest()` 兩個帶守門的入口）：

```sql
writing_submissions.status = 'SUBMITTED'
AND EXISTS (SELECT 1 FROM writing_texts WHERE essay_id = s.id)
AND NOT EXISTS (SELECT 1 FROM writing_teacher_reviews WHERE essay_id = s.id)
```

自動排除了草稿（status）、OCR 還沒成功的圖片作文（圖片作文要辨識成功才可能
變成 SUBMITTED，`writing_texts` 再擋一層）、不完整的提交、以及已處理完的。

**「已檢閱」只由老師明確按下「完成檢閱」產生**，不由開啟頁面、捲動、AI 完成
或有沒有講評推導。這件事很重要：檢閱狀態若能被推導，每日提醒會開始說謊。

`by_class` 的注意事項：一個學生可能同時在多個班，那篇作文會在每個班各算一次，
所以各班數字相加可能大於 `pending_total`。硬挑一個「主要班級」會讓某個班的
老師看不到自己班的作文。

---

## 測試

資料庫層有自動測試（**83 項**）：

```bash
createdb wq
psql -d wq -f tests/sql/_writing_local_harness.sql
psql -d wq -c "CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES auth.users(id), display_name TEXT, email TEXT);"
for f in create_writing_submissions create_writing_texts add_writing_texts_word_count \
         create_writing_analyses add_writing_analyses_stage1_progress \
         add_writing_analyses_analyzed_at add_writing_analyses_telemetry \
         create_writing_teacher_feedback create_learn_classes_tasks \
         add_writing_queue_lease create_writing_teacher_reviews \
         create_writing_queue_rpcs update_writing_admin_queue \
         create_push_subscriptions_table create_writing_pending_digest; do
  psql -d wq -f supabase/migrations/$f.sql
done
psql -d wq -f tests/sql/writing_queue_test.sql
```

### Staging 驗收清單

| # | 驗什麼 | 通過條件 |
|---|---|---|
| 0 | 提醒試跑 | `?dryRun=1` 回傳的篇數與 `/admin` 徽章一致；沒有待處理時回 `NOTHING_PENDING` |
| 1 | 批次 | 勾 3 篇 → 按一次 → 三篇依序完成，不需要再操作 |
| 2 | concurrency | 分析途中查 `writing_analyses`，同時只有一列握著未過期租約 |
| 3 | 關瀏覽器 | 排 3 篇後立刻關掉分頁，10 分鐘後回來看進度有前進 |
| 4 | 兩人同時 | 兩個瀏覽器同時按批次分析 → 仍然只有一篇在跑 |
| 5 | 重複選取 | 同一篇連按兩次批次 → 只產生一列分析 |
| 6 | 一篇失敗 | 故意讓一篇失敗（把 `DEEPSEEK_API_KEY` 改錯再改回來）→ 其餘照跑 |
| 7 | 重試 | 按「重試失敗項目」→ 產生新的 `analysis_version`，舊的那列還在 |
| 8 | 已完成不重排 | 對已完成的作文按批次 → 回報「已經分析完成」並跳過 |
| 9 | 鏈斷掉 | 分析中重新部署（會砍掉 worker）→ 收件匣出現「繼續處理佇列」 |
| 10 | 檢閱 | 「儲存並下一篇」→ 講評有存、狀態變成已處理、跳到下一篇 |
| 11 | 待處理數字 | 標記檢閱後，`/admin` 的徽章數字跟著減少 |
| 12 | 權限 | 用學生帳號呼叫 `writing_enqueue_analysis_batch` → 被拒 |

---

## 幾個容易被「優化」掉的決定

**佇列就是 `writing_analyses`，沒有第二張表。**
那張表本來就有 QUEUED → ANALYZING → ANALYZED → COMPLETED / FAILED、有
「同一篇同時只能有一筆在飛」的唯一部分索引、有逐支 pass 的續跑進度。
再開一張 queue 表等於把同一件事寫兩遍，兩邊遲早會不一致。

**worker 走自己的 RPC，不放寬既有那兩支。**
`writing_enqueue_analysis` 與 `writing_retry_synthesis` 的語意是「登入的管理員
按下按鈕」，而它們在老師端的按鈕上還在用。worker 用
`writing_queue_ensure_analysis` / `writing_queue_begin_synthesis`，
只給 service_role。兩條路的權限互不影響。

**worker 永遠不建立分析列。**
`writing_queue_ensure_analysis` 只回傳既有的工作，找不到就回 NULL。
工作只由老師排入 —— worker 生不出工作，也就不可能因為一個 bug 自己替全班
的作文開始花錢。

**分析邏輯一行都沒重寫。**
`runStage1` / `runSynthesisOnly` 原本把結果寫進 `res`。worker 給它一個把寫入
接下來的假 `res`（`captureResponse()`），而不是把 879 行改成回傳值。
兩個進入點唯一的差別被收斂成 `RunGate` 那兩個方法。

**租約過期不等於失敗。**
第一次、第二次過期只是把工作放回佇列（`queue_attempts + 1`），
`stage1_progress` 原封不動 —— 已經通過驗證的 pass 是花錢換來的，重跑只會多付
一次同樣的錢拿到同樣的結果。第三次才收成 FAILED，那是自動重試的上界。

**批次上限 50，寫在資料庫裡。**
一次排 200 篇不是使用情境，是誤操作，而每一篇都是真金白銀的 DeepSeek 呼叫。
前端也擋，但前端可以被繞過。

**「待處理」的定義只有一份，而且沒有人叫得動它。**
`writing_pending_summary_internal()` 對【所有】角色零 EXECUTE，包含 service_role。
兩個入口各自帶守門：老師走 `writing_queue_summary()`（`is_admin()`），排程走
`writing_pending_digest()`（只有 service_role）。兩邊回傳的是同一支函式的結果，
所以徽章說 12 篇、提醒就不可能說 9 篇。測試裡有一條直接斷言兩者相等。
