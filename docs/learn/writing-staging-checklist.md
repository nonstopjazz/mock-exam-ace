# PHASE D3 — 真實 AI 驗證執行清單

目標：在把報告 UI 定案之前，先確認 DeepSeek 的真實行為。

**這份清單分兩段。第一段不需要任何部署。** 建議先做完第一段再決定要不要做第二段。

---

## ⚠️ 秘密處理原則

- `DEEPSEEK_API_KEY` 與 `SUPABASE_SERVICE_ROLE_KEY` **只**存在於
  Vercel 的環境變數設定，或你本機 shell 的環境變數裡。
- 不寫進原始碼、不寫進 `.env` 並 commit、不貼進聊天、不貼進 issue、不出現在 log。
- 這兩個變數**絕對不可以**加 `VITE_` 前綴。`VITE_` 開頭的變數會被 Vite 打包進
  前端 bundle，任何人打開 devtools 都看得到。
- 稽核腳本只從 `process.env` 讀 key，不會印出來，也不會寫進報告。
  （已由空跑檢查驗證：`npm run audit:writing:dryrun`）

---

# 第一段：模型品質驗證（不需要部署）

這一段用 `scripts/writing-audit.ts` 直接打 DeepSeek，跑的是
`api/analyze-writing.ts` **完全相同**的 prompt 與驗證程式碼，只是把資料庫換成記憶體。
因此量到的延遲、重試率、驗證結果，就是端點在 Preview 上會遇到的。

先做這一段的理由：最大的不確定性是「模型撐不撐得住 23 / 16 / 17 / 12 的完整覆蓋」。
這件事和部署完全無關，先確認它，才不會為了一個可能要改的東西去設定環境。

### 1. 先空跑一次（不花錢、不需要 key）

```bash
npm run audit:writing:dryrun
```

預期：`空跑檢查通過`。這證明稽核腳本不會跑到一半才炸。

### 2. 用真的 key 跑

```bash
DEEPSEEK_API_KEY='<你的 key>' npm run audit:writing
```

三篇代表性作文（中等 / 弱 / 強）各跑一次完整流程：四支平行 + 綜合層。
估計成本：三篇合計約 US$0.05–0.15，視重試次數而定。

只跑其中一篇：

```bash
DEEPSEEK_API_KEY='<你的 key>' npm run audit:writing -- tests/fixtures/writing/essay-c-strong.json
```

### 3. 產出

- 終端機：每支 pass 的延遲、呼叫次數、是否走了缺漏重試、證據查核結果、
  端對端延遲、對 50 秒硬性期限的餘裕、token 與成本估算。
- `docs/learn/writing-audit/<時間戳>-essay-<a|b|c>.md`：
  每篇一份完整可讀的稽核報告，含綜合層、三軸明細、以及人工判讀對照表。

把終端機的總結表貼回來，或把報告檔貼回來，我來一起判讀。
**報告裡不含任何秘密**，可以安全地貼。

### 4. 這一段要看的東西

| 面向 | 自動查核 | 需要人判斷 |
|---|---|---|
| 完整覆蓋 | ✅ 23 / 16 / 17 / 12 個節點 | — |
| 捏造證據 | ✅ 每段引用是否逐字存在於原文 | — |
| coverage 與 findings 一致 | ✅ | — |
| UNMEASURED 有理由、無證據 | ✅ | 理由合不合理 |
| 綜合層只引用已驗證 finding | ✅ | — |
| EFFECTIVE 給得合不合理 | ❌ | ✅ 強文的高分特徵有沒有被系統性漏看 |
| 弱文有沒有被虛假讚美 | ❌ | ✅ B 篇若出現一堆 EFFECTIVE 就是嚴重問題 |
| 修正對不對 | ❌ | ✅ |
| 建議有沒有教學價值 | ❌ | ✅ 是不是「多加練習」這種空話 |

### 5. 60 秒上限

報告會直接算出「對 50 秒硬性期限的餘裕」。
若最慢一篇的端對端超過 40 秒，腳本會在終端機警告。

**若真的逼近上限，先把數字回報，不要為了塞進去而改架構。**

---

# 第二段：Preview 部署（第一段結果可接受之後才做）

這一段驗證的是部署後的路徑：JWT → `is_admin()` → 資料庫狀態機，
不是模型品質（那在第一段就已經驗完了）。

## A. Vercel Preview 需要設定的環境變數

在 Vercel 專案 → Settings → Environment Variables，Environment 勾選 **Preview**：

| 變數 | 前綴 | 說明 |
|---|---|---|
| `VITE_SUPABASE_URL` | 前端可見 | Supabase 專案 URL |
| `VITE_SUPABASE_ANON_KEY` | 前端可見 | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **僅伺服器** | 繞過 RLS，等同資料庫最高權限 |
| `DEEPSEEK_API_KEY` | **僅伺服器** | DeepSeek |

前兩個 Preview 很可能已經有了（現有的 `api/generate-pack-audio.ts` 也用
`SUPABASE_SERVICE_ROLE_KEY`，若它在 Preview 已經能跑就代表已設定）。
真正新增的通常只有 `DEEPSEEK_API_KEY`。

程式碼會依序找 `VITE_SUPABASE_URL || SUPABASE_URL`、
`VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY`，兩種命名都吃得到。

## B. Preview 要指向哪個 Supabase 專案 —— 需要你決定

| 選項 | 優點 | 代價 |
|---|---|---|
| **(a) gsat-staging `cwymrzcovgobfqxtithn`**（建議） | 真實 AI 輸出不會寫進正式資料庫 | staging 目前缺 `is_admin()`，也可能缺 `writing_submissions` / `writing_texts`，要先補齊 |
| (b) 正式專案 `ytzspnjmkvrkbztnaomm` | 寫作基礎表已經存在，只要套一份 migration | 分析結果會寫進正式資料庫。雖然沒有「部署到正式站」，但等於動了正式資料 |

我建議 (a)。理由：第一段已經把模型品質驗完了，第二段只是驗授權與狀態機，
沒有理由為此在正式資料庫留下測試資料。

**(a) 需要先確認 staging 有沒有這些東西**（在 Supabase SQL Editor 執行，唯讀）：

```sql
SELECT
  to_regclass('public.writing_submissions') IS NOT NULL AS has_submissions,
  to_regclass('public.writing_texts')       IS NOT NULL AS has_texts,
  to_regclass('public.writing_analyses')    IS NOT NULL AS has_analyses,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) AS has_is_admin;
```

把結果貼回來，我再給對應的補齊順序。

## C. Migration 套用順序

只在你選定的專案上，依序執行，每一步確認成功再做下一步：

1. `public.is_admin()` —— 若 B 的查詢顯示 `has_is_admin = false`，必須先建立。
   `create_writing_analyses.sql` 開頭有相依檢查，缺它會直接 `RAISE EXCEPTION`
   停下來，不會安靜地建出一組沒人守門的函式。
2. `supabase/migrations/create_writing_submissions.sql`（若尚未存在）
3. `supabase/migrations/create_writing_texts.sql`（若尚未存在）
4. `supabase/migrations/create_writing_analyses.sql`

回滾：`supabase/migrations/create_writing_analyses.rollback.sql`
（本機已驗證來回一次物件數完全復原）。

⚠️ 這份 migration 從未套用到任何環境。它建立的全部是 `writing_` 前綴的新物件，
不觸碰 iLearn 或 Mock Exam 的任何東西。

## D. 套用後的驗證

把 `tests/sql/writing_analyses_security_test.sql` 整份貼進 Supabase SQL Editor 執行。
它是純 SQL、結果累積到暫存表後一次 SELECT，跑完會自己清乾淨。

預期：`40/40 全部通過`，殘留三欄皆為 `0`。

## E. Preview 上觸發一次真實分析

1. 用管理員帳號登入 Preview 站台
2. 開 `/admin/writing-debug`
3. 找一篇已送出的作文，按「執行完整分析」
4. 頁面會顯示原始 JSON 回應與端對端耗時

這個頁面**只是除錯工具**，不是學生看的報告 UI。
它刻意只顯示原始 JSON，不做任何呈現設計。

---

# 完成之後

回報以下項目，我再決定要不要調整 prompt，然後才開始報告 UI：

- 三篇的延遲（四支各自 + 綜合層 + 端對端）
- 有沒有 pass 走了缺漏重試，哪一支
- 有沒有驗證失敗
- 證據查核有沒有抓到捏造引用
- token 用量與估算成本
- 你對回饋教學價值的判斷（強文有沒有被漏看、弱文有沒有被虛假讚美、
  修正對不對、下一步是不是空話）
