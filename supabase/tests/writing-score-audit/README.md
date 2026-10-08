# 作文分數稽核

> 🟢 **全部唯讀。** 沒有 INSERT / UPDATE / DELETE / DDL，staging 與 production 都可以安全執行。
> 一次貼一份（Supabase SQL Editor 只顯示最後一個查詢的結果）。

## 2026-10-08 第二輪：把下限從 7 打開到 0

老師要能給爛作文 **0–6 分**。原本給不出來 —— 下限是 7，而且那是數學上的下限，
不是「剛好沒人更低」。四個狀態裡沒有任何一個代表「完全不行」：最低的 `DEVELOPING`
是「有嘗試但控制不穩」，賦值 1，所以整篇最低就是 `20 × 1/3 = 6.67 → 7`。

所以在 `DEVELOPING` 之下加第五個狀態 **`MINIMAL`（學生端顯示「明顯不足」），賦值 0**。

| 評級 | 舊 | 新 |
|---|---|---|
| 全 STRONG | 20 | **20**（不變） |
| 全 ADEQUATE | 13 | **13**（不變） |
| 全 DEVELOPING | 7 | **7**（不變，但不再是下限） |
| 全 MINIMAL | 算不出來 | **0** |

🛑 **這一次不是追溯性的。** `STRONG` 仍然是 3、分母仍然是 `3 × 類別數`，
而舊資料裡沒有 `MINIMAL` —— 執行 migration 的那一刻，**所有舊作文的分數一分不動**。
（上一輪改賦值時會追溯改掉全部舊分數，那是不同的情況。）

### 🛑 部署順序：SQL 先，prompt 後

| 順序 | 後果 |
|---|---|
| ✅ migration 先、prompt 後 | 安全。migration 對舊資料是 no-op |
| 🛑 prompt 先、migration 後 | **爛作文的分數會變高** |

為什麼：舊函式對不認得的 state 是「當成沒量到、**排除在分母外**」。
新的 `MINIMAL` 在它眼裡就是不認得的值，於是**最爛的那幾項不算分**，
分數反而往上，而且畫面上看起來完全正常。

所以 migration 一併把那個行為改成 **fail loud**：出現五個值以外的 state 就整篇回 `NULL`。
「沒有分數」是誠實的；「算得出來但偏高」不是。

⚠️ 代價：萬一 production 存著第五種 state，那幾篇會立刻變成讀不到分數。
**跑 migration 之前先跑 `04-state-vocabulary.sql`，確認「不認得的總數」是 0。**

### 🛑 這次沒辦法事前預覽

上一輪只改公式，所以可以拿現有的 `competency_analysis` 重算，事前逐篇確認 50 篇的新分數。

這次改的是 **AI 會輸出什麼**。現有資料裡沒有任何一筆 `MINIMAL`，重算不出來 ——
**只能上線後重跑作文，再用 `05` 與 `06` 驗收。**
這件事要先講明白，因為上一輪的「先看 50 篇再決定」在這裡做不到。

### 真正的風險是 MINIMAL 被濫用

production 50 篇裡有 **43 篇的 STRONG 是 0** —— AI 本來就偏嚴。
在 `DEVELOPING` 之下再開一格，如果門檻沒守住，那 43 篇會整批滑下去，
分數全面崩盤。那不是「變精準」，是量表壞了。

prompt 裡的煞車（`verify:writing-passes` 有 6 條斷言守著，刪掉會紅）：

- 判準只有一句：**能在本篇找出至少一處這個能力用對了嗎？** 能 → `DEVELOPING`
- 明說「**錯得比對的多**」仍然是 `DEVELOPING`，不是 `MINIMAL`
- `MINIMAL` 的 `reason` 必須寫出「該出現而沒出現什麼」，不可以只寫「表現不佳」
- 不確定是 `MINIMAL` 還是 `UNMEASURED` → **選 `UNMEASURED`**（TR-11，防止憑空扣分）

`05-minimal-distribution.sql` 的第 8 列就是這個風險的量測，門檻寫在那支檔尾。

### 🛑 `MINIMAL` 與 `UNMEASURED` 方向相反

| | 計分 | 意義 |
|---|---|---|
| `MINIMAL` | **算進分母，0 分** | 題目要求了、有材料，判定學生沒做到 |
| `UNMEASURED` | **排除在分母外** | 題目沒要求，或沒有可判斷的材料 |

混用的後果是反向的：把 `MINIMAL` 當成排除，爛作文分數變高。
`writing_score_20_test.sql` 的 B5–B8 是這一組的對照（B5 = 16 vs B6 = 20，差 4 分）。

而 **0 分與「沒有分數」也是兩件事**：全 `MINIMAL` → 0；全 `UNMEASURED` → `NULL`。
交白卷和「這篇沒有可評的材料」不可以長得一樣。

## 結論（2026-10-08 已決定並改掉）

老師反映 18 分的作文頂多該 14 分。查下去**不是 AI 評太鬆**：
50 篇裡 **43 篇的 STRONG 是 0**，分數集中 10–15 —— AI 整體偏嚴。

真正的原因有兩個，都在換算：

**一、`2/3/4` 讓下限卡在 10 分。** 四個狀態裡沒有任何一個代表「完全不行」，
所以就算每一項都評成最嚴厲的 DEVELOPING，分數還是 10/20 —— 整個下半部量表用不到。

**二、🛑 類別內的 `round()` 單向墊高。** numeric 的 `round()` 四捨五入**遠離零**：

```
avg(STRONG, STRONG, ADEQUATE, ADEQUATE) = 3.5  →  round = 4
```

「一半 STRONG、一半 ADEQUATE」的類別被算成**完全 STRONG**，而 `.5` 永遠往上、不會往下。

### 改成什麼

| | 舊 | 新 |
|---|---|---|
| 賦值 | DEV 2 / ADQ 3 / STR 4 | **DEV 1 / ADQ 2 / STR 3**（等距） |
| 類別內 | 先平均再 `round()` | **直接用平均，不 round** |
| 全 STRONG | 20 | **20**（不變） |
| 全 ADEQUATE | 15 | **13** |
| 全 DEVELOPING | 10 | **7** |

Migration：`supabase/migrations/change_writing_score_20_even_spacing.sql`

### 為什麼是等距

先試過 `DEV 1 / ADQ 2 / STR 4`。`ADEQUATE→STRONG` 的差距是 `DEVELOPING→ADEQUATE` 的兩倍，
結果 production 上：沒有 STRONG 的作文**一律掉滿 5 分**，STRONG 多的幾乎不動 ——
底部一群 5–10、頂端 18–20，**中間空掉**。

等距之後降幅 0–4，平順。實測 50 篇：`113全模2` 18→15，典型的 11→8，最高的 20→19。

### 🛑 沒有動 prompt，這是刻意的

AI 整體偏嚴，收緊只會把那 43 篇壓得更低。
而且**一次只改一個變數** —— 之後若還有偏差，才分得出是賦值還是評級造成的。

### 🛑 這個改動追溯套用到所有舊作文

分數**沒有存成欄位**，是每次讀取時從 `competency_analysis` 算的。
執行 migration 的那一刻，學生看到的歷史分數就全部變了。
（執行前已就 50 篇逐篇確認過新分數。）

## 分數是怎麼來的


**不是 AI 直接給的。** AI 評 23 個 skill 的狀態，`writing_score_20()` 再換算：

| 狀態 | 分數 |
|---|---|
| STRONG | 3 |
| ADEQUATE | 2 |
| DEVELOPING | 1 |
| MINIMAL | 0 ← **最低**（2026-10-08 新增） |
| UNMEASURED | 排除在分母外（**不是** 0） |

`分數 = 20 × 各類別平均之和 /(3 × 有量到的類別數)`。
🛑 類別內**不 round** —— 那會把 `.5` 單向往上推。

### 量表的下限

~~這個量表的下限是 7，不是 0。~~ ——
2026-10-08 第二輪加了 `MINIMAL = 0` 之後，**下限是 0**。詳見本檔開頭那一節。

| 評級 | 分數 |
|---|---|
| 全 MINIMAL | **0** ← 下限 |
| 全 DEVELOPING | **7** |
| 全 ADEQUATE | **13** |
| 全 STRONG | **20** |
| 全 UNMEASURED | 沒有分數（`NULL`，不是 0） |

## 兩支的用途

| 檔案 | 要看什麼 | 什麼時候 |
|---|---|---|
| `01-state-distribution.sql` | 每篇的分數 + 23 個 skill 的評級分布，含「STRONG 佔比 %」 | 決定要改哪裡 |
| `02-verify-formula.sql` | 等距改版的新舊對照，並**驗收重算 = 真函式** | 回看第一輪 |
| `03-verify-admin-rpc.sql` | 管理員頁看不到分數時，哪一支 migration 沒跑 | 畫面沒分數 |
| `04-state-vocabulary.sql` | 實際存在的 state 字彙 | 🛑 **跑 migration 之前** |
| `05-minimal-distribution.sql` | 0–6 有沒有用到、`MINIMAL` 有沒有被濫用 | 🛑 **上線後驗收** |
| `06-rerun-comparison.sql` | 同一篇作文重跑前後的分數並排 | 🛑 **重跑那篇之後** |

🛑 `02` 對含 `MINIMAL` 的作文會把「舊公式」「降幅」兩欄**留空** —— 不是壞了。
舊賦值裡沒有這個狀態，硬算一個對照數字看起來有意義、其實沒有。

## 🛑 production 實測推翻了第一版的判斷

第一版的結論是「AI 評太鬆，要改 prompt」。2026-10-07 跑完 50 篇，**不是那樣**：

| | |
|---|---|
| 50 篇裡 STRONG = 0 的 | **43 篇**，分數集中 10–15 |
| 有 STRONG 的 | 只有 7 篇 |

**AI 整體偏嚴。** 被墊高的是少數混合型的作文。

而老師抱怨的那篇（18 分）是：`STRONG 9 / ADEQUATE 12 / DEVELOPING 2` ——
**ADEQUATE 比 STRONG 還多，STRONG 只佔 39%**，卻拿到 18 分。

### 真正的機制：類別內的 round() 單向墊高

`writing_score_20()` 每個類別先取 skill 平均再 `round()`。而 numeric 的 `round()`
是**四捨五入遠離零**：

```
avg(STRONG, STRONG, ADEQUATE, ADEQUATE) = 3.5  →  round = 4
```

**一個「一半 STRONG、一半 ADEQUATE」的類別，被算成完全 STRONG。**
而且 `.5` 永遠往上，不會往下 —— 這個偏差是單向的。

`02-verify-formula.sql` 的「舊公式被墊高的類別」那一欄仍看得到它。測試裡有一篇「每個類別剛好 .5」的案例：

| | |
|---|---|
| 舊公式 | **20** 分 |
| 新公式（不 round） | **17** 分 |
| 降幅 | **3** 分 |

評級一致的作文（全 STRONG / 全 ADEQUATE / 全 DEVELOPING）平均是整數，不受影響 ——
所以這個修正**只會動到混合型的那些**，不會把 43 篇 10–15 分的作文整批拉低。

⚠️ 去掉 `round` 不是只會往下：平均 3.4 的類別目前算 3，不 round 算 3.4（偏高）。
它消掉的是 `.5` 單向進位那個偏差，不是整體打折。`04` 的「被墊高」欄會如實顯示方向。

## 🛑 改公式會追溯改掉舊分數

分數**沒有存成欄位**，是每次讀取時從 `competency_analysis` 算的
（`create_writing_score_20.sql:142`）。所以改公式會立刻改變**所有舊作文**的顯示 ——
昨天看到 18 分的學生，今天會看到新的數字，而且沒有任何說明。

`03` 的第一列就是會被影響的篇數。

改 prompt 則只影響之後的分析，舊分數不動。

## 驗證

```bash
bash supabase/tests/writing-score-audit/run-score-audit-test.sh
```

從零建臨時資料庫，跑 **01、02 的原檔**，斷言 **43 條**。
`writing_score_20()` 從真 migration 抽出來載入，不另寫一份。

另外把 `writing_score_20_test.sql` 收進同一支 runner —— 它在這之前**沒有任何 runner 在跑**，
而且因為兩邊都定義 `t_comp()`（參數名不同），要各自建資料庫才不會互相踩。

**最要緊的是 B 段：`02` 重算出來的分數必須等於真正的 `writing_score_20()`。**
`02` 為了做新舊對照必須在查詢裡重算一次分數，而重算只要漏掉
「UNMEASURED 排除在分母外」或「類別內不 round」，
那一欄就會跟學生真正看到的分數不同 —— 那時整張對照表都是假的，
而且看起來很合理。七種形狀（全 STRONG / 全 ADEQUATE / 全 DEVELOPING / 含 UNMEASURED /
類別內混合 / 像那篇 18 分的 / 每個類別剛好 .5）逐一對照。
