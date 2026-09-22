# 第 2 批（A4–A7）production rollout 紀錄

> 執行日期：2026-09-21 · 環境：**production** · 版本：`3f785cb`
> 範圍：**只有查詢層**。沒有 UI、沒有 A8／A9、沒有 profiles／alerts／AI／cron。
> 這一批**不寫入任何資料** —— 五支函式全部是 `STABLE`，rollback 只是 `DROP FUNCTION`。

---

## 0. 結論

**四支 RPC 在 420 筆真實 findings 上全部正確，三條紅線一條都沒踩。**

---

## 1. 前置與部署

| | |
|---|---|
| preflight | 7 項中 6 項通過 |
| 第 7 項「你是管理員」 | **false —— 預期行為**，見 §4 |
| 五支函式部署後 | 四支 admin：`SECURITY DEFINER` + `search_path=''` + anon 不可執行<br>`writing_error_scoped_findings`：**非 DEFINER、無 search_path、三個角色全不可執行**（刻意，見 §5） |

---

## 2. 三條紅線

### 🛑 紅線一：A4 的排序必須依學生數

| # | code | 學生數 | 作文數 | findings |
|---|---|---|---|---|
| 1 | `ARTICLE` | 18 | 32 | 78 |
| 2 | `PUNCTUATION` | 17 | 26 | 49 |
| 3 | `WORD_CLASS` | 16 | 20 | 26 |
| 4 | `NUMBER` | 15 | 22 | 38 |
| **5** | ⚠️ **`GRAMMAR_OTHER`** | **14** | 19 | **46** |
| 8 | `CHINGLISH` | 12 | **12** | 26 |

**✅ `GRAMMAR_OTHER` 落在第 5。** 若依 findings 數排序它會是**第 3**（46 僅次於 78 與 49）。
排序方式本身就在避免老師把一個已知的傾倒場當成教學主題。

`CHINGLISH` 是 12 位學生 / 12 篇 —— **每人各犯一次**，最乾淨的「值得全班講解」訊號。

### 🛑 紅線二：一次出現也必須列出

`WRITE_ERR_ARTICLE` 的學生清單共 **18 位**，尾端兩位：

| 學生 | 作文 | findings |
|---|---|---|
| `jameshon0609` | **1** | **1** |
| `kathychiang915` | **1** | **1** |

**✅ 他們在清單裡。** 任何 `HAVING count(*) >= 2` 都會讓這兩位消失 ——
而「只犯過一次但值得提醒」正是老師最容易漏掉、最想被提醒的情況。

### 🛑 紅線三：D8 必須是 S-b

老師選 `WRITE_ERR_ARTICLE`，`s411046` 因此入列。回傳的是他**全部 11 個** code：

| code | 篇數 | findings | 老師選的 |
|---|---|---|---|
| `ARTICLE` | 6 | 7 | **true** |
| `SV_AGREEMENT` | 4 | 7 | false |
| `PUNCTUATION` | 5 | 6 | false |
| … | | | |
| `WORD_CLASS` | 2 | 2 | false |
| **`PRONOUN`** | **1** | **1** | false |

**✅ S-b 成立**：只有 `ARTICLE` 標 `is_selected = true`，其餘 10 個照常回傳。
**✅ 無門檻**：`PRONOUN` 只有 1 篇 / 1 次，仍然在清單裡。

若是 S-a，這張表只會有第一列。

---

## 3. ✅ 意料之外的一致性驗證

A4 與 A5 是**兩條不同的聚合路徑**（前者 `GROUP BY error_code`，後者 `GROUP BY student_id`），
但因為共用同一個 scope 函式，結果必須對得起來。把 A5 的 18 列加總：

| | A5 加總 | A4 的 ARTICLE 列 |
|---|---|---|
| 學生數 | 18 | **18** |
| findings | **78** | **78** |
| 作文數 | **32** | **32** |

**三個數字全部相同。** 這不在驗收清單裡 —— 是把 B 的表格加起來才發現的。
「共用 scope」這個設計決定的價值在這裡具體看得到：
三個數字對不起來在結構上就不可能發生，因為過濾邏輯只寫了一次。

---

## 4. preflight 第 7 項是 false，那是對的

`is_admin()` 讀 `auth.uid()` 再比對 email（`create_user_profiles_table.sql:169`）。
**SQL Editor 沒有 JWT** → `auth.uid()` 是 NULL → `is_admin()` 回 NULL。

這不影響 migration（建函式不需要管理員），但**會擋住全部四支 RPC**，
而 `42501 僅限管理員` 看起來很像 migration 壞了。

解法是在驗收查詢開頭設定 `auth.uid()` 讀的 GUC：

```sql
SELECT set_config('request.jwt.claim.sub',
                  (SELECT id::text FROM auth.users WHERE email = '...'), false);
```

- 不改資料、不改權限，也不給 SQL Editor 任何它原本沒有的能力（那裡本來就是 `postgres`）
- 只讓應用層的 `is_admin()` 判斷能通過
- `auth.uid()` 同時吃 `request.jwt.claim.sub` 與 `request.jwt.claims`，
  兩種都以**與 production 逐字相同的定義**在本機實測過

四個驗收檔案都內建了這一段，所以每一份都是單獨一貼就能跑。

---

## 5. 為什麼共用 scope 函式不帶 `SET search_path`

這偏離了這個 repo 其他函式的慣例，理由是**實測**出來的。
帶 `SET` 的 SQL 函式**無法被 planner inline**，會變成 Function Scan，索引完全用不到。
2026-09-21 在 50,000 列上量測：

| | 計畫 | 時間 |
|---|---|---|
| 不帶 `SET` | **Index Only Scan** on `idx_wef_code_time`（Heap Fetches 0） | **1.1 ms** |
| 帶 `SET` | Function Scan，不走索引 | **5.6 ms** |

而 production 已經證實 `idx_wef_code_time` 正在被使用（第 1 批的 Bitmap Index Scan）。
加上 `SET` 等於親手把它關掉。

安全性改由三件事保證：
1. 所有物件**完全限定**（`public.xxx`），不依賴 search_path
2. **不給任何角色 EXECUTE**，外界叫不動
3. 四個呼叫端都是 `SECURITY DEFINER` + `SET search_path = ''`，而 `SET` 涵蓋巢狀呼叫

外層 wrapper 的 `SET` **不會**阻止內層 inline —— 這一點也是實測，不是推論。

---

## 6. A7 Drill-down

`s411046` 的 `ARTICLE` 回傳 **7 筆**（與 A5 的 7 筆一致），原文／修正／說明全部完整。

⚠️ **這一組樣本裡沒有超過 100 字元的 correction**（最長 75）。
整句改寫在 production 佔 15.2%，但剛好沒落在這位學生的 ARTICLE findings 裡。
所以「長 correction 不被截斷」這件事**在 production 這次沒有驗到** ——
由單元測試 T29／T30 以構造資料涵蓋（>100 字元，且逐字比對）。

⚠️ 這位學生的六篇作文 `essay_topic` 全部是 `null`。題目是選填欄位，
所以**題目 filter 對這批資料幾乎無效**。這不是 bug，但 UI 要注意：
「未分類題目」會是多數，不能把題目當成主要的分群維度。

---

## 7. LIMIT 與分頁

| RPC | 預設 | 上限 | 目前實際最大 |
|---|---|---|---|
| A4 | 20 | 50 | 17（taxonomy 天花板） |
| A5 | 100 | 500 | 21（有 findings 的學生數） |
| A6 | 50 位學生 | 200 | 21 |
| A7 | 50 | 200 | 單一學生單一 code，個位數 |

超過上限會被**夾住**而不是報錯。每個回應都帶 `total` 與 `truncated`，
**被截斷的清單不會看起來像完整的**。

**目前不需要 cursor / offset。** 要重新評估的觸發條件：
單一班級超過 500 位學生，或 findings 總數破萬。

---

## 8. 這次**沒有**驗證到的事

| 項目 | 為什麼 |
|---|---|
| class filter 在 production 的行為 | 驗收查詢沒帶 `p_class_id`。由單元測試 T19–T21（含 `left_at` 進出）涵蓋 |
| topic filter 在 production 的行為 | 這批資料的 `essay_topic` 多數是 null |
| 長 correction 不被截斷 | 見 §6 |
| 規模 | 420 筆證明不了 42,000 筆 |
| 非管理員被擋 | 只在單元測試 T39 驗過；production 沒有用非管理員身分試 |

---

## 9. 目前狀態

- **findings 表仍然不會自動更新**（A9 未實作）。新作文完成分析後要手動跑
  `SELECT jsonb_pretty(public.writing_backfill_error_findings(200));`
- **沒有 UI**。四支 RPC 只能從 SQL Editor 或程式呼叫
- 下一批：A8（`writing_admin_queue` 加 `error_codes[]`）+ A9（自動同步），然後才是 UI
