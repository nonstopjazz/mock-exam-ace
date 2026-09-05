# Writing v2 加固設計：Error Critic + 跨軸調和

> **狀態：已設計，未實作。v1 刻意不做。**
>
> 2026-09-05 產品決策：v1 的分析品質已足夠，因為報告本身已經詳細可用，
> 幻覺／覆蓋／重試／重複這幾類重大問題都已處理，而且**老師會在給學生看之前
> 親自審閱**。加這兩層要多付 14–26 秒 AI 處理時間與相應複雜度，launch 前不值得。
>
> v1 明確接受的殘留瑕疵：
> * 偶發的 Error code 誤標
> * 偶發的 correction 措辭不夠好
> * 偶發的跨軸張力（不影響報告整體有效性）
>
> **2026-09-05 修訂：v1 沒有系統內的老師審核關卡。** AI 分析完成後學生立即看得到報告。
>
> 老師的人味價值是在課堂上口頭交付的——說明、更正、強調、補充——而不是在系統裡逐篇按核准。
> AI 報告的定位是：詳細的基線分析、安全網、以及學生與家長可以回頭查閱的結構化紀錄。
> 系統內另有一層**選填**的老師講評，但那不是發布關卡。
>
> ⚠️ 重新評估這兩層的觸發條件（擇一即可）：
>   * 出現**嚴重的學生端故障**——例如報告把對的用法教成錯的，而且學生照著改
>   * 產品定位改變成「AI 報告即最終評語」，課堂上的口頭複核不再是主要人味層

---

## 觸發這份設計的實測證據

2026-09-05 弱作文 v10（`32870c7d`，taxonomy writing-v2）：

| 問題 | 實例 |
|---|---|
| Code 誤標 | `WRITE_ERR_SPELLING「drown」→「sinks」`，理由自己寫「drown 是淹沒的意思」——那是選字，不是拼字 |
| correction 不夠自然 | `basis heart → basic heart`（原文確實有問題，但改法仍不自然；能力軸自己說該用 `beating heart`） |
| reason 與 correction 不一致 | `WRITE_ERR_ARTICLE「the basis heart」→「the basic heart」`，理由說「heart 前需加冠詞 a」，但 correction 沒有加任何冠詞，做的其實是 basis→basic（與另一筆 WORD_CLASS 重複） |
| 跨軸張力 | HSF 說 `WRITE_HSF_APPOSITIVE = EFFECTIVE`「結構正確」，錯誤軸對同一句說「句子結構混亂」 |

已經用確定性規則解決、**不需要**這兩層的：完整覆蓋、逐字引用、伺服器推導 coverage、
最小證據範圍（REDUNDANT_SPAN）、fallback 自我推翻（FALLBACK_SELF_CONTRADICTION）。

---

## 為什麼是後處理，不是再調 discovery prompt

v5 → v10 六次真實迭代的結論：**只有驗證擋得住的規則會生效，prompt 措辭要求不會。**

* 有效：逐字引用強制（捏造引用 12 → 0）、伺服器推導 coverage（COUNT_MISMATCH → 0）、
  REDUNDANT_SPAN（整句打包 8 → 0）
* 無效：反覆要求「能用具體 tag 就用具體的」（v5→v6 fallback 占比毫無改善）

剩下的三類問題（誤標、措辭、跨軸）**無法用確定性規則判定**——它們需要語言判斷。
所以下一步不是第七次改 prompt，而是換一種機制：讓模型做判斷，讓程式管邊界。

---

## 共同管線位置

```
請求 A  mode "stage1"      四支 discovery 平行 → 各自 VALID
請求 B  mode "stage1-qc"   critic → reconciliation（循序）→ ANALYZED
請求 C  mode "synthesis"   吃已落地（= 調和後）的結果 → COMPLETED
```

**關鍵：QC 必須在 `ANALYZED` 之前。** 四軸在 `ANALYZED` 之後由 trigger 永久凍結
（`writing_analyses_guard_immutable_trigger`），而 `collectCitableRefs()` 是從已落地的欄位
建可引用集合。所以只要 QC 在凍結之前跑完，「綜合層只吃調和後結果」自動成立，
不需要任何額外機制。反之，若 QC 在 ANALYZED 之後，它既寫不進去，綜合層也可能引用
一筆稍後被 REJECT 的 finding，變成懸空引用（正是 `UNCITABLE_REF` 要防的事）。

**A 與 B 必須循序**，不可平行：B 要根據 critic 之後的錯誤來調和，否則可能依據一筆
稍後被 REJECT 的錯誤去縮 HSF 證據。

兩者都以新的 pass 身分接進既有的 `stage1_progress` 狀態機
（`PENDING / RUNNING / VALID / RETRY_REQUIRED / FAILED`），不需要新架構。

---

## A —— Error Finding Critic

**輸入**：原文、已驗證的 Error findings、canonical Error taxonomy
**禁止**：重新掃描原文找新錯誤、增加 findings、修改 quote

### Schema

```ts
interface CriticVerdict {
  index: number;                    // 對應輸入 findings 的位置，必填
  action: "KEEP" | "RELABEL" | "REVISE_CORRECTION" | "REJECT";

  new_code?: string;                // RELABEL：必須是 canonical
  new_fallback_rationale?: string;  // new_code 為 GRAMMAR_OTHER 時必填

  new_correction?: string;          // REVISE_CORRECTION
  new_reason?: string;              // 可選：讓理由與新 correction 一致

  claimed_change?: ClaimedChange;   // KEEP / RELABEL / REVISE 必填，見下
  reject_criterion?: "NOT_AN_ERROR"; // REJECT 唯一合法值
  note: string;                     // 稽核用，一句話
}
```

**quote 沒有對應欄位**——這是「critic 不會變成第二次掃描」的結構性保證，
不是靠 prompt 拜託它別這麼做。

### 逐筆要驗證的五件事

1. 被引用的文字真的有錯
2. code 與實際錯誤類型相符
3. correction 確實修好了 reason 說的問題
4. correction 本身文法正確、語境合適
5. reason 與 correction 互相一致

### 防止過度修正（全部由伺服器強制）

1. **verdict 數必須恰好等於輸入 findings 數**，index 完整覆蓋不重複——
   沿用 taxonomy pass 的完整覆蓋驗證。少一筆是驗證失敗，**不是**預設 KEEP
2. **findings 只能減少或持平**，永不增加
3. **quote 不可變**
4. **REJECT 的判準只有 `NOT_AN_ERROR` 一個合法值。**
   correction 不好 → 只能 `REVISE_CORRECTION`；code 錯 → 只能 `RELABEL`。
   「這筆很爛」不構成刪除理由，只構成修正理由
5. **改寫後的 finding 必須重新通過完整的 `validateErrorAnalysis`**
   （逐字引用、correction ≠ quote、GRAMMAR_OTHER 需理由、最小範圍、不自我推翻）
6. **`claimed_change` 機械驗證**（見下）

刻意**不設** REJECT 比例上限：配額會在強／弱作文之間製造系統性偏差，
而第 4 條的結構性收窄比配額精準。

### 失敗行為

critic 用盡重試預算後**不得讓整篇分析失敗**。它是品質控制，不是關卡。
記 `error_critic_status = "SKIPPED"`，沿用未經 critic 的 findings 繼續。
理由：Stage 1 的四支呼叫已經付過錢，不能因為一個可選的優化層而丟掉。

---

## `claimed_change` —— 可以確定性檢查的那一半

```ts
type ClaimedChange =
  | { kind: "REPLACE"; from: string; to: string }
  | { kind: "INSERT";  to: string }
  | { kind: "DELETE";  from: string };
```

| kind | 伺服器檢查（純字串，零判斷） |
|---|---|
| REPLACE | `from` ⊂ quote、`to` ⊂ correction、`to` ⊄ quote（真的變了） |
| INSERT | `to` ⊂ correction 且 `to` ⊄ quote |
| DELETE | `from` ⊂ quote 且 `from` ⊄ correction |

**會抓到**：`ARTICLE「the basis heart」→「the basic heart」`，理由宣告 INSERT "a"，
但 correction 沒有插入任何冠詞 → 擋下。

**抓不到**：`SPELLING「drown」→「sinks」`——機械上是合法的 REPLACE，
誤標只能靠 critic 的語言判斷。

> `claimed_change` 驗的是「correction 有沒有做 reason 說的事」，
> **不是**「這件事該不該做」。不要高估它。

### 放在 critic 的輸出，不要放進 discovery prompt

三個理由：

1. 產品決策已指示不再改 discovery prompt
2. discovery pass 每多一個必填欄位就多一條 attempt-1 失敗路徑——
   v7 那次 31/31 MALFORMED 是實證代價
3. critic 本來就必須判斷「correction 是否修好了 reason 說的問題」，
   要它把判斷結構化是零額外成本

如此一來，**critic 自己的輸出也被確定性檢查把關**，而不是只能相信它。

---

## B —— 跨軸調和（Cross-Axis Reconciliation）

**輸入**：三軸已驗證結果 + 原文
**目的**：偵測軸與軸之間**邏輯上不相容的斷言**，而不是把三軸合併
**禁止**：產生新 finding、修改 Error findings、改變節點數

### Schema

```ts
interface ReconcileVerdict {
  node_code: string;                // HSF feature code 或 competency skill code
  action: "KEEP" | "SHRINK_EVIDENCE" | "REVISE_RATIONALE" | "DOWNGRADE";
  new_evidence?: string;            // SHRINK：必須是原 quote 的子字串
  new_reason?: string;
  new_justification?: EffectiveJustification;
  undermined_by?: string;           // DOWNGRADE：必須指名那一筆 Error finding
  note: string;
}
```

### 候選集合先用程式篩

只有「evidence span 與某筆 Error finding 的 span 重疊」的節點才送進模型。
v10 大約 8–10 個節點落入候選，其餘二十多個連看都不必看。
這讓成本可控，也讓「**未被質疑的節點不可能被改動**」成為結構保證。

### 防止過度修正

1. **只能往下，沒有 UPGRADE 動作**
2. **`DOWNGRADE` 只降一階**（EFFECTIVE → PARTIALLY_EFFECTIVE），
   **永遠不得降到 UNMEASURED**——UNMEASURED 的意思是「這個特徵沒有被引出」，
   那是關於作文的事實陳述，不是品質等級。降到那裡等於偽造事實（TR-11）
3. **UNMEASURED 節點不可被改動**，任何方向
4. **`DOWNGRADE` 必須指名推翻它的那一筆 Error finding**，
   且該 finding 的 span 必須真的與該節點的 evidence 重疊——程式驗證
5. **`SHRINK_EVIDENCE` 的新引用必須是原引用的子字串**（純字串檢查）：
   只能縮、不能長、不能換位置
6. **Error findings 完全不可修改。** B 只讀不寫錯誤軸——
   這個不對稱就是 TR-03 的執行方式
7. **節點數不變**（23 / 17 / 29 覆蓋完整）

### 用實例驗證這套規則

```
HSF   WRITE_HSF_APPOSITIVE = EFFECTIVE
      evidence =「Park, a silence in the busy city, people can enjoy…」（整句）
Error #1 同一句：主詞與同位語結構不一致

正確結果：SHRINK_EVIDENCE →「a silence in the busy city」
          REVISE_RATIONALE → 同位語本身有效，句子的主詞問題另計
          APPOSITIVE 維持 EFFECTIVE（不自動降級）
          Error #1 原封不動
```

規則 5 保證新引用是原引用的子字串；規則 2 保證不會被順手降級；
規則 6 保證錯誤軸不動。**只有當錯誤本身就落在特徵的最小範圍內時，
規則 4 才允許 DOWNGRADE**——那正是「錯誤真的推翻了特徵本身」的定義。

---

## 成本估算（以 2026-09-05 實測外推）

| | 呼叫 | 估計延遲 | 估計 completion tokens |
|---|---|---|---|
| A Critic | 1（全部 findings 一起，才看得到跨筆重複） | 8–14 秒 | 800–1,500 |
| B Reconciliation | 1 | 6–12 秒 | 500–900 |
| **合計** | 2（循序，一個 QC 請求） | **14–26 秒** | 1,300–2,400 |

基準：綜合層實測 869 completion tokens / 7.5 秒。

對 50 秒期限餘裕充足。但牆鐘會從 v10 的 64.7 秒再加約 20 秒——
**弱作文的老師等待時間會逼近 85 秒。這是 v1 不做的主要原因。**

若實測 A+B 超過 30 秒，拆成兩個請求即可（既有模式，非新設計）。

---

## 稽核軌跡

```
error_analysis_precritic  JSONB   critic 之前的原始已驗證結果
error_critic              JSONB   { status, verdicts[], model, latencyMs, attempts }
axes_precritic            JSONB   調和前的 HSF / competency
axis_reconciliation       JSONB   { status, verdicts[], candidates[], latencyMs }
```

`candidates[]` 必須記錄：「被檢視過但判 KEEP」與「根本沒進候選」是不同的資訊，
就像 UNMEASURED 與缺漏的區別。

四欄都在 `ANALYZED` 之前寫入，不觸發凍結。需要一次 additive migration。

---

## 實作前要先決定的三件事

1. **A 與 B 是否同一個請求**（省一次往返 vs 降低單次失敗影響面）
2. **`claimed_change` 是否只放 A**（建議是：B 的動作已被子字串與 span 重疊檢查涵蓋）
3. **QC 失敗時的降級行為**：跳過並沿用未經 QC 的結果（學生無感），
   或標記「未經 QC」仍可發布（透明但需 UI 支援）

---

## 相關規則

* **TR-03**：Competency / Error / High-Score 是獨立的三軸。調和層的存在只為了
  阻止邏輯上不相容的斷言，不得把三軸合併
* **TR-08**：同一段文字可以合法支持多個 finding。重疊本身不是問題
* **TR-11**：UNMEASURED ≠ 弱。任何機制都不得把品質不佳寫成 UNMEASURED
* **TR-12 / TR-13**：寫作證據不自動等同精熟
