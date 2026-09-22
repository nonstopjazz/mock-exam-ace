# A8 + A9 rollout 紀錄

> 2026-09-21 · A8 已在 **production** 執行並驗收 · A9 **尚未部署**
> 版本：`1826372`

---

## A8：`writing_admin_queue()` 加 `error_codes` ✅ 已完成

### 執行結果

| | |
|---|---|
| `left_at修正還在` | **true** ← 最重要的一格 |
| `error_codes已加入` | true |
| `SECURITY DEFINER` / `search_path` | true / `""` |
| anon / 登入者可執行 | false / true |

`left_at` 那一格是這份 migration 最大的風險點：A8 是 `CREATE OR REPLACE`，
若誤用 PR #128 之前的版本當基底，2026-09-20 修好的班級權限漏洞會被**默默退掉**。
所以正向與 rollback 兩份都是從 `fix_class_membership_left_at.sql` **逐字取回**，
而且兩份都斷言這一格。

### 驗收

回填（第 3 步）：`processed 45 · inserted 420 · deleted 420 · failed 0 · remaining 0`。
與前一次完全相同 —— 空窗期沒有新分析，且 `deleted = inserted` 再次確認冪等。

| 錯誤資料狀態 | 作文數 | 平均幾種 code |
|---|---|---|
| ✅ 有錯誤資料 | 37 | 6.1 |
| ⚪ 已完成・未發現錯誤 | 8 | 0.0 |
| 🔴 **NULL 但分析已完成** | **0（沒有出現）** |

最後一列是唯一不該出現的組合 —— 有已完成的分析卻拿不到 `error_codes`。它沒有出現。

完整性（第 5 步）**3 / 3 通過**：

| | |
|---|---|
| `class_names` 還在 | 45 / 45 |
| 每列都有 `error_codes` | 45 / 45 |
| `error_codes` 與 findings 表一致 | **0 列不符** |

### ✅ 又一個意料之外的交叉驗證

`04b`（依 code 聚合）的「作文數」加總是 **227**，227 ÷ 37 = **6.14**，
與這裡（依作文聚合）的「平均 6.1 種 code」一致。
第三次出現這種「兩條獨立路徑得到同一個數字」的情況 ——
都是共用同一份物化資料的結果。

---

## A9：自動同步 ⏳ 尚未部署

程式碼已 commit，**但要部署到 Vercel 才會生效**，那是使用者端的動作。

### 現況

🔴 **findings 表目前仍然不會自動更新。**
每當有新作文完成分析，要手動跑：

```sql
SELECT jsonb_pretty(public.writing_backfill_error_findings(200));
```

這個狀態會持續到 A9 部署為止。

### 部署後怎麼驗

要等**下一篇作文完成分析**才驗得到。那時候：

1. **不要跑回填**
2. 直接跑 `supabase/tests/query-rpc-verify/E-queue-error-codes.sql`
3. 新那篇若直接就有 `error_codes` → A9 正常

失敗的話，Vercel log 裡會有：

```
[analyze-writing] findings 同步失敗，分析本身已完成，請用 writing_backfill_error_findings 補: { analysisId, code, message, details, hint }
```

`analysisId` 是刻意帶的 —— 沒有它就無法針對性地補那一篇。

### 設計要點

`syncErrorFindings()` 抽成獨立的 export，不是寫死在呼叫點，理由是**可測試性**。
`scripts/verify-writing-sync-call.ts` 用受控替身驗五件事，五個變異全部抓得到。

關鍵是 `if (error)` 而不是 try/catch：`supabase.rpc()` **從不 throw**
（postgrest 2.90.1 連斷線都轉成 `{ error }`），所以只包 try/catch 會把每一次失敗靜默吞掉。

---

## 目前整體狀態

| 項目 | 狀態 |
|---|---|
| A1–A3 findings 表與回填 | ✅ production |
| A4–A7 四支查詢 RPC | ✅ production |
| A8 `error_codes` | ✅ production |
| **A9 自動同步** | ✅ **production，已實測**（見下一節） |
| UI | ✅ production（PR #129） |

**Phase 1A 全部完成，而且每一項都有證據。**

---

## A9 實測記錄（2026-09-22）

部署後送一篇作文走完整分析，**沒有跑任何回填**，然後跑 `F-a9-health.sql`：

| 物化來源 | 作文數 | 最早分析完成 | 最晚分析完成 |
|---|---|---|---|
| ⏱ 秒級 → A9 自動同步 | **1** | 2026-09-22 | 2026-09-22 |
| ⚪ 零錯誤的作文（本來就沒有列） | 8 | 2026-09-07 | 2026-09-21 |
| 📦 小時級以上 → 手動回填 | 37 | 2026-09-08 | 2026-09-20 |

**判定：A9 正常。** 三件事同時成立才算數，這次三件都成立：

1. 秒級那一格從 **0 → 1** —— findings 是在分析標記 COMPLETED 之後幾秒內寫入的
2. 回填那格仍是 **37**（沒有變 38）—— 這次沒有跑回填，所以那筆不可能是回填產生的
3. **🔴「已完成但沒有 findings 列」沒有出現** —— 沒有任何一篇分析完卻沒物化

⚠️ 這次驗到的是【有錯誤的作文】。零錯誤的作文仍然驗不出來（沒有列就沒有
`created_at` 可比），那是這個方法已知的盲點，不是缺陷。零錯誤那條路徑只能看
Vercel log 沒有出現「findings 同步失敗」來反證。

從此之後 `writing_backfill_error_findings` 只在補歷史資料時才需要。

---

## 待處理（不阻塞）

| # | 項目 |
|---|---|
| 1 | ~~`analysisContract.ts` 7 處過時 taxonomy 數字~~ → 已於 2026-09-22 修正（PR #131） |
| 2 | 約 15% 的 `correction` 是整句改寫 → 影響 A7 drill-down 版面 |
| 3 | `essay_topic` 多數是 null → 題目 filter 對現有資料幾乎無效，UI 不能把它當主要分群維度 |
| 4 | `writing_admin_queue()` 的 `ORDER BY wt.created_at DESC` 缺 tiebreaker |
| 5 | `staging-verify/` 目錄名稱已不精確（兩個環境都在用） |
