# Six-Way Reading — staging rollout plan

🛑 **這份是 staging 的計畫。production 一律等 staging 全部通過再談。**

驗證腳本都在 `supabase/tests/reading-staging/`，每一份都可以整份貼進
Supabase SQL Editor，**最後一張表的「結果」欄全部是 ✅ 才往下**。
（SQL Editor 只顯示最後一個查詢的結果，所以腳本刻意只留一個輸出。）

本機以真實 postgres 跑過全流程：三組驗證 103 項、匯入 296 篇、數字與 dry-run 完全一致。

---

## ⚠️ 先看這兩件事

### 1. 多了兩支 migration：學生根本開不了練習

`reading_sessions` 對 `authenticated` 只有 `GRANT SELECT`（這是對的——學生能自己寫
session 就能偽造 `passage_id`），但**沒有任何 RPC 會建立 session**。
於是學生拿不到 `session_id`，`reading_submit_answer` 在真實路徑上永遠叫不起來。

本機測試沒抓到，因為測試是以 superuser 直接 `INSERT INTO reading_sessions`——
**繞過了 grant**。一個只有測試走得通的路徑不是路徑。

同理，`reading_sessions.status` 沒有任何路徑可以從 `IN_PROGRESS` 轉成 `SUBMITTED`
（CHECK 要求 `submitted_at`，而學生沒有 UPDATE 權限）。一張永遠關不掉的 session 表，
「這篇練過了沒」這個最基本的問題就答不出來。

補上兩支，都放在 Group B：

| | 做什麼 |
|---|---|
| `create_reading_student_rpc_3_start.sql` | `reading_start_session(passage_id)`。同一位學生同一篇只會有一個進行中的 session（靠 partial unique index，不是「先查再寫」——那中間有 race） |
| `create_reading_student_rpc_4_finish.sql` | `reading_finish_session(session_id)`。伺服器端結算六個 construct；沒作答的標 `SKIPPED` 而不是 `WRONG` |

**所以是 14 支，不是 12 支。** 你要拿掉任一支都可以，說一聲我改計畫。

### 2. 296 篇要分 15 次貼

你不能用 CLI，而 canonical payload 是 2.8 MB —— SQL Editor 貼不下。
`npm run reading:emit-sql` 會把它切成 **15 份、每份 20 篇、約 165 KB**，依序貼。

這正是 `/admin/reading/import` 要解決的問題。在那個介面做好之前，這是唯一不需要 CLI
的路。**產出的 SQL 含題庫內容與正解，不會 commit**（`generated/` 在 `.gitignore` 裡），
我會直接把檔案傳給你。

---

## ⚠️ 已知的環境差異：lexical_items

`gsat-staging` **還沒有 `lexical_items`**（Lexical Phase 1 只上了 production）。

`reading_passage_vocab.lexical_item_id` 原本寫死外鍵指向它，會讓整支 migration 在
staging 失敗 —— 而卡住的是一個 **v1 一律是 NULL 的預留欄位**。用不到的東西不該擋住
用得到的東西，所以外鍵改成**有 `lexical_items` 才加**：

| 環境 | 結果 |
|---|---|
| production（有 lexical_items） | 外鍵照常加上 |
| gsat-staging（暫時沒有） | 欄位在、外鍵略過，migration 正常完成 |

**取捨要講明白：兩邊 schema 有一個已知差異。** 等 lexical 上了 staging，
跑 `create_reading_vocab_lexical_fk.sql`（冪等）補上，兩邊就一致。

---

## Group A — Core data model

| # | migration |
|---|---|
| 1 | `create_reading_passages.sql` |
| 2 | `create_reading_questions.sql` |
| 3 | `create_reading_passage_aux.sql` |
| 4 | `create_reading_sessions.sql` |

⚠️ 順序不能換：2 的外鍵指向 1，3 指向 1 與 `lexical_items`，4 指向 1、2 與 `auth.users`。

**驗證：`supabase/tests/reading-staging/A-verify.sql`（🟢 唯讀，51 項）**

八張表存在 · RLS 全開 · `authenticated` 讀得到六張、**讀不到 `reading_question_keys`
與 `reading_question_skills`** · 八張表一律不可寫 · 答案表沒有任何 `authenticated`
policy · 三個 UNIQUE 與四個外鍵 · 六個 CHECK 白名單 · `emphasis` 允許 NULL ·
**與模考系統零耦合（雙向都查）**

> 🛑 答案的安全性是**兩道獨立的鎖**：沒有 grant，而且沒有 policy。
> 其中一道將來被誰不小心打開，另一道還在。

---

## Group B — Publish guard + 學生端 RPC

| # | migration |
|---|---|
| 5 | `create_reading_publish_guard.sql` |
| 6 | `create_reading_publish_guard_2_trigger.sql` |
| 7 | `create_reading_student_rpc_1_fetch.sql` |
| 8 | `create_reading_student_rpc_2_submit.sql` |
| 9 | `create_reading_student_rpc_3_start.sql` ⬅️ 新增 |
| 10 | `create_reading_student_rpc_4_finish.sql` ⬅️ 新增 |

**驗證：`B-verify.sql`（✍️ 會寫入，自己清乾淨，25 項）**

DRAFT 可以不完整 · PUBLISHED 必須六題（trigger 擋） · 取題回傳不含答案與解說 ·
沒上架的文章讀不到（**錯誤訊息與「不存在」相同，不可被用來探測**） ·
學生拿得到 `session_id` 且重複呼叫回到同一個 · 伺服器端計分 ·
一題只能答一次（改送正解仍回傳第一次的結果） ·
**跨學生隔離**（拿別人的 `session_id` 作答／結算都被擋，而且是因為對的理由） ·
結算由伺服器統計、沒作答標 SKIPPED · 收掉之後不能再作答

fixture 的 `passage_id` 一律以 `ZZ-VERIFY-` 開頭，腳本頭尾都會刪，
結果表最後一欄 `殘留fixture` 必須是 **0**。

> 這份**不**證明「grant 擋得住真實學生」——那一層由 A-verify 的 A3／A4，
> 以及本機 `reading_phase1_test.sql` 的 H 段（整條路以 `authenticated` 角色跑）負責。

需要**兩位 `is_admin()` 回 false 的**使用者。一樣是問出來的，不是靠 email 猜的。
找不到腳本會直接回報，不會假裝通過。

---

## Group C — Admin import

| # | migration |
|---|---|
| 11 | `create_reading_import_1_batches.sql` |
| 12 | `create_reading_import_2_hash.sql` |
| 13 | `create_reading_import_3_one.sql` |
| 14 | `create_reading_import_4_batch.sql` |

**驗證：`C-verify.sql`（✍️ 會寫入，自己清乾淨，27 項）**

非管理員與未登入都被拒（**而且是因為對的理由**） ·
六題 → `imported` + publish-ready · 1–5 題 → `imported` 但不可上架 ·
**0 題 → `blocked`，一列都不寫** · `blocked` 與 `failed` 分開數 ·
完全相同 → `skipped` · 內容不同 → `conflict` 且**庫裡原封不動** ·
五篇裡兩篇壞不拖垮另外三篇（而且三篇**真的在資料庫裡**、壞的**一列都沒殘留**） ·
回傳不含正解與解說 · 批次紀錄表沒有任何存內容或答案的欄位

腳本**不猜誰是管理員** —— 它逐一切換身分去問 `is_admin()` 本人。
各環境的管理員判準不同（production 與 gsat-staging 用不同 email），寫死會出錯。

---

## Group D — 真實資料匯入

### D1 小批次（第 1 份，20 篇）

貼 `import-01-of-15.sql`。預期 `imported=20`，其餘全 0，回傳一個 `batch_id`。

**把 `batch_id` 記下來**——第 2 份開始要填進去。

跑 `D-verify.sql`（🟢 唯讀）。這個階段只看「D2 不變量」與「D3 答案安全」那幾列，
數量那幾列當然還小。

### D2 冪等（可選但建議）

把第 1 份**原封不動再貼一次**。預期 `imported=0 / skipped=20`，題數不變。

> ⚠️ 重貼第 1 份會**新開一個批次紀錄**（因為 `batch_id` 是 NULL）。
> 文章不會重複，但 `reading_import_batches` 會多一列。不影響資料，知道就好。

### D3 其餘 14 份

依序貼 02 → 15，每一份都把 `PASTE_BATCH_ID_HERE` 換成第 1 份的 `batch_id`。
最後一份帶 `p_final = TRUE`，批次狀態才會變 `COMPLETED`。

### D4 最終驗證

再跑一次 `D-verify.sql`。**每一列都要是 ✅**，數量要完全等於 dry-run 的預測：

| | |
|---|---:|
| 文章 | 296 |
| 題目 / 答案 | 1746 / 1746 |
| 段落 | 1276 |
| 詞彙 | 2681 |
| micro-skill（其中 emphasis NULL） | 5238（548）|
| 六題完整 / 不足六題 | 282 / 14 |
| 未收尾的批次 | 0 |

本機以真實 postgres 跑完整條路（15 份依序 + D-verify），這些數字**全部對上**。

---

## 停在這裡

D4 通過之後**先停下來回報**。之後才是 `/admin/reading/import` 的介面，
production rollout 再往後。

匯入之後所有文章都是 `DRAFT`——**上架是另一個動作**，這份計畫不包含它。
