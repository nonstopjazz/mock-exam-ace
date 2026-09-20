# Writing Error Intelligence — Phase 1 Implementation Plan

> **只做規劃。** 沒有修改任何程式碼、資料庫、Prompt、UI；沒有建立 migration；沒有 commit。
> 嚴格沿用既有 `writing-v2` taxonomy（17 個 `WRITE_ERR_*`），不建立新 taxonomy。
> 基準：`main` @ `02d4a68`

---

## 0. 三個先決約束（規劃前必須知道）

這三條是既有系統已經寫死的，整個設計都繞著它們走。

### 約束 1 —— `writing_analyses` 的 COMPLETED 列**完全不可 UPDATE**

```sql
IF OLD.status = 'COMPLETED' THEN
  RAISE EXCEPTION '已完成的分析不可修改；重新分析請插入新的一列（analysis_version + 1）';
```

`create_writing_analyses.sql:217`。這是無條件的 —— **不分欄位**。

➡️ **後果：不能在 `writing_analyses` 上加 `is_latest` / `superseded_at` 這種可變旗標。**
「哪一版是最新」必須在**別的地方**表達。這直接決定了 §C 與 §5 的設計。

### 約束 2 —— TR-12 / TR-13：`count = 0` 不是精熟

`ZERO_ERROR_LABEL = "本篇未發現此類錯誤"`，`coverage_source = "SERVER_DERIVED"`。
➡️ 第一版**不得**有 `RESOLVED` / `MASTERED` 狀態。§E 照辦。

### 約束 3 —— `WRITE_ERR_GRAMMAR_OTHER` 是已知被濫用的 fallback

contract 裡記著 2026-09-05 的量測：弱作文 28 筆 findings 有 7 筆是它，其中至少兩筆的 reason 自己就說出了更具體的類別。
➡️ 它**不得**用於產生高可信度的 persistent alert。但**要照常入庫**（統計仍需要它，只是不當訊號）。

---

## 1. Proposed architecture

```
                        ┌──────────────────────────────────────┐
                        │  writing_analyses  （不動，來源真相）  │
                        │  error_analysis JSONB                │
                        │  COMPLETED 之後永久凍結               │
                        └───────────────┬──────────────────────┘
                                        │ ① 物化（可重建）
                                        ▼
        ┌────────────────────────────────────────────────────────┐
        │  writing_error_findings         【新】事實表            │
        │  一列 = 一個 finding                                    │
        │  ★ 只保留「每篇作文目前最新的已完成分析」的 findings      │
        │    → 任何下游查詢都不必再處理 analysis_version           │
        └───────────────┬────────────────────────────────────────┘
                        │ ② deterministic aggregation（無 AI）
                        ▼
        ┌────────────────────────────────────────────────────────┐
        │  student_writing_error_profiles 【新】快取表            │
        │  一列 = student × error_code                            │
        │  純算術，可從 findings 完全重建                          │
        └───────────────┬────────────────────────────────────────┘
                        │ ③ rule engine 決定「要不要建 alert」
                        ▼
        ┌────────────────────────────────────────────────────────┐
        │  writing_error_alerts           【新】持久化 alert      │
        │  ai_summary 為 NULL = 還沒生成 → 這一欄同時當作待辦佇列   │
        └───────┬──────────────────────────────┬─────────────────┘
                │ ④ AI 只做文字                 │ ⑤ 呈現
                ▼                              ▼
   compact digest → DeepSeek            /admin/writing
   （不送全文）                          ├ Essay view（現有，加 Error filter）
                                        └ Student view（新 tab，同一頁）
                                        Web Push 只是 delivery channel
```

**職責切得很死（規格 §H 的要求）**

| 誰 | 負責 |
|---|---|
| Rule / aggregation engine | count · frequency · trend · status · **要不要建 alert** |
| AI | 跨篇摘要 · 教學建議 · teacher-facing 說明 |

AI **不決定**是否通知老師。alert 先被建立，`ai_summary` 後補。
這也表示：**AI 掛掉不影響 alert 的存在**，只是那則 alert 沒有文字摘要。

---

## 2. Existing → new data flow

```
【現有，完全不動】
學生送出 → writing_submissions / writing_texts
老師勾選 → /api/writing-queue-enqueue → writing_enqueue_analysis_batch()
         → kickWorker → /api/writing-queue-worker
         → writing_queue_claim()（advisory lock 778811, concurrency=1）
         → /api/analyze-writing（四支 pass + 綜合層）
         → writing_analyses.status = 'COMPLETED'
                                    │
══════════════════════════════════ 以下是新增的 ══════════════════════════════
                                    │
                    ① writing_sync_error_findings(p_analysis_id)
                       · 只接受 status = 'COMPLETED' 的分析
                       · 只在它是該 essay 的最高 analysis_version 時才動作
                       · DELETE 該 essay 既有 findings → INSERT 新的
                       · 同一交易內完成，不經過任何佇列
                                    │
                    ② writing_refresh_error_profile(p_student_id)
                       · 純 SQL 聚合，從 findings 重算該學生所有 error_code
                       · 無 AI、無外部呼叫
                                    │
                    ③ writing_evaluate_error_alerts(p_student_id)
                       · 套用 §E 的 deterministic 規則
                       · 該建 alert 就 INSERT（ai_summary = NULL）
                       · 已有未處理的同 (student, error_code) alert 就不重複建
                                    │
                    ④（可選，非同步）AI 摘要
                       · 撈 ai_summary IS NULL 的 alert
                       · compact digest → DeepSeek → UPDATE ai_summary
                       · 失敗不影響 alert 本身
```

**① 的呼叫點有三個，但函式只有一支**（規格 §G「共用同一套底層分析能力」）：

| Trigger | 呼叫方式 |
|---|---|
| Event-driven | `/api/analyze-writing` 在標記 COMPLETED 後呼叫 ①②③ |
| Weekly | cron → 對「上週有新分析的學生」跑 ②③ |
| Manual | 老師勾選 → 對選中的學生跑 ②③（＋④） |

---

## 3. 建議新增／修改的 tables / RPC / indexes

### 3.1 新增 table（3 張）

#### `writing_error_findings` —— 事實表

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `analysis_id` | UUID NOT NULL | FK → `writing_analyses(id)` ON DELETE CASCADE |
| `essay_id` | UUID NOT NULL | FK → `writing_submissions(id)` ON DELETE CASCADE |
| `student_id` | UUID NOT NULL | FK → `auth.users(id)` ON DELETE CASCADE。**刻意反正規化**，避免每個查詢都要兩段 join |
| `analysis_version` | INTEGER NOT NULL | 來源版次，稽核用 |
| `error_code` | TEXT NOT NULL | **CHECK 對照 17 個 `WRITE_ERR_*`**，硬編在 CHECK 裡 |
| `primary_skill` | TEXT NOT NULL | 來自 finding，掛回 Axis 1 |
| `quote` | TEXT NOT NULL | 原文逐字片段 |
| `reason` | TEXT NOT NULL | |
| `correction` | TEXT NOT NULL | |
| `is_fallback_code` | BOOLEAN NOT NULL | **GENERATED**：`error_code = 'WRITE_ERR_GRAMMAR_OTHER'`。讓「排除 fallback」的查詢不必到處寫字串 |
| `essay_word_count` | INTEGER | 快照自 `writing_texts.word_count`。作文不可改，所以快照永遠正確 |
| `essay_submitted_at` | TIMESTAMPTZ NOT NULL | 快照。**時間篩選與「最近 N 篇」排序都靠它**，不必 join 回去 |
| `taxonomy_version` | TEXT NOT NULL | 來源分析的版本 |
| `created_at` | TIMESTAMPTZ NOT NULL | 物化時間，不是作文時間 |

**Indexes**
```
(student_id, error_code, essay_submitted_at DESC)   ← 主力：學生 × 錯誤 × 時間
(error_code, essay_submitted_at DESC)               ← 跨學生：誰犯過這個錯
(essay_id)                                          ← 重新物化時的 DELETE
UNIQUE (essay_id, analysis_id, error_code, quote, correction)  ← 防重複插入
```

> `quote` 進 UNIQUE 是因為同一篇同一 code 可以有多個 finding。
> 若 AI 真的吐出兩個完全相同的 (code, quote, correction)，那本來就是重複，擋掉是對的。

#### `student_writing_error_profiles` —— 快取表

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID NOT NULL | FK → auth.users CASCADE |
| `error_code` | TEXT NOT NULL | 同上 CHECK |
| `first_seen_at` / `last_seen_at` | TIMESTAMPTZ | 依 `essay_submitted_at` |
| `total_occurrences` | INTEGER | 全期 finding 數 |
| `essay_count_with_error` | INTEGER | 全期有此錯的作文數 |
| `total_essay_count` | INTEGER | ★ **規格沒列，但一定要有**。沒有分母，`essay_count_with_error` 無法解讀 |
| `total_word_count` | INTEGER | ★ 同理，errors-per-100-words 的分母 |
| `recent_window_size` | INTEGER | ★ 規格的 `recent_sample_size` 拆成兩欄：**設定值**… |
| `recent_sample_size` | INTEGER | …與**實際取到幾篇**（學生只有 2 篇時 window=5 也只有 2） |
| `recent_essay_count_with_error` | INTEGER | 近期視窗內有此錯的作文數 |
| `recent_occurrences` | INTEGER | 近期視窗內的 finding 數 |
| `recent_word_count` | INTEGER | 近期視窗的字數和 |
| `normalized_error_rate` | NUMERIC(8,3) | 全期 errors／100 words（快取，可重算） |
| `recent_normalized_error_rate` | NUMERIC(8,3) | 近期 errors／100 words |
| `status` | TEXT | `NEW` / `REPEATED` / `PERSISTENT` / `IMPROVING` / `INSUFFICIENT_DATA` |
| `trend` | TEXT | `UP` / `DOWN` / `FLAT` / `UNKNOWN` |
| `confidence` | TEXT | ★ `HIGH` / `LOW`。GRAMMAR_OTHER 與樣本不足一律 `LOW` |
| `last_analyzed_at` | TIMESTAMPTZ | 這一列上次重算的時間 |
| `last_alerted_at` | TIMESTAMPTZ | 上次為它建 alert 的時間（抑制重複打擾） |
| `updated_at` | TIMESTAMPTZ | |

**Constraints / Indexes**
```
UNIQUE (student_id, error_code)
(status, confidence) WHERE status IN ('REPEATED','PERSISTENT')   ← weekly 掃描用
(student_id)
```

> 加 `total_essay_count` / `total_word_count` / `recent_window_size` / `confidence` 這四欄是我的建議，理由寫在 §F 與 §E。規格原本的欄位一個都沒拿掉。

#### `writing_error_alerts` —— 持久化 alert

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID NOT NULL | FK → auth.users CASCADE |
| `error_code` | TEXT NOT NULL | 同上 CHECK |
| `alert_type` | TEXT NOT NULL | `REPEATED` / `PERSISTENT`（第一版只有這兩種會產生 alert） |
| `priority` | TEXT NOT NULL | `HIGH` / `NORMAL` / `LOW` |
| `evidence_summary` | JSONB NOT NULL | **deterministic** 產出：篇數、次數、視窗、每百字率、代表性 quote 的 id |
| `ai_summary` | TEXT NULL | ★ NULL = 尚未生成。**這一欄兼作待辦佇列** |
| `ai_status` | TEXT NULL | `PENDING` / `RUNNING` / `COMPLETED` / `FAILED`，給 §H 的 worker 用 |
| `ai_error_detail` | TEXT NULL | |
| `profile_snapshot` | JSONB NOT NULL | ★ 建立當下的 profile 快照。之後 profile 變了，alert 仍說得出「當時為什麼發」 |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `reviewed_at` / `reviewed_by` | | 老師看過 |
| `dismissed_at` / `dismissed_by` | | 老師關掉 |

**Indexes**
```
(student_id, error_code) WHERE dismissed_at IS NULL AND reviewed_at IS NULL  ← 防重複建
(created_at DESC) WHERE dismissed_at IS NULL                                 ← 收件匣
(ai_status) WHERE ai_status = 'PENDING'                                      ← AI 待辦
```

### 3.2 新增 RPC（7 支）

| 函式 | 性質 | 職責 |
|---|---|---|
| `writing_sync_error_findings(p_analysis_id UUID)` | DEFINER | 物化單次分析的 findings。**冪等**。非 COMPLETED 或非最新版 → 直接 return no-op |
| `writing_backfill_error_findings(p_limit INT)` | DEFINER, admin | 回填既有分析。分批，可重跑 |
| `writing_refresh_error_profile(p_student_id UUID, p_window INT)` | DEFINER | 純算術重算該學生所有 error_code 的 profile |
| `writing_evaluate_error_alerts(p_student_id UUID)` | DEFINER | 套 §E 規則，必要時 INSERT alert |
| `writing_admin_error_students(...)` | DEFINER, admin | **§B 的主查詢**：班級 + 時間 + error_code[] → 學生列表 + 統計 |
| `writing_admin_student_error_detail(p_student_id UUID)` | DEFINER, admin | 單一學生的 profile + 近期 findings + alerts |
| `writing_admin_alerts(...)` | DEFINER, admin | alert 收件匣，含 reviewed/dismissed 過濾 |

**全部照既有樣板**：`SECURITY DEFINER` + `SET search_path = ''` + `coalesce(is_admin(), false) IS NOT TRUE` 把關 + `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`。

### 3.3 修改既有物件（2 處，都是最小改動）

| 物件 | 改什麼 | 為什麼最小 |
|---|---|---|
| `writing_admin_queue()` | 在 LATERAL 區多一段，回傳 `error_codes TEXT[]`（該篇最新分析的 distinct error code） | **只多一欄**，既有 30 欄與排序完全不動。前端既有的 5 個 filter 一行都不改 |
| `writing_admin_queue()` | 班級 LATERAL 加 `AND m.left_at IS NULL` | 見 §J，獨立於本功能，建議單獨一支 migration |

⚠️ **`error_codes[]` 從哪裡來，有兩個選項**：
- (a) 從 `writing_error_findings` 讀（乾淨，但要等回填完成）
- (b) 從 `error_analysis` JSONB 當場展開（不依賴新表，但每次查詢都要展開全部列）

**建議 (a)**，並在回填完成前讓它回 `NULL`（前端 filter 對 NULL 一律視為「沒有錯誤資料」而不是「沒有錯誤」）。
