# A4–A7 驗收查詢

> 🟢 全部唯讀。staging 與 production 都可以安全執行。
> 一次貼一份（Supabase SQL Editor 只顯示最後一個查詢的結果）。
>
> ⚠️ **A/B/C/D 每一份開頭都帶一段「取得管理員身分」。**
> SQL Editor 沒有 JWT，`auth.uid()` 是 NULL，`is_admin()` 回 NULL，
> 四支 RPC 會全部回 `42501 僅限管理員` —— 看起來像 migration 壞了，其實沒有。
> 那一行只是設定 `auth.uid()` 讀的 GUC，**不改資料、不改權限**，
> 也不會給你任何在 SQL Editor 裡原本沒有的能力。
>
> `00-preflight.sql` 的第 7 項在 SQL Editor 裡**本來就會是 false**，那是正常的。

| 檔案 | 對應 | 要看什麼 |
|---|---|---|
| `00-preflight.sql` | — | 7 項「通過」全部 true 才跑 migration |
| `A-common-errors.sql` | A4 | 依**學生數**排序的前 10 個 code |
| `A2-meta.sql` | A4 | total / limit / truncated |
| `B-error-to-students.sql` | A5 | 🛑 清單尾端要有 **1 篇 / 1 finding** 的學生 |
| `C-student-to-errors.sql` | A6 | 🛑 只出現一次的 code 要在；`is_selected` 只有 ARTICLE 是 true |
| `D-drilldown.sql` | A7 | 🛑 `correction` 原樣，不截斷（看「修正長度」欄） |
| `E-queue-error-codes.sql` | A8 | 不該出現「NULL 但分析已完成」 |
| `E2-queue-sanity.sql` | A8 | 3 列「通過」全部 true |
| `F-a9-health.sql` | A9 | 🔴「已完成但沒有 findings 列」必須是 0；⏱「秒級」代表 A9 正在運作 |

## 判讀重點

- **A4 的排序**：`GRAMMAR_OTHER` 的 findings 數很高（production 是 46），
  但它依學生數應該落在第 5 左右。若它排到前三，代表排序用錯欄位了。
- **B 的尾端**：production 的 ARTICLE 清單有兩位是 1 篇 / 1 finding。
  他們消失就代表有人加了門檻。
- **C 的 `is_selected`**：D8 = S-b。老師選 ARTICLE，但畫面要看到該生**全部**的 code，
  只有 ARTICLE 標 true。
