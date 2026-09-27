# 學生端閱讀流程 E2E

```bash
npm run e2e:install   # 第一次：裝 chromium（npm install 不會裝，見 .npmrc）
npm run e2e           # 跑全部
npm run e2e -- -g 卡住 # 只跑名字含「卡住」的
npm run e2e:ui        # 互動模式
```

`npm run e2e` 會自己用 `vite.config.e2e.ts` 起一個 dev server（127.0.0.1:5173），
跑完自己收掉。CI 走 `.github/workflows/e2e.yml`。

容器裡已經有 chromium 時，用 `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium` 指給它，
就不必再裝一份。

## 這些測試驗的是什麼

瀏覽器裡跑的是**真正的前端**：真的路由、真的 state、真的 render 排程。
應用程式的程式碼一行都沒有為了測試而改——沒有 `if (isTest)`、沒有注入點。

被換掉的只有**網路那一層**：`vite.config.e2e.ts` 把 `@/lib/supabase` 指向
`e2e/fake-supabase.ts`。

🛑 **所以這裡驗的是「前端有沒有把契約用對」，不是伺服器對不對。**
伺服器那一半在別的地方驗：

| 驗什麼 | 在哪裡 |
|---|---|
| 前端流程、render 時序、路由、狀態 | 這裡 |
| RPC 的規則、權限、亂序換算 | `supabase/tests/*.sql` |
| 真實資料上的計分一致性 | `supabase/tests/reading-staging/SHUFFLE-verify.sql` |

假後端的規則必須跟真的伺服器一致（一題只能答一次、重排後才貼 A–D、
存顯示位置……）。照抄形狀但規則不同的假後端，會讓測試退化成
「證明假後端跟自己一致」。改動任何一支 reading RPC 時，
`e2e/fake-supabase.ts` 要一起看一遍。

## 兩條 regression

| 測試 | 它擋的 bug |
|---|---|
| `只點進去看一眼沒作答，首頁不可以說【繼續上次練習】` | 打開文章就建 session，空 session 被當成進度 |
| `六題做完按【看結果】會進結算，不會卡住` | `finish()` 用 setState 的 updater 讀 state，帶著 `finishing: true` 提早 return |

兩條都驗過「把 bug 放回去就會紅」。寫完 regression 測試一定要做這一步——
對著修好的程式碼寫出來的測試，很容易兩種情況都通過。
