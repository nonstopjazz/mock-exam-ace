# 字數 = 單字數（不是字元數）—— 上線步驟

## 問題

`writing_texts.char_count` 是 `char_length(content)`，也就是**字元數**，但前端五個地方都把它標成「字」。
一篇 273 個英文單字的作文因此顯示成「1782 字」。

學測作文的篇幅要求是以**單字數**計，所以這不只是單位標錯，而是會讓學生誤判自己寫得夠不夠。

## 改了什麼

| 檔案 | 內容 |
|---|---|
| `supabase/migrations/add_writing_texts_word_count.sql` | `writing_texts` 新增 `word_count` generated column；`writing_student_essay_cards()` 與 `writing_admin_queue()` 各多回一個欄位 |
| `.rollback.sql` | 先把兩支函式換回舊版，再刪欄位 |
| `src/lib/writing/wordCount.ts` | 前端的同一個定義（撰寫頁的即時計數用） |
| 五個顯示位置 | 改讀 `word_count` |

單字的定義：**以空白切分**。連字號詞（well-known）算一個字，與 Word 一致。
資料庫與前端用的是同一個定義，同一篇作文在任何畫面都會是同一個數字。

⚠️ 中文不適用（中文字之間沒有空白）。這個系統的作文是英文；之後若要收中文作文，兩邊都要另外處理。

## 順序

**先套 migration，再部署前端。** 反過來的話，前端會拿不到 `word_count`，字數會變成空白。

### 1. staging

1. SQL Editor 貼上 `add_writing_texts_word_count.sql` → Run
2. 驗證：

```sql
-- 欄位存在、而且算出來的是單字數
SELECT char_count, word_count, left(content, 60) AS 開頭
  FROM writing_texts
 ORDER BY created_at DESC
 LIMIT 5;
```

預期：`word_count` 大約是 `char_count` 的 1/5 到 1/7（英文平均一個字 5–6 個字元加一個空白）。
若兩欄一樣，代表欄位沒建起來或建錯。

3. 學生帳號開 `/learn/student/writing`，卡片上的字數應該從四位數變成三位數。

### 2. production

同樣兩步。

⚠️ `ADD COLUMN ... GENERATED ALWAYS AS ... STORED` 會**重寫整張表**並短暫取得 ACCESS EXCLUSIVE 鎖。
`writing_texts` 目前只有數十列，實際上是瞬間完成，但請不要在學生正在送作文的時候執行。

## 回滾

前端：Vercel 把上一版 Production deployment 設回去。
資料庫：執行 `add_writing_texts_word_count.rollback.sql`（它會先換回函式再刪欄位，順序不能反）。

## 測試

`tests/sql/writing_student_essay_cards_test.sql` 本機 PostgreSQL 16 跑 **25 項全 PASS**，其中兩項是這次加的：

- 250 個字元、中間沒有空白的字串 → 1 個字（證明不是字元數）
- 前後有換行與 tab 的十字句子 → 10 個字（`btrim` 不帶字元集只去空格，換行會多算一個字）
