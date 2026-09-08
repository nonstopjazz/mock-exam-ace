# 「我的作文」卡片列表 —— 上線步驟

## 這一次改了什麼

| 檔案 | 內容 |
|---|---|
| `supabase/migrations/create_writing_student_essay_cards.sql` | 新增一支唯讀 RPC `writing_student_essay_cards()` |
| `supabase/migrations/create_writing_student_essay_cards.rollback.sql` | 回滾（只是 DROP FUNCTION） |
| `tests/sql/writing_student_essay_cards_test.sql` | 本機測試（23 項，全部 PASS） |
| `src/hooks/learn/useEssayCards.ts` | 前端改走這支 RPC |
| `src/components/learn/writing/EssayCard.tsx` | 卡片元件 |
| `src/pages/learn/StudentWriting.tsx` | 清單改成卡片網格 |

不建表、不改表、不動任何 RLS 政策。舊的 `useEssayList()` 已移除（沒有其他呼叫者）。

## 為什麼需要新的 RPC

`writing_analyses` 的 RLS 只開放 admin 讀——學生讀不到自己那一列，這是刻意的
（那張表裡有 provider / model / error_detail / validation_issues）。學生看得到的批改結果
一律經過策展函式。卡片要在列表上就顯示「等待批改 / 批改中 / 已完成 + 等第」，
若沿用舊查詢就得對每一篇各打一次 `writing_student_analysis()`。

`writing_student_essay_cards()` 回傳的欄位，是 `writing_student_analysis()` 已經
允許學生看見的那個子集，一個都沒多。

## 順序（重要）

**先套 migration，再部署前端。** 反過來的話，學生會看到
`PGRST202 Could not find the function public.writing_student_essay_cards in the schema cache`。

### 1. staging

1. Supabase → gsat-staging → SQL Editor → 貼上
   `supabase/migrations/create_writing_student_essay_cards.sql` → Run
2. 驗證（在同一個 SQL Editor 執行）：

```sql
SELECT p.proname,
       p.prosecdef                                   AS security_definer,
       array_to_string(p.proconfig, ',')             AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'writing_student_essay_cards';
```

預期：`security_definer = t`、`config = search_path=""`、`anon_execute = f`、`auth_execute = t`。

3. 用學生帳號登入 staging，開 `/learn/student/writing`，確認卡片顯示正確
   （已批改的那篇要看得到等第）。

### 2. production

同樣兩步：先在正式專案的 SQL Editor 套 migration 並跑上面那段驗證，
再讓 Vercel 部署前端。

## 回滾

前端：Vercel 上把上一版 Production deployment 設回去（Promote to Production）。
資料庫：執行 `create_writing_student_essay_cards.rollback.sql`。

⚠️ 只回資料庫、不回前端的話，列表頁會壞掉（找不到函式）。要回就兩邊一起回，
或先回前端再回資料庫。

## 這一版還沒有的東西

卡片上的「結果格」目前放的是**等第**（表現突出 / 穩健 / 發展中 / 需要重整）。
20 分制（五維各 0–4、0.5 刻度、AI 給分＋老師可覆寫）之後會放進**同一格**，
版面不需要重做。
