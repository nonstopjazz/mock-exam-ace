# 資料層決策（交付項 4 / 5 / 6 / 7 + §C / §D / §E / §F）

> ## ⚠️ 優先順序已於 2026-09-20 修訂
>
> 本文件的**資料架構結論仍然有效**，但「第一版要做什麼」已經改變。
> 請先讀 **[`04-PHASE-1A-REVISION.md`](./04-PHASE-1A-REVISION.md)**。
>
> 重點差異：Phase 1A 的主軸從 Persistent Error Detection 改為 **Error Finder**
> （一次出現即可查到），`student_writing_error_profiles` / `writing_error_alerts` /
> weekly cron / AI digest 全部延後到 1B / Phase 2，且 **D1–D7 都不再是動工的 blocker**。



## 4. Normalized findings vs JSONB-only —— 比較與推薦

### 逐項比較

| 面向 | 方案 1：JSONB + GIN | 方案 2：normalized table | 勝 |
|---|---|---|---|
| **query complexity** | 單篇「有沒有這個 code」用 `@>` 很乾淨。但**聚合**要 `jsonb_array_elements` 展開再 GROUP BY，三層巢狀，而且每個查詢都要重寫一次 | 一般 SQL。`GROUP BY student_id, error_code` 就結束 | **2** |
| **performance** | GIN 能加速**containment 篩選**，但**無法加速 GROUP BY** —— 展開後的聚合仍然要掃過所有命中列。「最近 N 篇」需要先 join 回 submissions 排序 | 複合索引 `(student_id, error_code, essay_submitted_at DESC)` 直接吃下主力查詢 | **2** |
| **future trend analysis** | 每次都要重新展開，時間視窗要 join。寫得出來，但每支查詢都是一次重新發明 | `essay_submitted_at` 已在表上，視窗查詢是 `WHERE ... ORDER BY ... LIMIT` | **2** |
| **student aggregation** | 學生維度要 join `writing_submissions` 才拿得到 `student_id` | `student_id` 已反正規化在表上，零 join | **2** |
| **intervention support** | quote / correction 在 JSONB 裡，要取出來組 alert evidence 得再展開 | 直接 SELECT，還能用 `id` 在 alert 裡引用特定 finding | **2** |
| **data consistency** | ✅ **只有一份資料，不可能不一致** | ⚠️ 衍生資料，會與來源脫節（見下方緩解） | **1** |
| **migration risk** | 只加索引，零資料搬移 | 要建表 + 回填。但**純新增**，不動 `writing_analyses` 一個位元 | **1** |
| **maintenance** | 不必維護同步邏輯；但每個新查詢都要再寫一次展開 | 要維護一支同步函式；但之後所有查詢都便宜 | 平手 |

### 推薦：**方案 2（normalized table），但明確定位成「物化視圖」**

理由三條：

1. **你要的查詢本質上是關聯聚合，不是文件檢索。**
   「最近 30 天、高二A、犯過 WRITE_ERR_ARTICLE 的學生」和「最近 N 篇有至少 M 篇出現某 error」
   都是 `GROUP BY` + `HAVING`。GIN 索引幫不上 GROUP BY。

2. **`writing_analyses` 的 COMPLETED 列不可 UPDATE**（約束 1）。
   JSONB 方案若想加任何輔助欄位（例如標記哪一版是最新）根本做不到。
   normalized 表是**新表**，不受那條紅線限制。

3. **一致性風險可以被工程手段消除到可接受。**

### 一致性的具體緩解（這是採方案 2 的前提，不是附註）

| 手段 | 做法 |
|---|---|
| **來源真相不變** | `error_analysis` JSONB **永遠是 source of truth**。findings 表是它的**物化**，不是取代 |
| **可完全重建** | `writing_backfill_error_findings()` 能從零重建整張表。任何懷疑不一致時，清空重跑即可 |
| **同交易寫入** | event-driven 路徑在標記 COMPLETED 的同一個交易內呼叫 sync，不存在「分析完成了但 findings 沒寫」的中間態 |
| **對帳查詢** | 提供一支 `writing_error_findings_reconcile()` 視圖：比對每篇最新分析的 JSONB finding 數 vs 表內列數，不符就列出來 |
| **findings 表不接受人工編輯** | RLS 只給 SELECT，寫入僅限 DEFINER 函式。不會有人手改出不一致 |

> 🛑 **不建議用 Postgres 的 MATERIALIZED VIEW。** 它只能整張重新整理，而我們需要「某一篇重新分析後只更新那一篇」。自己管一張表更可控。

---

## 5. Latest-analysis-only strategy —— **跨篇統計只算最新有效分析**

這是整個 Phase 1 最容易出錯的地方。同一篇重跑三次就有三列 `writing_analyses`，天真的聚合會把同一篇的錯誤算三遍。

### 三個可行做法

| 做法 | 評估 |
|---|---|
| (a) 在 `writing_analyses` 加 `is_latest` 旗標 | ❌ **不可行**。COMPLETED 列不可 UPDATE（約束 1） |
| (b) 查詢時 `DISTINCT ON (essay_id) ... ORDER BY essay_id, analysis_version DESC` | ⚠️ 可行但每支查詢都要記得寫，漏一次就錯。而且排序成本在每次查詢 |
| (c) ★ **讓 findings 表本身只含最新版** | ✅ **推薦** |

### 推薦 (c)：不變式寫進表裡

> **不變式：`writing_error_findings` 裡每個 `essay_id` 的所有列，都來自同一個 `analysis_id`，且該分析是這篇作文目前 `status='COMPLETED'` 中 `analysis_version` 最大的一個。**

`writing_sync_error_findings(p_analysis_id)` 的邏輯：

```
1. 讀 analysis：不是 COMPLETED → return {skipped: 'NOT_COMPLETED'}
2. 查這篇 essay 目前最大的 COMPLETED analysis_version
3. 如果傳進來的不是最大的 → return {skipped: 'SUPERSEDED'}
      （重跑舊版本、或並行呼叫亂序到達，都被這一步擋掉）
4. BEGIN
     DELETE FROM writing_error_findings WHERE essay_id = <essay>
     INSERT ... SELECT 從 error_analysis->'findings' 展開
   COMMIT
5. return {essay_id, analysis_id, inserted: n, replaced: m}
```

**好處**：下游**所有**查詢都不必再認識 `analysis_version` 這個概念。
`SELECT ... FROM writing_error_findings WHERE student_id = ?` 就是正確答案。

**代價與接受理由**：
- 舊版本的 findings 不在表內 → 但 `writing_analyses` 的 JSONB 全部留著，稽核與回溯都做得到
- 重跑會讓統計數字跳動 → 這是**正確行為**：新分析取代舊分析，profile 應該跟著變

**還要加一層保險**：
```sql
-- 防止兩個並行的 sync 各寫各的
SELECT pg_advisory_xact_lock(hashtext('wef:' || p_essay_id::text));
```
沿用既有 writing queue 的 advisory lock 習慣（778811），不新發明機制。

### 失敗分析怎麼處理

`status = 'FAILED'` 的分析**不進 findings 表**。
一篇作文若最新是 FAILED、但上一版是 COMPLETED → findings 表保留**上一版 COMPLETED** 的內容（因為 sync 只在 COMPLETED 時被呼叫，FAILED 不會觸發刪除）。這是對的：最後一次成功的分析仍然是我們對這篇作文最好的認識。

---

## 6. Student aggregation strategy

### 全部是 deterministic SQL，零 AI

`writing_refresh_error_profile(p_student_id, p_window)` 的計算：

```
essays := 該學生所有「有 COMPLETED 分析」的作文，依 essay_submitted_at DESC
          （只認 findings 表裡出現過 essay_id 的，或另外維護一張 analyzed essay 清單）
recent := essays 的前 p_window 篇

對每個出現過的 error_code：
  total_occurrences            := count(findings)
  essay_count_with_error       := count(distinct essay_id)
  total_essay_count            := count(essays)              ← 分母
  total_word_count             := sum(distinct essay 的 word_count)
  first_seen_at / last_seen_at := min/max(essay_submitted_at)

  recent_sample_size            := count(recent)             ← 實際，不是設定值
  recent_essay_count_with_error := count(distinct essay_id ∩ recent)
  recent_occurrences            := count(findings ∩ recent)
  recent_word_count             := sum(recent 的 word_count)

  normalized_error_rate         := total_occurrences  * 100.0 / nullif(total_word_count, 0)
  recent_normalized_error_rate  := recent_occurrences * 100.0 / nullif(recent_word_count, 0)
```

### 三個容易錯的地方

1. **`total_essay_count` 的分母是「已分析的作文」，不是「所有作文」。**
   沒分析過的作文對「這個學生犯過幾次」沒有貢獻，也不該進分母 —— 否則學生交越多沒分析的作文，錯誤率看起來越低。

2. **`sum(word_count)` 必須 distinct by essay。**
   一篇作文有 5 個 findings，它的字數只能算一次。直接 `sum(essay_word_count)` over findings 會把字數乘以 finding 數。

3. **`word_count` 可能是 NULL**（`add_writing_texts_word_count.sql` 之前的舊作文）。
   `nullif(..., 0)` 處理除以零，但 NULL 字數的作文應該**排除在 rate 的分母外**，同時保留在 count 統計裡。這個不一致要在欄位註解裡寫明。

### `p_window` 放哪裡

建議存成**站台設定**而不是寫死在函式裡：`recent_window_size` 欄位記錄「這一列是用多大的視窗算的」，之後改設定時能看出哪些列還是舊視窗算的。第一版可以先給預設值（建議 5，但**這是待決定項，見 §15**）。

---

## 7. Recurring-status options（§E）

### 第一版四個狀態 + 兩個附加

| status | deterministic 規則（建議，門檻待定） | 說明 |
|---|---|---|
| `INSUFFICIENT_DATA` | `total_essay_count < MIN_ESSAYS` | ★ 規格沒列，但**必須有**。n=1 時任何狀態都沒有意義 |
| `NEW` | 只在最近 1 篇出現，且 `essay_count_with_error = 1` | 第一次看到 |
| `REPEATED` | `essay_count_with_error >= 2` 且不符合 PERSISTENT | 出現在兩篇以上 |
| `PERSISTENT` | `recent_essay_count_with_error >= M` of `recent_sample_size >= N` | 近期視窗內反覆出現 |
| `IMPROVING` | `recent_normalized_error_rate < total_normalized_error_rate * IMPROVE_RATIO` 且 `recent_sample_size >= N` | 見下方措辭警告 |

**刻意不做**：`RESOLVED` / `MASTERED`。理由是 TR-12 / TR-13 —— `count = 0` 只代表本篇未發現。

### ⚠️ `IMPROVING` 的措辭必須小心

同一條 TR-12 邏輯也適用於 IMPROVING：**近期錯誤率下降，不等於學生進步了**。
可能只是近期那幾篇題型較簡單、較短、或剛好避開了那個句型。

➡️ **建議**：資料欄位叫 `IMPROVING` 沒問題，但**老師看到的文字**必須是觀察句而非結論句：
- ✅「最近 5 篇的出現率比整體低」
- ❌「學生已改善冠詞用法」

這一條要寫進 UI 文案規範，不是靠 prompt 拜託 AI。

### `confidence` 欄位的規則（規格外的建議）

```
confidence := 'LOW' 當以下任一成立：
  · error_code = 'WRITE_ERR_GRAMMAR_OTHER'        ← 約束 3
  · total_essay_count < MIN_ESSAYS
  · recent_sample_size < N
  · total_word_count IS NULL 或 = 0（算不出 rate）
否則 'HIGH'
```

**只有 `confidence = 'HIGH'` 且 `status IN ('REPEATED','PERSISTENT')` 才會產生 alert。**
GRAMMAR_OTHER 照常入庫、照常算 profile、照常在 UI 顯示，但**永遠不會**變成 alert。這正是約束 3 要的效果，而且是用資料規則落實，不是靠人記得。

---

## §F. Normalization —— raw count vs errors per 100 words

### 建議：**兩個都存，但存的是「可重算的輸入」**

| 存什麼 | 為什麼 |
|---|---|
| `total_occurrences`（raw） | 老師最直覺的數字。「這學期冠詞錯了 12 次」 |
| `total_word_count`（分母） | ★ **關鍵**。有它才能任何時候重算任何 rate |
| `normalized_error_rate`（快取） | 排序與篩選用，避免每次查詢都算 |

**原則：不要只存 rate。** 只存 rate 的話，之後想改成「每 200 字」或想看原始次數就回不去了。
存了分子分母，rate 隨時可以重算，也可以被驗算。

### Implementation options（不決定門檻，只列選項）

| 選項 | 做法 | 適合 |
|---|---|---|
| **O1 純 raw** | 只用 `essay_count_with_error >= M` 判定 | 最容易解釋給老師聽。但長文吃虧 |
| **O2 純 rate** | 只用 errors／100 words | 公平，但「0.8 次/百字」老師沒有直覺 |
| **O3 raw 為主、rate 為輔** | 先用篇數門檻篩，再用 rate 排序優先度 | ★ 我傾向這個：判定用直覺的，排序用公平的 |
| **O4 雙門檻** | 兩者都要過 | 最嚴格，alert 最少。若初期噪音太多可以切到這個 |

**都不要現在決定。** 建議先做 §13 的 dry-run：把規則跑在現有資料上、印出「會產生哪些 alert」但不真的建立，看數量與內容再定門檻。

### 還有一個 normalization 維度沒人提到

**題型難度**。同一個學生寫記敘文與論說文，錯誤分布本來就不同。
現在 `essay_topic` 是自由文字，**無法**做這個正規化。
➡️ 第一版**明確不做**，但要在文件裡記下這是已知的 confounder，否則之後看到「某題目錯誤率特別高」會誤以為是學生問題。
