# H. Gap analysis：對照未來的 Writing Error Intelligence 需求

七項需求逐一對照。**綠燈＝現成、黃燈＝半套、紅燈＝完全沒有**。

| # | 未來需求 | 燈號 | 現況 |
|---|---|---|---|
| 1 | `/admin/writing` 增加錯誤分類篩選 | 🟡 | taxonomy 有（17 code）、資料有（`error_analysis` JSONB）、filter bar 有。但 **`writing_admin_queue()` 不回傳 `error_analysis`**，前端拿不到；且無 multiselect |
| 2 | 依特定錯誤篩出學生列表 | 🟡 | 同上。單篇層級可行；**「學生列表」這個維度整個不存在**（現在只有作文列表） |
| 3 | 追蹤同一學生跨多篇重複錯誤 | 🔴 | **完全沒有跨篇概念**。沒有 admin 端的「某學生所有作文」API |
| 4 | AI 針對跨次重複錯誤摘要建議 | 🔴 | AI **只看單篇**。prompt 沒有任何歷史輸入 |
| 5 | 作文批改後自動分析 | 🟡 | worker 鏈完整，但**送出沒有觸發點** |
| 6 | 每週定期掃描／提醒 | 🟡 | cron 機制 + push 管道都在；**沒有 weekly schedule、沒有掃描邏輯、沒有 alert 持久化** |
| 7 | 老師手動按鈕觸發 AI 分析 | 🟢 | **已經完全做好了**。批次勾選、單篇重跑、重試失敗、成本確認框、loading/error 全在 |

---

## H1. 哪些現有功能可以直接沿用

1. **整套 taxonomy（`writing-v2`）** —— 17 個 stable error code，已經掛回 W 軸。**不需要發明任何新分類**
2. **句級 correction** —— `ErrorFinding.correction` 必填，且 `quote` 被驗證必須是原文逐字片段
3. **手動觸發的完整鏈路** —— 需求 7 可以視為已完成
4. **佇列基礎建設** —— advisory lock、租約、重新認領、鏈式接力、每日上限、依實測 telemetry 的成本估算
5. **確認框 + 成本估算** —— `BatchAnalyzeDialog` 可以原封不動用在任何「會花錢的批次動作」
6. **報告 UI** —— `WritingReportView` 的錯誤區塊已經能顯示 code badge / 引用 / 修正 / 理由
7. **老師端安全樣板** —— 所有 RPC `SECURITY DEFINER` + `SET search_path = ''` + `is_admin()` 把關 + `REVOKE ALL FROM PUBLIC, anon`
8. **不吵人的提醒原則** —— 「沒事就什麼都不送」

## H2. 哪些資料現在沒有保存

| 沒保存的 | 影響 |
|---|---|
| **AI 原始 response 文字** | 只存驗證後的 JSON + telemetry。之後想回頭重新解析舊分析、或比對 prompt 改版前後的差異，**做不到** |
| **錯誤的可查詢形狀** | `error_analysis` 是 JSONB，**沒有 GIN 索引**。「哪些學生犯過 WRITE_ERR_ARTICLE」要全表掃描 + JSONB 展開 |
| **跨篇的任何東西** | 沒有 student-level writing profile、沒有錯誤累計、沒有趨勢 |
| **錯誤在原文的位置** | 只有 `quote`（文字片段），**沒有 offset/span index**。同一句話出現兩次就分不出是哪一處 |
| **老師對 AI 判斷的回饋** | 老師只能「標記完成」+「寫講評」，**無法說「這個 finding 判錯了」**。沒有人工校正訊號 |
| **題目的結構化身分** | `essay_topic` 是自由文字。同一個題目打錯字就變成兩個題目，跨篇按題目比較不可靠 |

## H3. 要做跨次錯誤追蹤，一定需要新增的

> 以下是**盤點結論**，不是設計提案。

1. **一個可查詢的錯誤事實來源** —— 二選一：
   - (a) 在 `error_analysis` 上建 **GIN 索引** + 用 `jsonb_path_query` 查（改動最小，但聚合查詢會很醜）
   - (b) 一張 **normalized 的 finding 表**（`analysis_id, essay_id, student_id, code, quote, correction, primary_skill`）由分析完成時寫入（查詢自然，但是新表）
2. **admin 端的「某學生所有作文 + 分析」API** —— 現在**不存在**。`writing_student_essay_cards()` 是 self-only、不收 `student_id`
3. **跨篇 aggregation 的定義** —— 「重複」是什麼？同一 code 出現在 ≥2 篇？還是 ≥3 次？現在**沒有任何地方定義過**
4. **alert / insight 的持久化** —— weekly scan 的產出要能被看到、被標記已讀。目前 push 送完就沒了
5. **送出後的自動觸發點** —— trigger 或送出端呼叫

## H4. 哪些地方資料不足，無法可靠判斷 recurring error

🛑 **這一段是這份稽核最重要的部分。** 既有 contract 已經把語意界線寫得很清楚，做跨篇時如果照搬數字會得到錯誤的結論：

1. **`count = 0` 不等於「已精熟」**（TR-12 / TR-13，原文在 contract 裡）。
   它的意思是「**本篇**未發現此類錯誤」。
   → 一個學生連續三篇 `WRITE_ERR_ARTICLE` count = 0，**不能**推論他冠詞掌握好了，可能只是那三篇沒有需要冠詞的句型。

2. **`coverage` 是伺服器算術，不是 AI 的能力判斷**（`coverage_source = "SERVER_DERIVED"`）。
   → 把 coverage 直接當成能力向量做趨勢圖，是把算術誤讀成評估。

3. **`WRITE_ERR_GRAMMAR_OTHER` 是 fallback，且已知會被濫用。**
   contract 裡記錄了 2026-09-05 的量測：弱作文 28 筆 findings 有 **7 筆**是 GRAMMAR_OTHER，其中至少兩筆的 reason 自己就說出了更具體的類別。
   → GRAMMAR_OTHER 的跨篇統計**沒有診斷價值**，它混了至少兩種以上真正的錯誤類型。

4. **`UNMEASURED` 是判斷，不是缺值。**
   Axis 1/3 有 `UNMEASURED`，Axis 2 沒有。三個軸的「沒有資料」語意不同，聚合時不能一視同仁。

5. **作文長度與題型沒有正規化。**
   300 字的作文出現 5 個冠詞錯誤，與 120 字出現 5 個，不是同一件事。現有資料有 `word_count`，但**沒有任何地方做過正規化**。

6. **樣本數太小的風險。** 現在一個學生可能只有 1–3 篇作文。
   → 「重複出現」在 n=2 時幾乎沒有統計意義。需要先定義最小樣本門檻，否則會對學生說出沒有根據的話。

7. **同一篇被重跑會產生多列 `writing_analyses`**（`analysis_version`）。
   → 跨篇統計若不限定「每篇只取最新一版」，會把同一篇的錯誤重複計算。

## H5. Production schema 在 repo 裡沒有 DDL 的

**writing 模組：沒有。** 9 張表 + 34 支 RPC 全部有 DDL 與 rollback。這個模組是整個專案裡文件最完整的部分。

（上次 vocabulary 稽核列的 `pack_item_progress` / `pack_images` / `app_admins` / `site_settings` 與 writing 無關。）

## H6. 看起來重複或有 legacy 的

| 項目 | 觀察 |
|---|---|
| `writing_enqueue_analysis` vs `writing_enqueue_analysis_batch` | 兩支並存。`/admin/writing` 只用 batch 版；單篇版**仍在使用**，由 `api/analyze-writing.ts:129` 在直接分析單篇時呼叫。不是死碼，但兩條路徑的上限／批次語意不同 |
| `taxonomy_version` 欄位預設 `'writing-v1'` | 但程式一律送 `'writing-v2'`。預設值是歷史殘留 |
| `writing_teacher_reviews` vs `writing_teacher_feedback` | 兩張 1:1 表對同一篇作文。可以是一張，但分開是有理由的（檢閱是狀態、講評是內容、後者選填） |
| `api/send-writing-review-reminders.ts` | 有端點、沒有 cron。**目前是死路**（只能手動打） |
| `src/data/mock-essay.ts` | ⚠️ **已確認無人引用**（全 repo 零 import）。死檔 |
| `useEssayList` vs `useEssayCards` | 註解明講前者拿不到批改狀態所以另開一支。兩支並存 |

---

# I. 建議「最小改動」可以沿用哪些現有模組

> 依「改動大小」排序。**這是盤點的延伸，不是實作計畫**，每一項都還需要你決定要不要做。

### 需求 7（手動觸發）—— 改動：**零**
已經完成。批次勾選、單篇重跑、重試失敗、成本確認、loading/error 全在。

### 需求 1 + 2（錯誤篩選 / 學生列表）—— 改動：**小**
現成可沿用：filter bar 版型、`Set<string>` 勾選、`ERROR_TAG_BY_CODE` 的中文標籤、badge tone map。
最小路徑是讓 `writing_admin_queue()` **多回傳一個從 `error_analysis` 萃取的 `error_codes[]` 陣列**
（`jsonb_array_elements` 取 `findings[].code` distinct），前端的篩選邏輯形狀與現有五個 filter 完全相同。
缺的 UI 元件只有 multiselect（`ui/command` + `ui/popover` 可組）。
⚠️ 但這會讓本來就一次撈全部的 queue RPC 更重 —— **分頁的缺席在這裡會開始痛**。

### 需求 5（送出後自動分析）—— 改動：**小～中**
worker 鏈、租約、每日上限全部現成。缺的只是觸發點。
⚠️ 需要你做一個產品決定：自動分析會**繞過老師的成本確認框**。目前每一次花錢都有人按過確認，自動化會拿掉這道關卡 —— `writing_daily_analysis_cap()` 會變成唯一的防線。

### 需求 6（每週掃描／提醒）—— 改動：**中**
cron 機制、push 管道、`writing_reminder_push_targets()`、「沒事不送」原則都現成。
缺的是 schedule 項目、掃描邏輯，以及 alert 的持久化（push 送完就沒了，老師睡覺時錯過就永遠錯過）。

### 需求 3（跨篇重複錯誤）—— 改動：**大**
這是真正的新功能。需要 H3 的 1–3 項，而且**必須先回答 H4 的七個語意問題**，否則會產出看起來精確、實際上沒有根據的結論。

### 需求 4（AI 跨次摘要建議）—— 改動：**最大**
需要需求 3 先成立。另外會需要一支新的 prompt pass，以及一個新的成本考量（跨篇分析的 input token 會比單篇大很多，現有的 `writing_analysis_cost_estimate()` 是依單篇實測算的，不適用）。

---

## 一句話建議

**需求 1、2、5、7 幾乎都踩在現成基礎上，可以先做；需求 3、4 是新東西，而且它的難處不在工程，在於先定義「什麼叫重複」而且不違反既有 contract 已經寫死的三條語意規則。**
