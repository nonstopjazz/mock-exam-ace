# 忘記密碼 / 重設密碼 — 上線手冊

> 使用者自己就能重設密碼，不必找老師去 Supabase 後台手改。

---

## 動線

```
/login
  └─ 密碼欄旁邊的「忘記密碼？」
       ↓
/auth/forgot-password          輸入 Email → 寄出重設連結
       ↓ （信箱裡的連結）
/auth/reset-password           設定新密碼 → 直接登入
```

三個頁面全部**公開**（不在 `ProtectedRoute` 底下）—— 會走到這條路的人，
正是「登不進去」的那群。

---

## 🔴 上線前你要做的設定

**沒有 SQL、沒有新套件、沒有新環境變數。** 只有一件事：

### Supabase → Authentication → URL Configuration → Redirect URLs

把重設頁加進允許清單。`redirectTo` 用的是 `window.location.origin`，而這個 repo
部署成**三個 Vercel 專案**，所以三個網域都要各加一條：

```
https://gsat.ilearn.blog/auth/reset-password
https://<toeic 站的網域>/auth/reset-password
https://<kids 站的網域>/auth/reset-password
```

不在清單裡的 redirect 會被 Supabase 擋掉，使用者會被丟回首頁而不是重設頁 ——
**這是這個功能最可能失敗的地方，而且失敗時看起來像「連結壞了」。**

本機開發要測的話，再加一條 `http://localhost:5173/auth/reset-password`。

### 寄信本身

走 Supabase Auth 內建的信箱設定，與 `api/send-daily-reminders.ts` 的 Web Push
是兩回事。**如果現在的註冊驗證信會正常寄達，重設信走的是同一條路。**

⚠️ Supabase 內建的寄信服務有速率限制、定位是開發測試用。真的對全班開放之前，
值得確認你的專案是走內建還是自訂 SMTP —— 一個班同時來重設可能會撞到限制。

---

## 技術細節：連結是怎麼變成可用的 session 的

`src/lib/supabase.ts` 建立 client 時**沒有傳任何 options**，所以 supabase-js 用的
是預設值：

| 選項 | 值 | 後果 |
|---|---|---|
| `flowType` | `implicit` | token 放在網址的 **hash**（`#access_token=...&type=recovery`） |
| `detectSessionInUrl` | `true` | client 一載入就**自動**消化那個 hash |

所以 `ResetPassword.tsx` **不需要**自己解析 token，也不需要
`exchangeCodeForSession`。判準是：

```ts
const { data } = await supabase.auth.getSession();
// getSession() 內部會等 detectSessionInUrl 處理完才 resolve
data.session ? '連結有效' : '連結失效';
```

🛑 **不要改成用 `setTimeout` 等 hash 被處理完** —— `getSession()` 本身就是那個信號。
（若哪天有人把 client 改成 `flowType: 'pkce'`，這一頁要跟著改成
`exchangeCodeForSession`，因為那時 token 會變成 query 的 `?code=`。）

---

## 三個狀態，缺一不可

| 狀態 | 什麼時候 | 畫面 |
|---|---|---|
| `checking` | 剛進頁面 | 「正在確認連結」 |
| `ready` | `getSession()` 有 session | 新密碼 + 確認兩欄 |
| `invalid` | 沒有 session | 「連結已失效」+「重新寄一封」 |

**`invalid` 是最容易被省略、也最不能省的那一個。** Supabase 的重設連結有時效，
而且**點過一次就失效**。沒有這個分支的話，使用者會看到一個長得完全正常的表單，
填完送出才發現沒生效 —— 而那時他通常會以為是自己密碼打錯了。

---

## 兩個刻意的決定

**🛑 不論 Email 有沒有註冊過，成功畫面完全一樣。**

`resetPasswordForEmail()` 本來就不告訴呼叫端帳號存不存在。如果這一頁反過來顯示
「查無此帳號」，等於把一個帳號列舉工具送給任何人：輸入一串 email，就能篩出
哪些人是這個站的使用者。所以連 error 都不細分 —— 唯一會顯示錯誤的情況是
「請求根本沒送出去」（網路斷、Supabase 掛了），那與帳號存不存在無關。

**用 Google 註冊的人，頁面上直接講。**

那些帳號原本沒有密碼。不講的話他們會在這裡等一封其實不需要的信
（那封信對他們有效，只是繞遠路）。所以忘記密碼頁固定有一句：
「當初是用 Google 帳號註冊的話，不需要密碼 —— 直接回登入頁按『使用 Google 帳號繼續』就好。」

重設完成之後那個帳號會多一組密碼，Google 登入照樣可用，兩者並存。

---

## Staging 驗收清單

| # | 驗什麼 | 通過條件 |
|---|---|---|
| 1 | 入口 | `/login` 的密碼欄旁邊看得到「忘記密碼？」，手機上不會擠掉 Label |
| 2 | 正常流程 | 輸入有註冊的 Email → 收到信 → 點連結 → 設新密碼 → **直接進到站內** |
| 3 | 新密碼可用 | 登出 → 用新密碼登入成功 |
| 4 | 舊密碼失效 | 用舊密碼登入 → 失敗 |
| 5 | 🛑 **連結點第二次** | 同一封信的連結再點一次 → 看到「已失效」+「重新寄一封」，**不是空白表單** |
| 6 | 🛑 **連結放過期** | 等超過時效再點 → 同上 |
| 7 | 直接開網址 | 直接輸入 `/auth/reset-password` → 「已失效」，不是可填的表單 |
| 8 | 🛑 不存在的 Email | 輸入沒註冊過的 Email → **與有註冊時一模一樣的畫面**，不得出現「查無此帳號」 |
| 9 | 兩次輸入不一致 | 兩欄填不同 → 「兩次輸入的密碼不一樣」，不送出 |
| 10 | 太短 | 填 5 個字元 → 「密碼至少需要 6 個字元」 |
| 11 | Redirect 允許清單 | 若第 2 步點連結後被丟到首頁 → 就是 Supabase 的 Redirect URLs 沒加 |
| 12 | 三個站 | toeic 與 kids 站各測一次第 2 步（它們共用 `/login`，但網域不同） |

第 5、6、7 三項是實務上最常漏測、也最常被使用者遇到的。

---

## 會改到的既有行為

`/login` 是**三個站共用**的，所以「忘記密碼？」這個連結會同時出現在
gsat、toeic、kids 三個站上。

`AuthContext.resetPassword()` 在這次之前就存在，但**全專案沒有任何呼叫點**，
而且它的 `redirectTo` 指向一個當時不存在的路由（會掉進 404）。這次是把它接起來，
不是新寫一套。
