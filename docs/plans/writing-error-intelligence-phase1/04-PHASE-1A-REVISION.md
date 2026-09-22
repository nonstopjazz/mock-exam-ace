# Phase 1A 修訂版 —— Error Finder 優先

> **只做規劃，不實作。** 沒有改任何程式碼、資料庫、Prompt、UI；沒有建 migration。
> 基準：`main` @ `02d4a68`，加上已於 2026-09-20 套用到 production 的 `left_at` 修正（PR #128）。
>
> **這份文件調整的是「先做什麼」，不是「怎麼做」。**
> `00-ARCHITECTURE.md` / `01-DATA-DECISIONS.md` / `02-TRIGGERS-AI-UI.md` / `03-BUG-MIGRATION-TEST-RISK.md`
> 的資料架構結論**全部保留**，只有優先順序與第一版範圍被重新切分。

---

## 0. 這份文件改了什麼、沒改什麼

### ✅ 完全保留（已確認採用）

| 決策 | 出處 |
|---|---|
| normalized `writing_error_findings` 事實表 | `00` §3.1 |
| `error_analysis` JSONB 維持 source of truth，findings 是物化視圖 | `00` §1、`01` §4 |
| latest-successful-analysis only | `01` §5 |
| findings 可隨時清空重建 | `01` §4 |
| 沿用 `/admin/writing`，不另開系統 | `02` §10 |
| deterministic aggregation 與 AI 分工切死 | `00` §1 |
| 不用 `count = 0` 推論 mastery（TR-12/13） | `00` §0 約束 2 |
| `WRITE_ERR_GRAMMAR_OTHER` 不作高可信度 alert | `00` §0 約束 3 |
| 嚴格沿用既有 17 個 `WRITE_ERR_*`，不新建 taxonomy | 全部 |

### 🔄 這份文件改變的

| 原本 | 現在 |
|---|---|
| Phase 1 的主軸是 **Persistent Error Detection**（找出反覆犯錯的學生） | Phase 1A 的主軸是 **Error Finder**（找出犯過某個錯的學生，一次就算） |
| UI 三個 tab：Essays / Students / Alerts | **作文 / 錯誤追蹤 / 提醒**，且「錯誤追蹤」同時支援雙向 |
| D1–D7 全部決定才能動工 | **D1–D7 都不再是 Phase 1A 的 blocker**（見 §4） |
| 第一版就要 profiles 表、alerts 表、weekly cron、AI digest | 這四樣**全部延後**到 1B / Phase 2 |

### 🛠 這份文件順手修正的一個原始設計錯誤

`00-ARCHITECTURE.md` §2 寫的是：

> 只在它是該 essay 的**最高 analysis_version** 時才動作

**這是錯的。** 若某篇作文有 v1 = `COMPLETED`、v2 = `FAILED`，最高版次是 v2，但 v2 沒有 findings ——
照原文的判斷會讓這篇作文的 findings 被清空，等於**重跑失敗就把舊的正確結果弄丟**。

正確的判準是「**最高的 `COMPLETED` 版次**」：

```sql
-- 這篇作文目前有效的分析
SELECT id FROM writing_analyses
 WHERE essay_id = p_essay_id AND status = 'COMPLETED'
 ORDER BY analysis_version DESC LIMIT 1
```

這正是 `01-DATA-DECISIONS.md` §5「latest-**successful**-analysis only」原本的意思，
`00` 的流程圖描述得不精確。以本節為準。

---

## 1. 需求轉向：老師真正要解決的問題

### 原本設計在回答的問題

> 「哪些學生有**反覆**出現的寫作錯誤，需要我特別關注？」

這需要累積、需要門檻、需要趨勢，所以要 profiles 表、`MIN_ESSAYS`、`PERSISTENT` 判定。

### 老師實際上要解決的問題

> 老師批改時發現某個值得立刻糾正的錯，但學生一多就會忘記：
> **「到底哪些學生犯過這個錯？」**

這是一個**查詢問題**，不是一個偵測問題。

| | 偵測問題 | 查詢問題 |
|---|---|---|
| 觸發者 | 系統（weekly scan） | **老師（當下就想知道）** |
| 門檻 | 需要（否則全是雜訊） | **不需要，一次出現就要查得到** |
| 需要累積嗎 | 要 | **不要** |
| 需要 AI 嗎 | 摘要有用 | **完全不需要** |
| 需要幾張新表 | 3 張 | **1 張** |

➡️ **Phase 1A 只做查詢問題。** 偵測問題的所有機制保留設計，但延後。

### 兩個方向都要

老師的思路不是單向的：

| 情境 | 方向 | 例子 |
|---|---|---|
| 剛批改完，發現一個典型錯誤 | **Error → Students** | 「誰犯過 Article error？我要挑出來個別講」 |
| 要跟某個學生一對一談 | **Student → Errors** | 「Amy 到目前為止犯過哪些錯？不要漏掉任何一個」 |
| 準備下一堂課 | **Common Errors** | 「這個班最多人犯的是什麼？值得全班統一講解」 |

三者**必須建立在同一份資料、同一組 filter 上**，否則老師會看到三個對不起來的數字。

---

## 2. Phase 1A 最小可上線範圍

### 2.1 一句話定義

> 把既有分析已經產生的 `WRITE_ERR_*` findings 物化成一張可查詢的表，
> 在 `/admin/writing` 加一個「錯誤追蹤」分頁，
> 讓老師能用班級／時間／題目／錯誤四個條件，雙向查到「誰犯過什麼」與「誰犯過哪些」，
> 並點開看到原文例句與修正建議。
>
> **全程零 AI、零門檻、零新的判定邏輯。**

### 2.2 Phase 1A 要做的（10 項）

| # | 交付項 | 類型 | 說明 |
|---|---|---|---|
| **A1** | `writing_error_findings` 表 + indexes | migration | `00` §3.1 的設計，**欄位微調見 §5** |
| **A2** | `writing_sync_error_findings(p_essay_id)` | migration | 物化單篇。冪等。**以最高 COMPLETED 版次為準** |
| **A3** | `writing_backfill_error_findings(p_limit)` | migration | 回填既有分析。分批、可重跑。**關鍵路徑，見 §9** |
| **A4** | `writing_admin_error_overview(scope)` | migration | **Common Errors**：scope 內每個 code 的 學生數／作文數／次數 |
| **A5** | `writing_admin_error_students(scope)` | migration | **Error → Students** |
| **A6** | `writing_admin_student_errors(scope)` | migration | **Student → Errors** |
| **A7** | `writing_admin_error_findings(scope, student, code)` | migration | **Drill-down**：代表性 findings（日期／quote／correction／reason） |
| **A8** | `writing_admin_queue()` 多回傳 `error_codes TEXT[]` | migration | 讓既有 Essay view 也能用錯誤篩選。**+1 欄，其餘零改動** |
| **A9** | `api/analyze-writing.ts` 標記 COMPLETED 後呼叫 A2 | 程式 | **約 +6 行** |
| **A10** | `/admin/writing` UI：分頁 + 共用 filter bar + 錯誤追蹤雙向檢視 + drill-down | 程式 | 見 §8 |

每一支 migration 都要有對應的 `.rollback.sql`，以及 `supabase/tests/` 下的測試。

### 2.3 Phase 1A **不**做的

- ❌ `student_writing_error_profiles` 表
- ❌ `writing_error_alerts` 表
- ❌ `REPEATED` / `PERSISTENT` / `IMPROVING` / `NEW` 任何狀態判定
- ❌ `confidence` 欄位的判定邏輯
- ❌ weekly cron scan
- ❌ Web Push
- ❌ 任何 AI 呼叫、任何新的 prompt、任何成本估算
- ❌ 「提醒」分頁的內容（分頁框架可以先放，裡面顯示「尚未啟用」）

### 2.4 為什麼這個切法是安全的

1. **A1–A7 全部是新物件**，不動任何既有表或既有函式的行為
2. **A8 只在 `writing_admin_queue()` 多加一欄**，既有 30 欄與排序不變，舊前端不會壞
3. **A9 是唯一碰到既有流程的地方**，而且必須做成「失敗不影響分析結果」（見 §6.5）
4. findings 表隨時可以清空重建，資料來源 `error_analysis` JSONB 一個字都沒動
5. 整個 Phase 1A **沒有任何一處會寫入或修改學生資料**

---

## 3. Phase 1B / Phase 2 延後項目

| 項目 | 階段 | 為什麼可以延後 | 延後的代價 |
|---|---|---|---|
| `student_writing_error_profiles` | 1B | Phase 1A 的三個 aggregation 都能直接從 findings 即時算 | 資料量大時查詢變慢（見 §10 風險 R3） |
| `REPEATED` / `PERSISTENT` 判定 | 1B | 老師現在要的是「查得到」，不是「被判定」 | 無。它本來就只是額外標記 |
| `writing_error_alerts` | 1B | 沒有判定就沒有 alert | 無 |
| weekly cron scan | 1B | 沒有 profiles 要重算 | 無 |
| Web Push | 1B | 沒有 alert 要推 | 無 |
| AI cross-essay digest | 2 | Phase 1A 的三個數字全是 deterministic，AI 沒有位置 | 無 |
| `writing_error_digest_cost_estimate()` | 2 | 沒有 AI 就沒有成本 | 無 |
| `IMPROVING` 狀態 | 2（或永不） | 語意風險最高，且要 §F 正規化定案 | 無 |
| errors-per-100-words 為主的呈現 | 1B | D4 決定 raw 為主、rate 為輔 | 無。word count 在 1A 就已入庫 |

### 延後但「現在就要預留」的三件事

| 預留什麼 | 在哪裡預留 | 為什麼現在做 |
|---|---|---|
| `essay_word_count` 快照 | `writing_error_findings` 欄位 | 1B 要算 rate，事後補會需要重新回填 |
| `is_fallback_code` GENERATED 欄位 | 同上 | 1B 要排除 GRAMMAR_OTHER，1A 要用來標記低訊號 |
| 「提醒」分頁的路由與空狀態 | UI | 讓老師知道之後會有，避免 1B 上線時介面又大改 |

---

## 4. D1–D7 重新分類

> **結論：D1–D7 沒有任何一項是 Phase 1A 的 blocker。** 可以立刻動工。

| # | 決定 | 是 1A blocker？ | 理由 / 本次採用 |
|---|---|---|---|
| **D1** | `MIN_ESSAYS` | ❌ **完全不影響** | Error Finder **一次出現即可查到**。1A 的查詢裡根本沒有這個門檻。留給 1B 的 `PERSISTENT` 判定 |
| **D2** | `recent_window_size` | ❌ 不影響 | 1A 用的是老師選的時間 filter（今日／7 天／30 天／全部），不是「最近 N 篇」。「最近 N 篇」是 cross-essay intelligence 才需要的概念 |
| **D3** | `PERSISTENT` 門檻 | ❌ 不影響 | 1A 沒有 `PERSISTENT`。**而且 1A 上線後就有真實資料可以 dry-run**，決定 D3 反而變容易 |
| **D4** | raw vs rate 正規化 | ❌ 不影響 | ✅ **2026-09-21 收斂**：**只用 raw count，不做 rate、不做最短字數門檻**。見 §4.1 |
| **D5** | class 語意 | ✅ **已決定並已實作** | **S1 = 目前在籍**。PR #128 已於 2026-09-20 套用到 production。新的 RPC 從第一行就帶 `m.left_at IS NULL` |
| **D6** | alert 冷卻期 | ❌ 不影響 | 1A 沒有 alert |
| **D7** | `IMPROVING` | ❌ 不影響 | 1A 不啟用。維持「先不要」 |

### 4.1 D4 定案：不做 rate 正規化

**決定（2026-09-21，依 production 真實資料）：Phase 1A 與 1B 都只用 raw count。**
不顯示 errors per 100 words，不設最短字數門檻，不因長度調整任何排序。

**理由（產品面，由使用者拍板）：**

> 老師知道學生在寫什麼。這個功能的側重點是**找出學生的錯誤**，不是找出誰的比例高。
> 而且學生有時候會交出很短或暴長的東西，這些都是已知且可以接受的現況。

**理由（資料面）：** production 45 篇的長度分層顯示，rate 的差異遠小於預期：

| 作文長度 | 作文數 | findings | 每百字錯誤數 |
|---|---|---|---|
| 少於 80 字 | 12 | 72 | 11.4 |
| 80–119 字 | 4 | 34 | **8.6** |
| 120–199 字 | 7 | 94 | **8.5** |
| 200 字以上 | 14 | 220 | 4.6 |

中間兩段幾乎相同（8.6 / 8.5）。我原本擔心「短文會灌爆排行榜」，
但那個擔憂建立在一個**這個功能根本不做的東西**（排行榜）之上。

**仍然保留的：** `essay_word_count` 欄位照常快照。它已經在表裡、成本是零，
之後若真的需要再拿出來用，不必重新回填。**存著，但不呈現。**

🛑 **這一條取代先前所有關於「rate 為輔」「要擋掉極短作文」的敘述。**

---

### 新增一項需要決定，但不阻塞

| # | 決定 | 選項 | 建議 |
|---|---|---|---|
| **D8** | 「依學生查看」時，Error multiselect 的語意 | **S-a** 選了 ARTICLE → 只列出每位學生的 ARTICLE 那一列<br>**S-b** 選了 ARTICLE → 列出**犯過 ARTICLE 的學生**，但每位仍顯示他**全部**的 error code，選中的加標記 | ✅ **已採用 S-b**（2026-09-20 確認） |

**為什麼建議 S-b**：老師的核心需求是「**不要漏掉某個學生曾經犯過哪些值得 follow-up 的錯**」。
S-a 會把老師剛剛特地打開的那份完整清單又砍掉，等於自己打自己。
S-b 讓 multiselect 扮演「挑出哪些學生」的角色，而「這位學生犯過什麼」永遠完整。

這是**一個 `WHERE` 條件的位置差異**（放在 student 子查詢裡 vs 放在外層），
真的要改成 S-a 也只是把條件往外搬，不影響任何 schema。所以不阻塞。

---

## 5. 資料層：Phase 1A 只需要一張表

### 5.1 `writing_error_findings` —— 相對 `00` §3.1 的調整

保留 `00` §3.1 的全部欄位，**增加兩欄、修正一個判準**：

| 欄位 | 變更 | 理由 |
|---|---|---|
| `finding_index` | ➕ **新增**（INTEGER NOT NULL） | 該 finding 在 `error_analysis -> 'findings'` 陣列裡的序號。同時是去重鍵與原始順序，見 §9 |
| `essay_topic` | ➕ **新增**（TEXT，快照） | 題目是 1A 的四個 filter 之一。不快照的話每個 aggregation 都要 join 回 `writing_submissions`，而 `essay_topic` 是自由文字、沒有索引 |
| `class_ids` | ❌ **不加** | 班級語意採 S1（目前在籍），**必須即時 join**。快照會凍結在物化當下，與 S1 矛盾 |
| `is_latest` | ❌ **不加** | 表裡只放有效版次的 findings，不需要旗標。這也繞開了約束 1 |

> `essay_topic` 的取捨：作文送出後題目實務上不會變，快照是安全的。
> 萬一真的被改，findings 會停在舊題目 —— 重跑 `writing_backfill_error_findings()` 即可修正，
> 這正是「findings 可重建」這個原則存在的價值。

### 5.2 Indexes —— 對應 1A 的三個查詢形狀

```sql
-- ① Error → Students：先卡 code，再卡時間
(error_code, essay_submitted_at DESC, student_id)

-- ② Student → Errors：先卡學生，再卡時間
(student_id, essay_submitted_at DESC, error_code)

-- ③ Common Errors：與 ① 同一支索引即可（GROUP BY error_code）

-- ④ 重新物化時的 DELETE
(essay_id)

-- ⑤ 題目篩選（選用，資料量大再加）
(essay_topic, essay_submitted_at DESC)

-- ⑥ 每個 finding 的身分（見 §9「動工前還剩最後一件事」）
UNIQUE (essay_id, finding_index)
```

> ⚠️ UNIQUE 相對 `00` §3.1 **改了兩次**，最終是 `(essay_id, finding_index)`：
>
> 1. 先拿掉 `analysis_id` —— 表裡永遠只有「該篇目前有效分析」的 findings，
>    同一篇不會同時存在兩個版次的列；把 `analysis_id` 放進去反而會讓
>    「舊版次沒刪乾淨」這種 bug 靜默通過。`analysis_id` 保留為一般欄位（稽核用）。
> 2. 再把 `(error_code, quote, correction)` 換成 `finding_index`（JSONB 陣列的序號）——
>    同一篇裡兩個一模一樣的 finding 是**合法的**（同一個字錯兩次），
>    用內容當鍵會把它吃掉一個，而**計數正是這個功能的全部意義**。
>    冪等本來就由交易內的 DELETE → INSERT 保證，不需要 UNIQUE 來達成。
>    理由與驗證查詢見 §9。

### 5.3 為什麼 1A 不需要 profiles 表

Phase 1A 的三個 aggregation 都是**單表 GROUP BY**：

| 查詢 | 形狀 | 成本 |
|---|---|---|
| Common Errors | `GROUP BY error_code` | 掃描 scope 內的 findings 一次 |
| Error → Students | `GROUP BY student_id` | 同上 |
| Student → Errors | `GROUP BY student_id, error_code` | 同上 |

在目前的資料量（見 §9 待確認）下，這是毫秒級的查詢。
profiles 表存在的理由是「最近 N 篇中至少 M 篇」這種**需要先取子集再判斷**的查詢 ——
那是 1B 的事。**1A 提早建 profiles 表，等於為一個還沒有的需求維護一份會不同步的快取。**

---

## 6. 三個 aggregation + 一個 drill-down

### 6.0 共用的 scope 契約

四支 RPC 吃**完全相同的四個參數**，這是「三個數字對得起來」的唯一保證：

```sql
p_class_id     UUID    DEFAULT NULL   -- NULL = 全部班級
p_from         TIMESTAMPTZ DEFAULT NULL   -- NULL = 不限起
p_to           TIMESTAMPTZ DEFAULT NULL   -- NULL = 不限迄
p_topic        TEXT    DEFAULT NULL   -- NULL = 全部題目
p_error_codes  TEXT[]  DEFAULT NULL   -- NULL 或空陣列 = 全部錯誤
```

共用的 scope 述詞（四支一字不差地重複，或抽成一個 inline-able 的 SQL 函式）：

```sql
WHERE (p_error_codes IS NULL OR cardinality(p_error_codes) = 0
       OR f.error_code = ANY (p_error_codes))
  AND (p_from  IS NULL OR f.essay_submitted_at >= p_from)
  AND (p_to    IS NULL OR f.essay_submitted_at <  p_to)
  AND (p_topic IS NULL OR f.essay_topic = p_topic)
  AND (p_class_id IS NULL OR EXISTS (
        SELECT 1 FROM public.learn_class_members m
         WHERE m.student_id = f.student_id
           AND m.class_id   = p_class_id
           AND m.left_at IS NULL          -- ★ S1：目前在籍（D5 已決定）
      ))
```

🛑 **四支都必須 `LIMIT`**，而且是**在 SQL 裡 limit，不是前端切**。
`writing_admin_queue()` 沒有分頁已經是既有的技術債（`03` §15 有記），新函式不要重蹈覆轍。

### 6.1 Common Errors —— `writing_admin_error_overview(scope)`

**老師的問題**：「這個班最多人犯什麼？下一堂課要統一講什麼？」

```
WRITE_ERR_ARTICLE        未加冠詞      8 位學生 / 13 篇作文 / 21 次
WRITE_ERR_SV_AGREEMENT   主詞動詞一致  6 位學生 /  8 篇作文 / 11 次
WRITE_ERR_CHINGLISH      中式英文      5 位學生 /  7 篇作文 /  9 次
WRITE_ERR_GRAMMAR_OTHER  其他文法      7 位學生 / 12 篇作文 / 18 次   ⚠️ 低訊號
```

```sql
SELECT f.error_code,
       count(DISTINCT f.student_id)::int AS student_count,
       count(DISTINCT f.essay_id)::int   AS essay_count,
       count(*)::int                     AS occurrence_count,
       bool_or(f.is_fallback_code)       AS is_fallback_code,
       -- D4：rate 作為輔助欄位一起回傳，UI 決定要不要顯示
       round(count(*)::numeric * 100
             / nullif(sum(DISTINCT_word_count), 0), 2) AS per_100_words
  FROM public.writing_error_findings f
 WHERE <scope>
 GROUP BY f.error_code
 ORDER BY student_count DESC, occurrence_count DESC
```

⚠️ **`per_100_words` 的分母有一個陷阱**：不能用 `sum(f.essay_word_count)`，
因為同一篇作文有 N 個 finding 就會被加 N 次。分母必須是 **scope 內 distinct essay 的字數和**，
要用另一個子查詢取得。這個錯誤很容易寫出來而且不會報錯，只會讓數字默默偏小。
1A 既然以 raw 為主，**建議第一版先不回傳 `per_100_words`**，等 1B 一起做對。

**排序用 `student_count` 而不是 `occurrence_count`**：老師要的是「多少人需要聽這堂課」，
不是「總共錯了幾次」。一個學生錯 20 次不構成全班講解的理由。

**`WRITE_ERR_GRAMMAR_OTHER` 照常列出但標記**。約束 3 說的是「不作高可信度 alert」，
1A 沒有 alert；而老師「不要漏掉」的需求要求它必須看得到。用 `is_fallback_code` 在 UI 加一個
「這一類混了多種錯誤，建議點開看實際例句」的提示。**不要隱藏它。**

### 6.2 Error → Students —— `writing_admin_error_students(scope)`

**老師的問題**：「誰犯過 Article error？」

```
Amy    高二A       3 篇作文出現 · 共 7 次   最近：2026-09-18
Brian  高二A       1 篇作文出現 · 共 2 次   最近：2026-09-11
Cindy  高二A、週六班 2 篇作文出現 · 共 3 次   最近：2026-09-04
```

```sql
SELECT f.student_id,
       public.learn_display_name(f.student_id) AS student_name,
       count(DISTINCT f.essay_id)::int AS essay_count,
       count(*)::int                   AS occurrence_count,
       max(f.essay_submitted_at)       AS last_seen_at,
       min(f.essay_submitted_at)       AS first_seen_at,
       array_agg(DISTINCT f.error_code ORDER BY f.error_code) AS matched_codes
  FROM public.writing_error_findings f
 WHERE <scope>
 GROUP BY f.student_id
 ORDER BY occurrence_count DESC, last_seen_at DESC
 LIMIT p_limit
```

🔴 **「一次出現也要列」是靠「沒有 HAVING 子句」達成的。**
這一句要寫進函式註解，否則之後很容易有人「順手」加一個 `HAVING count(*) >= 2` 來「降噪」，
而那正好會砍掉老師最在意的那種案例。測試要明確守住這一點。

`matched_codes` 是為了選了多個 code 時，老師能看出這位學生中的是哪幾個。

### 6.3 Student → Errors —— `writing_admin_student_errors(scope)`

**老師的問題**：「Amy 到目前為止犯過哪些錯？」

```
Amy
  WRITE_ERR_ARTICLE         未加冠詞       3 篇 / 7 次
  WRITE_ERR_SV_AGREEMENT    主詞動詞一致    2 篇 / 3 次
  WRITE_ERR_CHINGLISH       中式英文       1 篇 / 2 次
  WRITE_ERR_PUNCTUATION     標點           1 篇 / 1 次     ← 只有一次，一樣要列
```

採 **D8 = S-b**：先用 scope（含 error multiselect）決定**哪些學生入列**，
再對這些學生列出他們在 scope 的時間／題目／班級範圍內的**全部** error code。

```sql
WITH in_scope_students AS (
  SELECT DISTINCT f.student_id
    FROM public.writing_error_findings f
   WHERE <scope 全部五項，含 error_codes>
   LIMIT p_student_limit
)
SELECT f.student_id,
       public.learn_display_name(f.student_id) AS student_name,
       f.error_code,
       count(DISTINCT f.essay_id)::int AS essay_count,
       count(*)::int                   AS occurrence_count,
       max(f.essay_submitted_at)       AS last_seen_at,
       f.is_fallback_code,
       -- 這個 code 是不是老師這次選的
       (p_error_codes IS NOT NULL
        AND cardinality(p_error_codes) > 0
        AND f.error_code = ANY (p_error_codes)) AS is_selected
  FROM public.writing_error_findings f
  JOIN in_scope_students s ON s.student_id = f.student_id
 WHERE <scope 但【排除】error_codes 條件>     -- ★ S-b 的關鍵
 GROUP BY f.student_id, f.error_code, f.is_fallback_code
 ORDER BY f.student_id, occurrence_count DESC
```

> ★ 內層帶 `error_codes`（決定誰入列），外層不帶（決定顯示什麼）。
> 要改成 D8 = S-a，就是把 `error_codes` 條件也加進外層 —— **一行的差別**。

🔴 同樣**沒有 `HAVING`**。`WRITE_ERR_PUNCTUATION 1 篇 / 1 次` 必須出現。

### 6.4 Drill-down —— `writing_admin_error_findings(scope, p_student_id, p_error_code)`

**老師的問題**：「Amy 的 Article error 實際上是怎麼錯的？」

```
2026-09-18  〈My Summer Vacation〉
  原文：I went to park with my friend.
  修正：I went to the park with my friend.
  說明：可數名詞單數前需要冠詞；此處特指雙方都知道的公園，用 the。

2026-09-11  〈A Letter to My Future Self〉
  原文：She is best student in class.
  修正：She is the best student in the class.
  說明：最高級前面必須加 the。
```

```sql
SELECT f.id, f.essay_id, f.essay_submitted_at, f.essay_topic,
       f.quote, f.correction, f.reason, f.primary_skill,
       f.error_code, f.is_fallback_code
  FROM public.writing_error_findings f
 WHERE <scope>
   AND f.student_id = p_student_id
   AND (p_error_code IS NULL OR f.error_code = p_error_code)
 ORDER BY f.essay_submitted_at DESC, f.id
 LIMIT p_limit          -- 建議預設 20
```

- `essay_id` 一起回傳，UI 可以連到既有的單篇分析報告
- **不做「代表性挑選」**。`02` §H 的 deterministic 選樣規則是為了餵 AI digest 而設計的，
  1A 沒有 AI，老師要看的是**全部**（按時間排序、可捲動），不是被挑過的三則

### 6.5 寫入路徑 —— `writing_sync_error_findings(p_analysis_id)`

**簽名改用 `p_analysis_id`**（原本寫 `p_essay_id`）。理由是實際的呼叫點：
`api/analyze-writing.ts` 的 `performSynthesis()` 只拿得到 `analysisId`，
`ctx.essayId` 不在那個函式的作用域裡（`RunContext` 沒有傳進去）。
改成收 `analysis_id` 並由函式內部解析出 `essay_id`，呼叫點就是一行，不必多一次來回查詢。

這不影響正確性：函式拿到 `analysis_id` 之後，**仍然是回頭找「該 essay 最高的 COMPLETED 版次」**，
而不是直接用傳進來的那一版。所以就算呼叫端傳了一個過時的 analysis_id，結果一樣正確。

```
輸入：analysis_id

1. 由 analysis_id 解析出 essay_id
2. 找出該 essay 最高的 COMPLETED analysis_version
     沒有 → DELETE 該 essay 的 findings，return（這篇目前沒有有效分析）
3. 解析該分析的 error_analysis JSONB
4. 交易內：DELETE 該 essay 既有 findings → INSERT 新的
5. 回傳 (essay_id, deleted, inserted) 供稽核

冪等：同樣輸入跑兩次，結果與跑一次相同
```

回填用的是內部變體 `writing_sync_error_findings_for_essay(p_essay_id)`，兩者共用同一段邏輯。

---

### 🔴 6.5.1 A9 的錯誤處理 —— 原本的寫法是無效的

**先前這份文件在這裡寫的程式碼是錯的**，而且錯得很危險。原本寫的是：

```ts
// ❌ 錯誤示範：這個 catch 永遠不會被觸發
try {
  await supabase.rpc('writing_sync_error_findings', { p_essay_id: essayId });
} catch (err) {
  console.error('...', err);
}
```

`supabase.rpc()` **不會 throw**，它回傳 `{ data, error }`。上面那段 `catch` 捕捉不到任何東西，
等於把所有同步失敗**靜默吞掉** —— 正好是最不該發生的那種失敗模式。

#### 查證結果（不是推測）

| 查的東西 | 結果 |
|---|---|
| `@supabase/supabase-js` / `@supabase/postgrest-js` 版本 | 都是 **2.90.1** |
| 這個 repo 有沒有用 `.throwOnError()` | **沒有**，所以 `shouldThrowOnError = false` |
| PostgreSQL 層的錯誤（例如 RPC RAISE EXCEPTION） | 回 `{ error }`，**不 throw** |
| 傳輸層失敗（fetch 掛掉、網路斷線） | `postgrest-js/dist/index.cjs:154` 的 `res.catch((fetchError) => ...)` **把它攔下來轉成 `{ error }`**，一樣**不 throw** |
| 既有程式碼的既定樣板 | `api/analyze-writing.ts:129-131`、`:135-136` 都是 `const { error } = await ...; if (error) ...` |

➡️ **`if (error)` 是唯一有效的機制，而且它同時涵蓋資料庫錯誤與網路錯誤。**

#### 正確的寫法

呼叫點：`api/analyze-writing.ts`，在 `status: "COMPLETED"` 更新成功之後、
`return { ok: true, ... }` 之前（目前是 `:873-882`）。

```ts
// findings 是 error_analysis 的物化視圖，不是真相本身。
// 分析結果此刻已經落地，同步失敗不該讓一次成功（而且已經花過錢）的分析被判定為失敗。
// 但也【絕對不能默默吞掉】—— 吞掉的話 findings 會缺資料，而且沒有人會知道。
const { error: syncError } = await admin.rpc("writing_sync_error_findings", {
  p_analysis_id: analysisId,
});

if (syncError) {
  // 用 console.error（不是 warn）：這是需要有人處理的狀況，只是不必當場失敗。
  // analysisId 一定要帶，否則事後無法用 backfill 針對性地補。
  console.error("[analyze-writing] findings 同步失敗，分析本身已完成，請用 backfill 補:", {
    analysisId,
    code: syncError.code,
    message: syncError.message,
    details: syncError.details,
    hint: syncError.hint,
  });
}
```

#### 三條硬性要求（測試要守住）

| # | 要求 | 怎麼驗 |
|---|---|---|
| **E1** | 同步失敗**不改變** `performSynthesis` 的回傳值 | 讓 RPC 拋錯，斷言仍然回 `{ ok: true }`、`writing_analyses.status` 仍是 `COMPLETED` |
| **E2** | 同步失敗**一定留下含 `analysisId` 的 `console.error`** | spy `console.error`，斷言被呼叫且內容含 analysisId |
| **E3** | **不得靜默忽略** —— 沒有 `if (error)` 就不算完成 | code review 檢查項；`await admin.rpc(...)` 後面沒有接 `if (error)` 一律退回 |

> ⚠️ `try/catch` 可以留著當最外層防護（例如 client 本身被設定壞掉這種非 postgrest 路徑的例外），
> 但它**不能是唯一的機制**，也不能取代 `if (error)`。單獨的 try/catch 等於沒有處理。

---

## 7. 共用 filter bar

### 7.1 四個 filter，兩個分頁共用

| Filter | 元件 | 值 | 備註 |
|---|---|---|---|
| 班級 | `Select` | `class_id` UUID | ⚠️ 見 7.2 |
| 時間 | `Select` | `ALL` / `TODAY` / `7D` / `30D` | 沿用既有 `TimeFilter` 型別與 `TIME_LABEL` |
| 題目 | `Select` | `essay_topic` 字串 | |
| 錯誤 | **Multiselect**（新元件） | `TEXT[]` | `ui/command` + `ui/popover`，label 一律走 `ERROR_TAG_BY_CODE` |

「作文」分頁**額外保留**既有的 `stateFilter`（分析狀態）與 `reviewFilter`（檢閱狀態）。
「錯誤追蹤」分頁**不顯示這兩個** —— findings 只可能來自 `COMPLETED` 的分析，這兩個 filter 在那裡沒有意義。

### 7.2 ⚠️ 班級 filter 要從「名稱」改成「id」

目前 `WritingGrading.tsx:96` 的 `classFilter` 存的是**班級名稱字串**，
選項由已載入的 `row.class_names` 推導（`:108`）。這在前端純過濾時可行，
但新的 RPC 要在**資料庫端**過濾，必須拿到 `class_id`。

➡️ 改用既有的 `learn_admin_classes()` / `useAdminClasses` hook 取得 `(id, name)` 清單。
**這兩個都已經存在**，不是新東西。

這個改動會連帶讓既有 Essay view 的班級 filter 也改成 id 比對 —— 幅度小，但**是一個既有行為的改動**，
要納入測試範圍（尤其「一個學生多個班」的情況）。

### 7.3 filter 值放 URL query

```
/admin/writing?tab=errors&view=by-error&class=<uuid>&time=30D&topic=...&codes=WRITE_ERR_ARTICLE,WRITE_ERR_CHINGLISH
```

順便解掉既有的小毛病（重新整理就回到預設），也讓老師可以把「這個班這個錯」的連結貼給自己或同事。

---

## 8. `/admin/writing` UI 規劃

### 8.1 三個分頁

```
/admin/writing                    → tab=essays  「作文」    ← 預設，與現在幾乎一樣
/admin/writing?tab=errors         → tab=errors  「錯誤追蹤」 ← Phase 1A 的主戰場
/admin/writing?tab=alerts         → tab=alerts  「提醒」    ← 1A 只放空狀態
```

用既有的 `@/components/ui/tabs`。

### 8.2 「作文」分頁的改動（最小）

| 改什麼 | 幅度 |
|---|---|
| filter bar 多一個「錯誤」multiselect | 共用元件，本頁只是多接一個 |
| `visible` 的 `useMemo` 多一個條件 | **3 行**：`if (codes.length && !codes.some(c => row.error_codes?.includes(c))) return false;` |
| 每列多一排 error badge | ~10 行，label 走 `ERROR_TAG_BY_CODE` |
| 班級 filter 改用 id | 見 7.2 |
| 既有的勾選 / 批次 / 成本框 / 統計卡 | **零改動** |

`error_codes` 為 `NULL`（回填尚未完成）時，錯誤 filter 視為「沒有錯誤資料」而**不是**「沒有錯誤」——
這兩者在 UI 上要講清楚，否則老師會以為學生沒犯錯。

### 8.3 「錯誤追蹤」分頁 —— 同一頁內雙向切換

```
┌─ 共用 filter bar ─────────────────────────────────────────────┐
│  班級：高二A ▾   時間：最近30天 ▾   題目：全部 ▾                 │
│  錯誤：[未加冠詞 ×] [中式英文 ×]  ▾                             │
└──────────────────────────────────────────────────────────────┘

┌─ 常見錯誤（scope 內）── 可摺疊 ───────────────────────────────┐
│  未加冠詞        8 位學生 · 13 篇 · 21 次        [只看這個]     │
│  主詞動詞一致    6 位學生 ·  8 篇 · 11 次        [只看這個]     │
│  中式英文        5 位學生 ·  7 篇 ·  9 次        [只看這個]     │
│  其他文法 ⚠️     7 位學生 · 12 篇 · 18 次        [只看這個]     │
│    ⚠️ 這一類混了多種錯誤，建議點開看實際例句再決定怎麼處理        │
└──────────────────────────────────────────────────────────────┘

        ( ● 依錯誤查看    ○ 依學生查看 )     ← 同一頁切換，不換路由

┌─ ● 依錯誤查看：未加冠詞 ──────────────────────────────────────┐
│  Amy     高二A         3 篇 · 7 次    最近 2026-09-18    ▸     │
│  Brian   高二A         1 篇 · 2 次    最近 2026-09-11    ▸     │
│  Cindy   高二A、週六班  2 篇 · 3 次    最近 2026-09-04    ▸     │
└──────────────────────────────────────────────────────────────┘

┌─ ○ 依學生查看 ───────────────────────────────────────────────┐
│  Amy    高二A                                                 │
│    ● 未加冠詞        3 篇 / 7 次     最近 2026-09-18    ▸      │
│    ● 中式英文        1 篇 / 2 次     最近 2026-09-11    ▸      │
│      主詞動詞一致     2 篇 / 3 次     最近 2026-09-18    ▸      │
│      標點            1 篇 / 1 次     最近 2026-08-30    ▸      │
│  Brian  高二A                                                 │
│    ● 未加冠詞        1 篇 / 2 次     最近 2026-09-11    ▸      │
│      拼寫            1 篇 / 1 次     最近 2026-09-11    ▸      │
└──────────────────────────────────────────────────────────────┘
      ● = 老師這次選的錯誤（D8 = S-b：其餘照樣列出）
```

「常見錯誤」的 `[只看這個]` 直接把該 code 塞進 multiselect —— 老師從「全班統一講解」的視角
一鍵切到「這些人要個別跟進」，這是 §1 三個情境之間最常走的那條路。

### 8.4 展開 `▸` 看實際例句

用既有 `ui/accordion` **就地展開**，不換頁：

```
│  Amy   高二A    3 篇 · 7 次    最近 2026-09-18    ▾           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 2026-09-18 〈My Summer Vacation〉          [看完整報告] │  │
│  │   原文  I went to park with my friend.                 │  │
│  │   修正  I went to the park with my friend.             │  │
│  │   說明  可數名詞單數前需要冠詞…                          │  │
│  │ ─────────────────────────────────────────────────────  │  │
│  │ 2026-09-11 〈A Letter to My Future Self〉  [看完整報告] │  │
│  │   原文  She is best student in class.                  │  │
│  │   …                                                    │  │
│  └────────────────────────────────────────────────────────┘  │
```

`[看完整報告]` 連到既有的單篇分析頁 —— **不重建任何報告 UI**。

### 8.5 版型沿用

| 要什麼 | 用既有的什麼 |
|---|---|
| 清單 | Essay view 的 `divide-y` 列表 |
| 展開 | `ui/accordion` |
| 錯誤標籤 | 既有 badge tone + `ERROR_TAG_BY_CODE` 的中文 |
| 空狀態 | `gsat-ui-design` §5 的「理由 + 下一步」樣式 |
| 載入 | `Loader2` / `Skeleton` |
| 分頁 | `ui/tabs` |
| 切換檢視 | `ui/tabs` 或 `ui/toggle-group` |

🛑 **不新增任何顏色、字級、圓角、陰影。** 依 `gsat-ui-design` 的 prime directive。

### 8.6 三個空狀態要分清楚（很容易寫錯）

| 情況 | 訊息 |
|---|---|
| 回填還沒跑完 | 「錯誤資料尚在建立中，請稍後再看」 —— **不是**「沒有錯誤」 |
| scope 內沒有任何已完成分析 | 「這個範圍內還沒有已完成的作文分析」＋提示去「作文」分頁送分析 |
| scope 內有分析但真的沒有這些錯 | 「這個範圍內沒有出現選取的錯誤」 |

把這三種混成同一句「查無資料」，老師會做出錯誤判斷。

---

## 9. 🔴 回填是關鍵路徑

Phase 1A 的整個價值都建立在「findings 表裡有資料」。**回填沒跑完，功能等於不存在。**

### ✅ 2026-09-20 已量測（production）

| | |
|---|---|
| 分析總數 | **52** |
| 已完成（COMPLETED） | **44** |
| 有效作文數 | **44** |
| `writing_analyses` 表大小 | 3000 kB |
| `error_analysis` JSONB 總量 | 86 kB（壓縮後） |

**結論：回填不是風險。** 44 篇作文、86 kB JSONB，一批就跑得完，秒級。
原本列為 R1 的「回填量體未知」**解除**；§9 的分批、續跑機制仍然要做（正確性與可重跑性），
但不再需要為了效能而分批，也不需要挑低峰時段。

R3（即時 GROUP BY 變慢）同樣解除：44 篇作文的 findings 量級在數百列，
單表 GROUP BY 是微秒級。**這再次確認 Phase 1A 不需要 profiles 快取表。**

⚠️ 兩點要注意：
- `sum(pg_column_size(...))` 回的是**壓縮後**的大小，實際 JSON 文字會大數倍。但即使 5 倍也只有 400 kB。
- 52 − 44 = **8 筆非 COMPLETED 的分析**。這 8 筆是什麼狀態、有沒有「較新的 FAILED 蓋過較舊的 COMPLETED」，
  直接決定 §0 那個修正是不是真的有用。見下方「動工前還要確認的兩件事」。

### ✅ 2026-09-20 續測結果

**查詢 ①：8 筆非 COMPLETED 全部是 `FAILED`，其中「蓋過較舊成功版」= 0。**

代表目前**還沒有**「較新的 FAILED 蓋過較舊的 COMPLETED」的情況 —— 那 8 筆應該都是
「先失敗、重跑才成功」（FAILED 版次比 COMPLETED 低）。

➡️ §0 的修正因此是**預防性的，不是正在救火**。但仍然必須保留：
只要有人對一篇已完成的作文按重跑而那次失敗，這個情況立刻就會發生，
而當下的症狀是「這篇作文的錯誤紀錄整批消失」—— 沒有人會馬上發現。

**查詢 ②：JSONB 形狀完全乾淨，回填規模 420 列。**

| | |
|---|---|
| 有效作文數 | 44 |
| **預估 findings 列數** | **420** |
| 至少一個錯的作文 | 37 |
| 零錯誤作文 | 7 |
| 🔴 形狀異常作文數 | **0** ✅ |
| 🔴 欄位不齊全的 findings | **0** ✅ |
| 出現過的 code 種類 | **17 / 17（全中）** |
| `WRITE_ERR_GRAMMAR_OTHER` | 46 筆 |

**R2（JSONB 形狀與 `analysisContract.ts` 有出入）解除。** 44 篇的
`error_analysis -> 'findings'` 全部是陣列，420 個 finding 全部有
`quote` / `reason` / `correction` / `primary_skill`。A1 可以安心把這四欄設成 `NOT NULL`。

**CHECK 約束的 17 個 code 也已逐一比對過**：production 實際出現的 17 個
與 `api/_lib/taxonomy.ts` 的 `ERROR_TAGS` **完全一致，沒有任何一邊多出或少掉**。

### 實際分布（回填後「常見錯誤」會長這樣）

| error_code | 作文數 | findings | 每篇 |
|---|---|---|---|
| `WRITE_ERR_ARTICLE` | 32 (73%) | 78 | 2.44 |
| `WRITE_ERR_PUNCTUATION` | 26 (59%) | 49 | 1.88 |
| `WRITE_ERR_NUMBER` | 22 (50%) | 38 | 1.73 |
| `WRITE_ERR_RUN_ON` | 22 (50%) | 36 | 1.64 |
| `WRITE_ERR_WORD_CLASS` | 20 | 26 | 1.30 |
| ⚠️ `WRITE_ERR_GRAMMAR_OTHER` | 19 | **46** | **2.42** |
| `WRITE_ERR_SV_AGREEMENT` | 18 | 33 | 1.83 |
| `WRITE_ERR_SPELLING` | 13 | 29 | 2.23 |
| `WRITE_ERR_FRAGMENT` | 13 | 22 | 1.69 |
| `WRITE_ERR_CHINGLISH` | 12 | 26 | 2.17 |
| `WRITE_ERR_PRONOUN` | 7 | 9 | 1.29 |
| `WRITE_ERR_PREP_CLAUSE` | 6 | 7 | 1.17 |
| `WRITE_ERR_TRANSITIVITY` | 5 | 7 | 1.40 |
| `WRITE_ERR_WORD_BOUNDARY` | 5 | 7 | 1.40 |
| `WRITE_ERR_THAT` | 3 | 3 | 1.00 |
| `WRITE_ERR_COUNTABILITY` | 3 | 3 | 1.00 |
| `WRITE_ERR_DISCOURSE_STRUCTURE` | **1** | **1** | 1.00 |

三個由這份分布直接證實的設計判斷：

1. **「一次出現也要列」不是理論上的貼心，是這份資料的下半部。**
   `DISCOURSE_STRUCTURE` 只有 1 篇 1 次，`THAT` 與 `COUNTABILITY` 各 3 篇 3 次。
   任何形式的 `MIN_ESSAYS` 或 `HAVING count(*) >= 2` **會直接讓最後三個 code 從系統裡消失**。
   這正是 §6.2 / §6.3「刻意沒有 HAVING」要守住的東西。

2. **`GRAMMAR_OTHER` 的問題比先前量到的更值得處理。**
   46 / 420 = **全部錯誤訊號的 11%**，findings 數排第 6，比 `SV_AGREEMENT`(33)、
   `SPELLING`(29)、`CHINGLISH`(26) 都高；而且每篇 2.42 的密度是全部 code 裡第二高
   （僅次於 ARTICLE 的 2.44）—— **它一旦出現就大量出現**，符合「傾倒場」的特徵。
   §S2 的「標記但不隱藏」照原案執行。

3. **排序用「作文數」而非「findings 數」是對的。**
   若照 findings 排，`GRAMMAR_OTHER`(46) 會排在 `WORD_CLASS`(26) 前面，
   老師會以為「其他文法」是全班第 5 該講的主題 —— 但它根本不是一個可以講解的主題。
   照作文數排，它落到第 6，且與前面幾名拉開距離。

### 🔴 動工前還剩最後一件事要確認（唯讀）

`00` §3.1 原本設計的 `UNIQUE (essay_id, analysis_id, error_code, quote, correction)`
（§5.2 已改為去掉 `analysis_id`）**可能會讓回填直接失敗**。

一篇作文裡同一個 code 出現兩次、而且 `quote` 與 `correction` 剛好相同，是**完全合理**的：
同一個字在文章裡出現兩次、都漏了冠詞，AI 很可能吐出兩個一模一樣的 finding。
那是**兩個真實的錯誤**，不是重複。

```sql
-- 實際有沒有「同一篇 + 同 code + 同 quote + 同 correction」出現一次以上？
WITH latest AS (
  SELECT DISTINCT ON (a.essay_id) a.essay_id, a.error_analysis
    FROM writing_analyses a WHERE a.status = 'COMPLETED'
   ORDER BY a.essay_id, a.analysis_version DESC),
ex AS (
  SELECT l.essay_id, f ->> 'code' AS code, f ->> 'quote' AS quote,
         f ->> 'correction' AS correction
    FROM latest l
    CROSS JOIN LATERAL jsonb_array_elements(l.error_analysis -> 'findings') f)
SELECT count(*)::int                             AS "重複組合數",
       coalesce(sum(n) - count(*), 0)::int       AS "會被UNIQUE吃掉的findings數"
  FROM (SELECT essay_id, code, quote, correction, count(*) AS n
          FROM ex GROUP BY 1,2,3,4 HAVING count(*) > 1) d;
```

| 結果 | 意思 | 怎麼做 |
|---|---|---|
| 兩欄都是 **0** | 目前沒有重複，UNIQUE 不會擋到回填 | 仍建議改用下面的 `finding_index` 方案 —— 現在沒有不代表以後沒有 |
| **> 0** | UNIQUE **會讓回填失敗**，或（若用 `ON CONFLICT DO NOTHING`）**默默少算** | 必須改用 `finding_index` 方案 |

#### 建議：拿掉 UNIQUE，改用 `finding_index`

| | 原方案 | 建議方案 |
|---|---|---|
| 去重鍵 | `UNIQUE (essay_id, error_code, quote, correction)` | `UNIQUE (essay_id, finding_index)` |
| 冪等靠什麼 | UNIQUE | **本來就靠交易內的 DELETE → INSERT**，UNIQUE 從來不是必要的 |
| 同一篇兩個相同 finding | ❌ 被吃掉一個，**計數變少** | ✅ 兩列都在，索引 0 與 5 |
| 額外好處 | — | 保留 JSONB 陣列的原始順序，drill-down 可以照原文順序呈現 |

`finding_index` 就是 `jsonb_array_elements` 的序號（`WITH ORDINALITY`）。
**計數是這個功能的全部意義**，用一個會丟掉合法重複的約束去換「防重複插入」並不划算 ——
何況防重複插入這件事，DELETE-then-INSERT 已經做到了。

### 原本的量體查詢（已執行，保留紀錄）

```sql
-- ① 那 8 筆非 COMPLETED 是什麼？有沒有「新的失敗版蓋過舊的成功版」？
SELECT a.status,
       count(*)::int AS 筆數,
       count(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM writing_analyses b
            WHERE b.essay_id = a.essay_id
              AND b.status = 'COMPLETED'
              AND b.analysis_version < a.analysis_version))::int
         AS 蓋過較舊成功版的筆數
  FROM writing_analyses a
 WHERE a.status <> 'COMPLETED'
 GROUP BY a.status
 ORDER BY 2 DESC;
```
「蓋過較舊成功版的筆數 > 0」→ §0 的修正**現在就在保護真實資料**，不是理論問題。

```sql
-- ② 回填之後 findings 表會有幾列？（決定 UNIQUE 與索引的實際壓力）
SELECT count(*)::int                        AS 預估findings列數,
       count(DISTINCT a.essay_id)::int      AS 涵蓋作文數,
       count(DISTINCT f ->> 'code')::int    AS 出現過的error_code種類,
       round(avg(cnt), 1)                   AS 每篇平均findings
  FROM writing_analyses a
  CROSS JOIN LATERAL jsonb_array_elements(a.error_analysis -> 'findings') f
  CROSS JOIN LATERAL (
    SELECT jsonb_array_length(a.error_analysis -> 'findings') AS cnt) c
 WHERE a.status = 'COMPLETED';
```
⚠️ 這一支的 `error_analysis -> 'findings'` 路徑**要先確認與 `analysisContract.ts` 一致**；
若回報 `cannot extract elements from a scalar` 之類的錯誤，代表實際 JSONB 形狀與預期不同 ——
那正是 R2 要防的，也正是應該在寫 A3 之前知道的事。

### 原本的量體查詢（已執行，保留紀錄）

```sql
SELECT count(*)                                                    AS 分析總數,
       count(*) FILTER (WHERE status = 'COMPLETED')                AS 已完成,
       count(DISTINCT essay_id) FILTER (WHERE status = 'COMPLETED') AS 有效作文數,
       pg_size_pretty(pg_total_relation_size('writing_analyses'))   AS 表大小,
       pg_size_pretty(sum(pg_column_size(error_analysis)))          AS JSONB總量
  FROM writing_analyses;
```

這個數字決定回填要分幾批、要不要在低峰時段跑。

### 回填的設計要求

1. **分批**，建議每批 200 篇作文，`p_limit` 可調
2. **可重跑**：以 essay 為單位，重跑同一篇結果相同（靠 A2 的冪等性）
3. **可中斷續跑**：每批結束就 commit，不是一個巨大交易
4. **進度可查**：回傳 `(processed, inserted, skipped, remaining)`
5. **先在 staging 跑一次**測量實際耗時，再決定 production 的批次大小

### 回填期間的 UI 行為

回填是漸進的，所以「錯誤追蹤」分頁在回填完成前會顯示不完整的資料。
兩個選擇：

| 選項 | 做法 | 評價 |
|---|---|---|
| **O1** | 回填完成前，整個分頁顯示「資料建立中」 | 誠實，但老師等不到 |
| **O2** | 直接顯示，但頂部橫幅標明「已處理 N / M 篇，數字尚未完整」 | **建議** |

O2 配合 8.6 的第一種空狀態訊息，老師隨時知道自己看到的是不是全貌。

---

## 10. 風險與未決

### 技術風險

| # | 風險 | 影響 | 緩解 |
|---|---|---|---|
| ~~R1~~ | ~~回填量體未知~~ | — | ✅ **已解除**：44 篇 / 86 kB，一批跑完。分批機制仍做，但為了可重跑而非效能 |
| **R2** | `error_analysis` JSONB 的實際形狀與 `analysisContract.ts` 有出入 | 解析失敗或欄位缺漏 | 回填函式對每一篇 try/catch，記錄失敗的 essay_id 而不是整批失敗。先在 staging 對真實資料跑一次 |
| ~~R3~~ | ~~即時 GROUP BY 變慢~~ | — | ✅ **目前解除**：44 篇作文、findings 數百列。日後資料長大再評估 1B 的 profiles 快取 |
| **R4** | `writing_admin_queue()` 加 `error_codes[]` 讓本來就重的查詢更重 | 「作文」分頁變慢 | 用 LATERAL + 既有 `(essay_id)` 索引；量測前後差異。⚠️ **這支剛在 PR #128 改過，新 migration 要建立在修正後的版本上** |
| **R5** | 班級 filter 從名稱改成 id，動到既有行為 | 既有篩選壞掉 | 納入測試，特別測「一個學生多個班」與「沒有班級」 |

### 🛑 語意風險

| # | 風險 | 說明 |
|---|---|---|
| **S1** | **有人日後加上門檻來「降噪」** | 這會直接摧毀 1A 的核心價值。函式註解要寫明「刻意沒有 HAVING」，測試要守住「一次出現也要列」 |
| **S2** | `GRAMMAR_OTHER` 被當成一個真實的錯誤類別 | 它混了至少兩種。UI 要標記並引導老師點開看例句，但**不要隱藏** |
| **S3** | 把 scope 內「沒出現某個錯」當成學會了 | TR-12/13。1A 不顯示任何「未出現」的 code，**只列出現過的** —— 從資料呈現上就不給人這個誤解的機會 |
| **S4** | 題型難度沒有正規化 | 同一學生寫不同文體錯誤分布本來就不同。1A 有題目 filter，老師可以自己控制，但**不要**在跨題目的情況下解讀「誰比較差」 |
| **S5** | 三個數字對不起來 | 三個 aggregation 必須共用 §6.0 的 scope 述詞。測試要驗證一致性（例如 Common Errors 某 code 的 `student_count` = Error→Students 選該 code 時的列數） |

### 未決但不阻塞

| # | 項目 | 何時要決 |
|---|---|---|
| — | Common Errors 要不要顯示 `per_100_words` | 建議 1A 先不顯示（§6.1 的分母陷阱），1B 一起做對 |
| — | Drill-down 的 `p_limit` 預設值 | 建議 20，看實際資料再調 |
| — | 回填期間的 UI 行為 | 建議 O2 |

---

## 10.5 ✅ Baseline（2026-09-20，動工前的現況）

動工前先跑過一次，之後每一批都要能對照這個基準，確認「不是我弄壞的」。

| 檢查 | 結果 |
|---|---|
| `supabase/tests/writing_coexistence_test.sql` | ✅ **8 PASS / 0 FAIL** |
| `supabase/tests/class_membership_left_at_test.sql` | ✅ **23 PASS / 0 FAIL** |
| `npm run verify:writing-contract` | ✅ PASS |
| `npm run verify:writing-passes` | ✅ PASS |
| `npm run build`（含 tsc） | ✅ PASS |
| `npm run lint` | ⚠️ **既有 124 problems（92 errors / 32 warnings），exit 1** |

### ⚠️ lint 本來就是紅的

`npm run lint` 在**未改任何東西**的情況下就回 exit 1。這是既有狀態，不是 Phase 1A 造成的。

但 Phase 1A 會碰到的五個檔案**目前都是乾淨的**：

| 檔案 | 目前問題數 |
|---|---|
| `src/pages/admin/WritingGrading.tsx` | 0 |
| `api/analyze-writing.ts` | 0 |
| `src/lib/writing/gradingQueue.ts` | 0 |
| `src/hooks/learn/useWritingQueue.ts` | 0 |
| `src/hooks/learn/useAdminClasses.ts` | 0 |

➡️ **驗收標準**：全站總數**不得超過 124**，且上列五個檔案（以及新增的檔案）**必須維持 0**。
不要順手去修別人的 92 個 error —— 那會讓 Phase 1A 的 diff 變得無法審查。

---

## 11. 建議的實作順序

```
第 0 步  跑 §9 的量體查詢                        ← 不做這步，後面全是猜的
         跑 supabase/tests 既有測試確認 baseline

第 1 批  A1 表 + indexes
         A2 sync + A3 backfill
         測試：冪等性、最高 COMPLETED 版次判定、FAILED 版次不清空舊 findings
         ★ 先在 staging 對真實資料回填一次，量測耗時

第 2 批  A4 / A5 / A6 / A7 四支查詢 RPC
         測試：★「一次出現也要列」· 三個數字一致性 · scope 五個條件 · LIMIT 生效
         ★ 這一批做完，功能在資料層已經完整，可以用 SQL 驗收

第 3 批  A8（writing_admin_queue + error_codes[]）
         ⚠️ 必須建立在 PR #128 修正後的版本上
         A9（analyze-writing 呼叫 sync，含 try/catch）

第 4 批  A10 UI
         4a  分頁框架 + 共用 filter bar（含班級改 id）
         4b  常見錯誤區塊
         4c  依錯誤查看 / 依學生查看 切換
         4d  drill-down accordion
         4e  三種空狀態

第 5 步  production 回填（分批，可續跑）
         ★ 回填完成前先上 UI 也可以，用 O2 的橫幅
```

**第 2 批做完就是一個可驗收的里程碑** —— 那時候用 SQL 就能回答老師的三個問題，
UI 只是把它變好用。如果時間不夠，這是一個安全的暫停點。
