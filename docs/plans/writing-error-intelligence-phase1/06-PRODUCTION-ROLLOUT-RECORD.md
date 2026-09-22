# 第 1 批（A1–A3）production rollout 紀錄

> 執行日期：2026-09-21 · 環境：**production**
> 版本：`c170da4`
> 範圍：**只有資料層**。沒有 RPC、沒有 UI、沒有 profiles／alerts／AI、沒有部署 A9 自動同步。

---

## 0. 結論

**45 篇作文、420 筆 findings 全部正確物化，13 項全量逐筆比對無一不一致，冪等驗證位元相同。**

---

## 1. 前置檢查

11 項全部通過，包含兩項為 production 新增的衝突檢查：

| 檢查 | 結果 |
|---|---|
| `writing_texts.word_count` 存在 | true |
| findings 表已存在 | false |
| **sync 函式已存在** | **0 支** |
| **有無同名但不同 relkind 的物件** | **（沒有）** |
| COMPLETED 分析 / 作文 | **45 / 45**（一篇一版） |
| findings 形狀異常 | 0 篇 |
| 超出 17 個 code 的錯誤碼 | 0 個 |

> ⚠️ 45 而非前一日量到的 44 —— 24 小時內多了一篇完成分析。
> 我沒有為了對齊先前的預期而調整任何東西。

---

## 2. Migration 與回填

| | |
|---|---|
| 表 | RLS 開 · anon 讀不到 · 登入者讀不到 · service_role 可讀不可寫 · 索引 6 |
| 三支函式 | `SECURITY DEFINER` · `search_path=''` · `_for_essay` 誰都不能執行 |
| **回填** | `processed 45 · inserted 420 · deleted 0 · failed 0 · remaining 0` |

---

## 3. 驗收

### 3.1 總量

| | |
|---|---|
| findings | **420** |
| 涵蓋作文 | 37 |
| 涵蓋學生 | **21** |
| 零錯誤作文 | 8（45 − 37 ✅） |
| `taxonomy_version` | **只有 `writing-v2`** |
| `essay_word_count` 為 NULL | **0** |

### 3.2 🔴 全量逐筆比對

**13 項全部 0。** 420 筆逐一比對 code / quote / reason / correction / primary_skill /
analysis_version / analysis_id，以及 student_id / essay_topic / essay_submitted_at /
word_count 與來源表。

### 3.3 逐篇形狀

45 列全部：`兩者一致 = true` · `writing-v2` · 17 項 coverage · `SERVER_DERIVED`。
零錯誤的 8 篇是**真的零錯誤**，不是資料流失。

### 3.4 重複 finding

| | |
|---|---|
| JSONB 的「同篇同 code 多筆」組合 | **101** |
| 表裡的組合 | **101** |
| 筆數不符的組合 | **0** |

> 🛑 101 組。若當初留著 `UNIQUE (essay_id, error_code, quote, correction)`，
> 只要這 101 組裡**任何一組**的 quote 與 correction 相同，回填就會
> `duplicate key violation` 整批失敗。改用 `finding_index` 不是潔癖，是必要。

### 3.5 冪等

| | 總筆數 | 內容指紋 |
|---|---|---|
| 回填前 | 420 | `23dafb75bb34b7a2aff92f2464264f72` |
| 再回填 | `deleted 420 · inserted 420 · failed 0` | |
| 回填後 | 420 | `23dafb75bb34b7a2aff92f2464264f72` |

### 3.6 ✅ 意料之外的交叉驗證

`04b` 由**物化表**算出的 code 分布，與前一日直接從 **JSONB** 算出的分布**逐項相同**
（ARTICLE 32/78、PUNCTUATION 26/49、… DISCOURSE_STRUCTURE 1/1）。

兩條完全獨立的路徑得出同一組數字。這不在驗證計畫裡，但它比任何單一斷言都有說服力。

---

## 4. 人工驗收

### 4.1 Error → Students（`WRITE_ERR_ARTICLE`）

**18 位學生**（全部 21 位有 findings 的學生中的 86%）。

分布從 3 篇 / 13 findings 一路到 **1 篇 / 1 finding**。

> 🔴 清單尾端有兩位學生是 **1 篇作文 / 1 個 finding**。
> 任何 `HAVING count(*) >= 2` 都會讓他們消失 —— 而老師要找的正是這種
> 「只犯過一次但值得提醒」的情況。**這是 production 真實資料上的證明。**

### 4.2 Student → Errors

單一學生列出 **11 個不同的 error code**，從 2 篇 / 8 findings 到 1 篇 / 2 findings，
沒有任何門檻過濾。

⚠️ 這位學生恰好沒有「1 篇 / 1 finding」的 code（最少是 1 篇 / 2 findings）。
**單次出現的證明來自 §4.1，不是這一節。**

### 4.3 Common Errors（依學生數排序）

| # | code | 學生數 | 作文數 | findings | 每篇密度 |
|---|---|---|---|---|---|
| 1 | `ARTICLE` | **18** | 32 | 78 | 2.44 |
| 2 | `PUNCTUATION` | 17 | 26 | 49 | 1.88 |
| 3 | **`WORD_CLASS`** | **16** | 20 | 26 | 1.30 |
| 4 | `NUMBER` | 15 | 22 | 38 | 1.73 |
| 5 | ⚠️ `GRAMMAR_OTHER` | 14 | 19 | 46 | 2.42 |
| 6 | `RUN_ON` | 13 | 22 | 36 | 1.64 |
| 8 | `CHINGLISH` | **12** | **12** | 26 | 2.17 |
| … | | | | | |
| 17 | `DISCOURSE_STRUCTURE` | 1 | 1 | 1 | 1.00 |

**「依學生數排序」的設計決定被真實資料證實了 —— 名次真的會變：**

| code | 依作文數 | 依學生數 |
|---|---|---|
| `WORD_CLASS` | #5 | **#3** |
| `RUN_ON` | #4 | #6 |
| `GRAMMAR_OTHER` | #6（依 findings 會是 #3） | #5 |

`CHINGLISH` 是 **12 位學生 / 12 篇** —— 每人各犯一次。
那是「值得全班講解」的強訊號，而依作文數排序會把它排得更低。

`GRAMMAR_OTHER` 依 findings 數（46）會衝到第 3 名，依學生數則落在第 5。
**排序方式本身就在避免老師把一個傾倒場當成教學主題。**

---

## 5. ✅ 我預測錯的一件事

我說「420 列的表，planner 很可能選 Seq Scan，那是對的」。

**實際用了索引：**

```
Bitmap Heap Scan on writing_error_findings
  ->  Bitmap Index Scan on idx_wef_code_time
        Index Cond: ((error_code = 'WRITE_ERR_ARTICLE')
                 AND (essay_submitted_at >= now() - '30 days'))
Execution Time: 0.355 ms
```

420 列裡命中 78 列，選擇性夠高，planner 就用了索引。
**`idx_wef_code_time` 在 production 真實資料上被實際使用了** ——
這比我原本預期的（只能等資料長大才驗得到）更好。

---

## 6. 這次仍然**沒有**驗證到的事

| 項目 | 為什麼 |
|---|---|
| **「較新 FAILED 不清掉 COMPLETED」** | production 這種資料是 **0 筆**，無從驗證。由 staging 真實資料（1 篇 / 24 筆存活）與單元測試 S1／S17 涵蓋 |
| **分批與 cursor 走多批** | 45 篇一批跑完。由單元測試 S22–S25c 涵蓋 |
| **A9 自動同步** | 尚未實作，屬第 3 批。**目前新完成的分析不會自動進 findings 表**，要手動跑回填 |
| **規模上限** | 420 列證明不了 4200 列 |

---

## 7. 🔴 目前的運作狀態

**findings 表不會自動更新。** A9（`analyze-writing.ts` 完成後呼叫 sync）還沒實作，
所以每當有新作文完成分析，都要手動跑一次：

```sql
SELECT jsonb_pretty(public.writing_backfill_error_findings(200));
```

它是冪等的，隨時可以重跑。這個狀態會持續到第 3 批部署 A9 為止。

---

## 8. 待處理

| # | 項目 | 狀態 |
|---|---|---|
| 1 | `analysisContract.ts` 7 處過時 taxonomy 數字 | 已獨立建檔：`docs/tech-debt/analysiscontract-stale-taxonomy-counts.md` |
| 2 | 約 15% 的 `correction` 是整句改寫而非最小修正 | 影響 A7 drill-down 版面，第 2 批處理 |
| 3 | `writing_admin_queue()` 的 `ORDER BY created_at DESC` 缺 tiebreaker | 未處理，不在本批範圍 |
| 4 | `staging-verify/` 目錄名稱已不精確（兩個環境都在用） | rollout 收尾後改名 |
