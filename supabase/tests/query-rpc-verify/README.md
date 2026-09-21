# A4–A7 驗收查詢

> 🟢 全部唯讀。staging 與 production 都可以安全執行。
> 一次貼一份（Supabase SQL Editor 只顯示最後一個查詢的結果）。

| 檔案 | 對應 | 要看什麼 |
|---|---|---|
| `A-common-errors.sql` | A4 | 依**學生數**排序的前 10 個 code |
| `A2-meta.sql` | A4 | total / limit / truncated |
| `B-error-to-students.sql` | A5 | 🛑 清單尾端要有 **1 篇 / 1 finding** 的學生 |
| `C-student-to-errors.sql` | A6 | 🛑 只出現一次的 code 要在；`is_selected` 只有 ARTICLE 是 true |
| `D-drilldown.sql` | A7 | 🛑 `correction` 原樣，不截斷（看「修正長度」欄） |

## 判讀重點

- **A4 的排序**：`GRAMMAR_OTHER` 的 findings 數很高（production 是 46），
  但它依學生數應該落在第 5 左右。若它排到前三，代表排序用錯欄位了。
- **B 的尾端**：production 的 ARTICLE 清單有兩位是 1 篇 / 1 finding。
  他們消失就代表有人加了門檻。
- **C 的 `is_selected`**：D8 = S-b。老師選 ARTICLE，但畫面要看到該生**全部**的 code，
  只有 ARTICLE 標 true。
