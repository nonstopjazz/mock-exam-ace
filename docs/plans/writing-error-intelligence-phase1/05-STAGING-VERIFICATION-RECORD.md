# 第 1 批（A1–A3）staging 驗證紀錄

> 執行日期：2026-09-21 · 環境：**gsat-staging**
> 版本：`524cddb`（含 word_count tiebreaker 修正）
> **production 全程只被唯讀查詢碰過，沒有任何寫入。**

---

## 0. 一句話結論

**物化邏輯正確，而且 staging 的真實資料驗到了兩個 production 沒有的關鍵情境。**
規模相關的結論（回填耗時、索引行為）**這次證明不了**，見 §4。

---

## 1. staging 的資料形狀

| | |
|---|---|
| COMPLETED 分析 | 10 |
| 有 COMPLETED 的作文 | 6 |
| 物化的 findings | **25** |
| 有 findings 的作文 | 2 |
| 零錯誤作文 | 4 |

### 與 production 的差異（這是 staging 的價值所在）

| 情境 | staging | production |
|---|---|---|
| 一篇有多個 COMPLETED 版次 | **有**（一篇 5 個版次，最高 v10） | 無（44 分析對 44 作文） |
| 較新的 FAILED 蓋在 COMPLETED 上 | **有**（1 篇） | 無 |
| taxonomy 版本 | **v1 + v2 混用** | **100% v2** |

---

## 2. 驗證結果

### 2.1 權限

| 對象 | 結果 |
|---|---|
| `writing_error_findings` | RLS 開 · anon 讀不到 · 登入者讀不到 · service_role 可讀不可寫 · 索引 6 ✅ |
| `writing_sync_error_findings` | SECURITY DEFINER · `search_path=''` · 只有 service_role 可執行 ✅ |
| `writing_backfill_error_findings` | 同上 ✅ |
| `writing_sync_error_findings_for_essay` | 同上，但**誰都不能執行**（內部函式）✅ |

### 2.2 回填

```
processed 6 · inserted 25 · deleted 0 · failed 0 · remaining 0
```

### 2.3 🔴 全量逐筆比對（`05-reconcile.sql`）

**13 項全部是 0。** 這不是抽查 —— 它把每一份 `error_analysis` 重新展開，
逐筆比對 code / quote / reason / correction / primary_skill / analysis_version / analysis_id，
再比對 student_id / essay_topic / essay_submitted_at / word_count 與來源表。

### 2.4 findings 與 coverage 一致（`04c`）

六篇「兩者一致」全部 true —— `sum(coverage.count)` 等於 findings 數量。
**零錯誤的四篇是真的零錯誤，不是資料流失。**

其中 `b4aa1ef5`（273 字 · v2 · `SERVER_DERIVED` · 17 項 coverage · 0 findings）
是「好作文真的沒錯」那條路徑正確運作的樣子。
⚠️ 這仍然**不代表那位學生已經精熟**（TR-12／TR-13）。

### 2.5 🎯 兩個 production 沒有的情境，真實資料驗過

| 情境 | 結果 |
|---|---|
| **只取最高 COMPLETED 版次** | 那篇有 5 個 COMPLETED 版次，物化的是 **v10**。`analysis_version` 與 `analysis_id` 兩項比對皆 0 不一致 ✅ |
| **較新的 FAILED 不清掉 COMPLETED** | 6b = 1 篇，其 **24 筆 findings 仍然在** ✅ |

第二項就是 §0 那個修正的真實資料證明。若用原本的「最高版次」判準，
那篇作文的 24 筆錯誤紀錄**現在就會被清空**，而且不會有任何錯誤訊息。

### 2.6 重複 finding 不被去重

JSONB 6 組 / 表裡 6 組 / **0 組筆數不符**。
`(essay_id, finding_index)` 作為去重鍵，沒有吃掉任何合法的重複。

### 2.7 冪等

| | 總筆數 | 內容指紋 |
|---|---|---|
| 回填前 | 25 | `861fd753386fa825dffe1be259bff969` |
| 再回填一次 | `deleted 25 · inserted 25 · failed 0` | |
| 回填後 | 25 | `861fd753386fa825dffe1be259bff969` |

⚠️ 第二次 `deleted = 25`（第一次是 0）正是預期行為：
冪等靠的是交易內的 DELETE → INSERT，不是靠「跳過已存在的列」。
結果位元相同才是重點。

### 2.8 🔴 一次出現也要列（真實資料）

`08-student-to-errors.sql` 對 `staging-admin` 回傳 8 個 code，其中：

| code | 篇數 | findings |
|---|---|---|
| `WRITE_ERR_RUN_ON` | 1 | **1** |
| `WRITE_ERR_SV_AGREEMENT` | 1 | **1** |

**只要查詢裡有任何 `HAVING count(*) >= 2`，這兩個 code 會直接消失。**
這是整個 Phase 1A 最核心的產品需求，現在有真實資料證明它成立。

`WRITE_ERR_GRAMMAR_OTHER` 正確標記為低訊號，且是該生第 2 多的 code（5/24 = 21%）。

### 2.9 taxonomy 版本

| | production | staging |
|---|---|---|
| `writing-v2` | **44 分析 / 44 作文 / 420 findings** | 3 / 2 / 58 |
| `writing-v1` | **無** | 7 / 5 / 77 |
| 缺 `coverage_source` | **0** | 4 |

**production 是 100% v2，所以 taxonomy 混用在 production 不存在。**
A4–A7 不需要為它加篩選。`writing_error_findings` 本來就有 `taxonomy_version` 欄位，
萬一之後出現 v3 或有人重跑舊作文，資料層已經準備好。

---

## 3. 驗證過程中修掉的問題

| # | 問題 | 怎麼發現的 |
|---|---|---|
| 1 | **staging 缺 `writing_texts.word_count`** —— 回填會在第一篇就失敗 | `00-preflight.sql` 第 4 項 |
| 2 | **`word_count` 快照不確定** —— 同一篇多列 `writing_texts` 且 `created_at` 同值時，`LIMIT 1` 取哪一列不確定，數字會在重跑之間飄 | staging 的 `writing_texts` 出現三列相同內容 |

第 2 項排序加了 `, wt.id DESC`。既有的 `writing_admin_queue()` 有同樣的潛在問題，
但它只影響一個顯示數字，不在這一批範圍。

---

## 4. ⚠️ 這次**沒有**驗證到的事

誠實列出來，免得之後有人以為驗過了。

| 項目 | 為什麼沒驗到 |
|---|---|
| **索引有沒有被用到** | staging 只有 25 列，PostgreSQL 正確地選擇 Seq Scan（2 個 buffer）。**在這個資料量下，planner 永遠不會選索引**，所以 `09-performance.sql` 對索引行為毫無證明力。本機 392 列的模擬有吃到 `idx_wef_code_time`（0.219 ms）。<br>⚠️ production 只有 420 列，**很可能也是 Seq Scan，而且那是對的** —— 索引是為了之後資料長大，不是為了現在 |
| **回填的規模行為** | 6 篇證明不了 44 篇，更證明不了 440 篇 |
| **分批與 cursor 走多批** | staging 一批就跑完。由單元測試 S22–S25c 涵蓋 |
| **`Error → Students` 好不好用** | staging 只有 1 位學生有 ARTICLE。查詢能跑，但看不出可用性 |
| **A9 的呼叫點** | 還沒寫，屬於第 3 批 |

---

## 5. 仍然待處理（不阻塞第 2 批）

| # | 項目 |
|---|---|
| 1 | **`api/_lib/analysisContract.ts` 有 7 處過時數字**：`:125` `:628` `:637` `:639` `:876` `:878` 寫「16 個 code」但實際是 17；`:715` 寫「其他 15 個具體類別」應為 16。<br>⚠️ `:715` **會顯示給模型看**（是驗證失敗訊息的一部分），不只是註解 |
| 2 | **`word_count` 對非英文作文無意義**：staging 有一篇學生貼中文題目，`word_count = 1`。1B 算 errors per 100 words 時必須擋掉，否則那一篇會是永遠的第一名 |
| 3 | `writing_admin_queue()` 的 `ORDER BY wt.created_at DESC` 沒有 tiebreaker |

---

## 6. 建議

第 1 批的**邏輯正確性**已經被真實資料驗證，可以進第 2 批（A4–A7）。

**但 production 的 migration 還沒跑。** 建議順序：

1. 先在 production 跑 A1 + A2 + 回填（44 篇 / 420 findings），用同一套 `staging-verify` 腳本驗一次
2. 再進第 2 批

理由：第 2 批的四支 RPC 全部建立在這張表上。表在 production 先落地，
第 2 批寫完就能直接在真實資料上驗收，而不是又隔一層。
