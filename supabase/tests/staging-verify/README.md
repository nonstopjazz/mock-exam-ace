# Phase 1A 第 1 批 —— staging 驗證步驟

> 🛑 **只在 gsat-staging 執行。不要在 production。**
>
> Supabase SQL Editor **只顯示最後一個查詢的結果**，所以這裡刻意**一個步驟一個檔案**。
> 每個檔案都可以整份貼進去執行，不需要從中間挑段落。

## 順序

| # | 檔案 | 寫入？ | 判讀 |
|---|---|---|---|
| 1 | `00-preflight.sql` | 唯讀 | 9 列「通過」**全部 true** 才往下。第 5 列若是 false（表已存在）先停下來 |
| 2 | `../../migrations/create_writing_error_findings.sql` | ✍️ 建表 | 最後一張表：`RLS開著=true · anon可讀=false · 登入者可讀=false · service_role可讀=true · service_role可寫=false · 索引數=6` |
| 3 | `../../migrations/create_writing_error_findings_sync.sql` | ✍️ 建函式 | 三支函式都 `SECURITY_DEFINER=true`、`search_path` 是空字串 |
| 4 | `03-backfill.sql` | ✍️ 回填 | `failed=0`。`remaining` 若 > 0，帶 `last_essay_id` 再跑一次 |
| 5 | `04-totals.sql` | 唯讀 | 「零錯誤作文數」應等於「分母 − 涵蓋作文數」 |
| 6 | `04b-code-distribution.sql` | 唯讀 | 各 code 的學生數／作文數／findings 數 |
| 6.5 | `04c-analysis-shape.sql` | 唯讀 | 🔴 「兩者一致」全部 true。分辨「真的零錯誤」與「findings 流失」 |
| 7 | **`05-reconcile.sql`** | 唯讀 | 🔴 **13 列全部必須是 0**。任何一列不是 0 就停 |
| 8 | `05b-sample.sql` | 唯讀 | 給人眼看的抽查 |
| 9 | `06-targeted-checks.sql` | 唯讀 | 6 列「通過」全部 true |
| 10 | `06c-fingerprint.sql` | 唯讀 | 記下總筆數與指紋 |
| 11 | `03-backfill.sql`（再一次） | ✍️ | — |
| 12 | `06c-fingerprint.sql`（再一次） | 唯讀 | 與第 10 步**完全相同** |
| 13 | `07-error-to-students.sql` | 唯讀 | 誰犯過 `WRITE_ERR_ARTICLE` |
| 14 | `08-student-to-errors.sql` | 唯讀 | 某位學生的全部 error code |
| 15 | `09-performance.sql` | 唯讀 | 看 Execution Time 與有沒有吃到 `idx_wef_code_time` |

## 幾個容易誤判的地方

- **「零錯誤作文數」> 0 是正常的** —— 那是寫得好的作文，不是漏掉了。
  ⚠️ 不要把它解讀成「這些學生已經學會了」（TR-12 / TR-13）。
- **`06-targeted-checks.sql` 的 6b 若是 0**，代表 staging 沒有「較新 FAILED 蓋過較舊 COMPLETED」
  的資料，那一項**在真實資料上無從驗證** —— 由 `writing_error_findings_test.sql`
  的 S1 / S17 以構造資料涵蓋。
- **`essay_topic` 是 NULL 的筆數可能 > 0** —— 題目本來就是選填。

## 出錯時

- `function ... does not exist` → 第 2、3 步還沒跑。
- `relation "writing_error_findings" does not exist` → 第 2 步還沒跑。
- 要全部撤掉重來：先 `create_writing_error_findings_sync.rollback.sql`，
  再 `create_writing_error_findings.rollback.sql`。
- 只是資料想重建（**不需要刪表**）：
  ```sql
  DELETE FROM public.writing_error_findings;
  SELECT jsonb_pretty(public.writing_backfill_error_findings(200));
  ```
