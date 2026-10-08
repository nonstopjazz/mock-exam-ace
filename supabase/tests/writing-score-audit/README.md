# 作文分數稽核

> 🟢 **三支全部唯讀。** 沒有 INSERT / UPDATE / DELETE / DDL，staging 與 production 都可以安全執行。
> 一次貼一份（Supabase SQL Editor 只顯示最後一個查詢的結果）。
>
> 這份稽核**只回答「分數為什麼偏高、改哪裡才有效」**，不改任何東西。

## 分數是怎麼來的

**不是 AI 直接給的。** AI 評 23 個 skill 的狀態，`writing_score_20()` 再換算：

| 狀態 | 分數 |
|---|---|
| STRONG | 4 |
| ADEQUATE | 3 |
| DEVELOPING | 2 ← **最低** |
| UNMEASURED | 排除在分母外 |

`分數 = 20 × 各類別分數和 /(4 × 有量到的類別數)`，每個類別先取其 skill 的平均再 `round()`。

### 🛑 這個量表的下限是 10，不是 0

四個狀態裡**沒有任何一個代表「完全不行」**。所以：

| 評級 | 分數 |
|---|---|
| 全 DEVELOPING（AI 最嚴厲的評級） | **10** |
| 全 ADEQUATE | **15** |
| 全 STRONG | **20** |

一篇 18 分代表 AI 給的平均是 **3.6** —— 幾乎每一項都 STRONG。

## 三支的用途

| 檔案 | 要看什麼 |
|---|---|
| `01-state-distribution.sql` | 🛑 **先看這支。** 每篇的分數 + 23 個 skill 的評級分布，含「STRONG 佔比 %」 |
| `02-remap-whatif.sql` | 逐篇對照：目前 / 只改公式 / AI 評嚴一級 |
| `03-impact-summary.sql` | 總篇數、平均降幅、全體評級分布 |
| `04-rounding-inflation.sql` | 🛑 **真正的原因在這支。** 類別內 `round()` 墊高了多少 |

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

`04-rounding-inflation.sql` 量化它。測試裡有一篇「每個類別剛好 .5」的案例：

| | |
|---|---|
| 目前 | **20** 分 |
| 不做類別內 round | **18** 分 |
| 被墊高 | **2** 分 |

評級一致的作文（全 STRONG / 全 ADEQUATE / 全 DEVELOPING）平均是整數，不受影響 ——
所以這個修正**只會動到混合型的那些**，不會把 43 篇 10–15 分的作文整批拉低。

⚠️ 去掉 `round` 不是只會往下：平均 3.4 的類別目前算 3，不 round 算 3.4（偏高）。
它消掉的是 `.5` 單向進位那個偏差，不是整體打折。`04` 的「被墊高」欄會如實顯示方向。

## 關於「改公式 vs 改 prompt」

兩條路的差別，測試裡有斷言釘住：

| | 全 STRONG | 4×STRONG + 1×ADEQUATE |
|---|---|---|
| 目前 | 20 | 19 |
| **只改公式**（DEV 1 / ADQ 2 / STR 4） | **20** | **18**（只降 1） |
| **AI 評嚴一級**（改 prompt） | **15** | **14** |

**只改公式保留 `STRONG = 4`，所以幾乎全 STRONG 的作文幾乎不會降。**
想把 18 壓到 14，改公式做不到 —— 那是在替一個過寬的評級找一個比較小的數字，不是修正。

所以判讀方式：**看 `01` 的「STRONG 佔比 %」，再看 `04` 的「被墊高」。**

- **佔比高** → AI 評太鬆，要改 prompt（`api/_lib/writingPrompts.ts` 的狀態定義）
- **佔比不高但分數偏高** → 是 `round()` 在墊高，去掉類別內的 round 就好
  （這就是 production 的情況）

## 🛑 改公式會追溯改掉舊分數

分數**沒有存成欄位**，是每次讀取時從 `competency_analysis` 算的
（`create_writing_score_20.sql:142`）。所以改公式會立刻改變**所有舊作文**的顯示 ——
昨天看到 18 分的學生，今天會看到新的數字，而且沒有任何說明。

`03` 的第一列就是會被影響的篇數。

改 prompt 則只影響之後的分析，舊分數不動。

## 🛑 新公式不要用小數

公式在**每個類別先 `round()` 再加總**，所以 `ADEQUATE = 2.5` 會被四捨成 3，等於沒改。

這是測試抓出來的，不是推論：第一版的候選公式用了 2.5，全 ADEQUATE 的分數完全沒變。

## 驗證

```bash
bash supabase/tests/writing-score-audit/run-score-audit-test.sh
```

從零建臨時資料庫，跑 **01–04 的原檔**，斷言 **34 條**。
`writing_score_20()` 從真 migration 抽出來載入，不另寫一份。

**最要緊的是 B 段：`02` 重算出來的「目前」必須等於真正的 `writing_score_20()`。**
02/03 為了做 what-if 必須在查詢裡重算一次分數，而重算只要漏掉
「UNMEASURED 排除在分母外」或「類別內先取平均再 round」，
「目前」那一欄就會跟學生真正看到的分數不同 —— 那時整張對照表都是假的，
而且看起來很合理。六種形狀（全 STRONG / 全 ADEQUATE / 全 DEVELOPING /
含 UNMEASURED / 類別內混合 / 像那篇 18 分的）逐一對照。
