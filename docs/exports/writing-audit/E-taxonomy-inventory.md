# E. Existing error / taxonomy inventory

> 全部取自 `api/_lib/taxonomy.ts`（唯一真實來源，由 `docs/learn/writing-taxonomy/*.csv` 產生）。
> **沒有自行發明任何新分類。**
>
> `WRITING_TAXONOMY_VERSION = "writing-v2"`
>
> 🛑 檔案開頭的 TR-19 寫明：code 是 **stable opaque identifier**，
> 禁止用字串解析推導所屬 Category，一律透過 relationship 取得。

---

## 三個軸

| 軸 | 內容 | 數量 | 存在 `writing_analyses` 的哪一欄 |
|---|---|---|---|
| Axis 1 Writing Competency | W1–W5 categories | **23 skills** | `competency_analysis` |
| Axis 2 Writing Error | 錯誤標籤 | **17 codes** | `error_analysis` ★ |
| Axis 3 High-Score Feature | H1–H5 categories | **29 features** | `high_score_feature_analysis` |

---

## Axis 1：Writing Competency（W1–W5 / 23 skills）


### W1 內容與任務完成（Content & Task Fulfillment）

> 是否真正回應題目、聚焦主題、發展觀點並提供足夠支持。

| code | 中文 | English |
|---|---|---|
| `WRITE_CONTENT_TASK` | 任務回應與完成度 | Task Fulfillment |
| `WRITE_CONTENT_FOCUS` | 聚焦與相關性 | Focus & Relevance |
| `WRITE_CONTENT_DEVELOP` | 觀點與內容發展 | Idea Development |
| `WRITE_CONTENT_SUPPORT` | 支持與具體化 | Support & Elaboration |

### W2 組織與連貫（Organization & Coherence）

> 是否具備整體架構、段落組織、邏輯推進與清楚的銜接／資訊流。

| code | 中文 | English |
|---|---|---|
| `WRITE_ORG_OVERALL` | 整體組織 | Overall Organization |
| `WRITE_ORG_PARAGRAPH` | 段落結構 | Paragraph Structure |
| `WRITE_ORG_LOGIC` | 邏輯推進 | Logical Progression |
| `WRITE_ORG_COHESION` | 銜接與連接 | Cohesion & Linking |
| `WRITE_ORG_FLOW` | 資訊流與指涉連貫 | Reference & Information Flow |

### W3 詞彙運用（Lexical Resource）

> 是否使用足夠、準確、自然且有彈性的詞彙，並控制詞形與拼寫。

| code | 中文 | English |
|---|---|---|
| `WRITE_LEXICAL_RANGE` | 詞彙範圍 | Vocabulary Range |
| `WRITE_LEXICAL_PRECISION` | 用字準確與精確 | Word Choice & Precision |
| `WRITE_LEXICAL_COLLOCATION` | 搭配與自然用法 | Collocation & Natural Usage |
| `WRITE_LEXICAL_FLEXIBILITY` | 改述與詞彙彈性 | Paraphrase & Lexical Flexibility |
| `WRITE_LEXICAL_FORM` | 詞形與拼字控制 | Word Form & Spelling Control |

### W4 句構與文法（Grammar & Sentence Structure）

> 是否能準確且有變化地使用基本與複雜句構，並維持整體句法控制。

| code | 中文 | English |
|---|---|---|
| `WRITE_GRAMMAR_BASIC` | 基本句構準確度 | Basic Sentence Accuracy |
| `WRITE_GRAMMAR_RANGE` | 文法結構範圍 | Grammatical Range |
| `WRITE_GRAMMAR_COMPLEX` | 複雜句構控制 | Complex Structure Control |
| `WRITE_GRAMMAR_VARIETY` | 句式多樣性與節奏 | Sentence Variety & Style |

### W5 語體、讀者與寫作規範（Register, Audience & Conventions）

> 是否依讀者與文類使用合宜語體、語氣、慣例，以及標點與基本書寫規範。

| code | 中文 | English |
|---|---|---|
| `WRITE_REGISTER_FORMALITY` | 語體與正式度 | Register & Formality |
| `WRITE_REGISTER_AUDIENCE` | 讀者意識 | Audience Awareness |
| `WRITE_REGISTER_VOICE` | 語氣與作者聲音 | Tone & Voice |
| `WRITE_REGISTER_GENRE` | 文類與任務慣例 | Genre & Task Conventions |
| `WRITE_REGISTER_MECHANICS` | 標點與書寫規範 | Punctuation & Mechanics |

---

## ★ Axis 2：Writing Error（17 codes）—— 這是「錯誤分類篩選」要用的東西

每一個 error tag 都掛回 Axis 1 的 Primary Writing Skill。

| # | code | 中文 | English | → Primary Skill |
|---|---|---|---|---|
| 1 | `WRITE_ERR_RUN_ON` | Run-on 冗長句 | Run-on Sentence | `WRITE_GRAMMAR_BASIC` |
| 2 | `WRITE_ERR_FRAGMENT` | Fragment 不完整句 | Sentence Fragment | `WRITE_GRAMMAR_BASIC` |
| 3 | `WRITE_ERR_NUMBER` | 單複數錯誤 | Number Error | `WRITE_GRAMMAR_BASIC` |
| 4 | `WRITE_ERR_ARTICLE` | 未加冠詞 | Missing / Incorrect Article | `WRITE_GRAMMAR_BASIC` |
| 5 | `WRITE_ERR_COUNTABILITY` | 不可數名詞用錯 | Countability Error | `WRITE_GRAMMAR_BASIC` |
| 6 | `WRITE_ERR_WORD_BOUNDARY` | 連寫或分開寫錯誤 | Word Boundary Error | `WRITE_LEXICAL_FORM` |
| 7 | `WRITE_ERR_SV_AGREEMENT` | SV 一致 | Subject–Verb Agreement Error | `WRITE_GRAMMAR_BASIC` |
| 8 | `WRITE_ERR_TRANSITIVITY` | Vt 與 Vi 用錯 | Transitivity Error | `WRITE_GRAMMAR_BASIC` |
| 9 | `WRITE_ERR_PRONOUN` | 代名詞錯誤 | Pronoun Error | `WRITE_GRAMMAR_BASIC` |
| 10 | `WRITE_ERR_GRAMMAR_OTHER` | 文法錯誤 | Other Grammar Error | `WRITE_GRAMMAR_BASIC` |
| 11 | `WRITE_ERR_PREP_CLAUSE` | 介係詞誤接句子 | Preposition–Clause Error | `WRITE_GRAMMAR_BASIC` |
| 12 | `WRITE_ERR_WORD_CLASS` | 詞類誤用 | Word Class Error | `WRITE_LEXICAL_FORM` |
| 13 | `WRITE_ERR_CHINGLISH` | 中式英文 | Chinese-transfer / Chinglish Expression | `WRITE_LEXICAL_COLLOCATION` |
| 14 | `WRITE_ERR_SPELLING` | 拼寫錯誤 | Spelling Error | `WRITE_LEXICAL_FORM` |
| 15 | `WRITE_ERR_PUNCTUATION` | 標點符號 | Punctuation Error | `WRITE_REGISTER_MECHANICS` |
| 16 | `WRITE_ERR_THAT` | that 誤用 | That-usage Error | `WRITE_GRAMMAR_BASIC`, `WRITE_GRAMMAR_COMPLEX` |
| 17 | `WRITE_ERR_DISCOURSE_STRUCTURE` | 未符合篇章結構概念 | Discourse Structure Error | `WRITE_ORG_OVERALL` |

**`ErrorFinding` 的實際形狀**（`api/_lib/analysisContract.ts`）：

```ts
export interface ErrorFinding {
  readonly code: string;          // ← 上表 17 個之一
  readonly quote: string;         // ← 學生原文逐字片段（驗證會擋改寫）
  readonly reason: string;        // ← 為什麼錯
  readonly correction: string;    // ★ 句級修正，必填
  readonly primary_skill: string; // ← 掛回 Axis 1
  readonly fallback_rationale?: string;  // 只有 GRAMMAR_OTHER 需要，內部欄位不給學生看
}

export interface ErrorCoverageEntry {
  readonly code: string;
  readonly count: number;         // 0 = 本篇未發現此類錯誤
  readonly note?: string;
}

export interface ErrorAnalysis {
  readonly taxonomy_version: string;
  readonly findings: readonly ErrorFinding[];
  readonly coverage: readonly ErrorCoverageEntry[];   // ★ 全 17 code 都會出現
  readonly coverage_source: "SERVER_DERIVED";
}
```

🛑 **三條既有的語意規則，做跨篇分析時不能違反**（原文寫在 contract 裡）：

- `ZERO_ERROR_LABEL = "本篇未發現此類錯誤"` —— count = 0 是**對這一篇的觀察**，**不是精熟度宣稱**（TR-12 / TR-13）
- `coverage_source = "SERVER_DERIVED"` —— coverage 是伺服器從已驗證 findings 數出來的**算術**，不是 AI 的能力判斷
- `ERROR_FALLBACK_CODE = "WRITE_ERR_GRAMMAR_OTHER"` 是 fallback，用它要付舉證責任（必填 `fallback_rationale`）

---

## Axis 3：High-Score Feature（H1–H5 / 29 features）


| code | 中文 | English |
|---|---|---|
| **H1** | 句構與句式技巧 | Sentence Craft |
| **H2** | 字彙成熟度 | Lexical Sophistication |
| **H3** | 篇章與連貫技巧 | Discourse Craft |
| **H4** | 修辭與風格 | Rhetoric & Style |
| **H5** | 內容發展與思維技巧 | Content & Idea Craft |

每個 feature 帶一條 `boundaryRule`（Effective / Boundary Rule，TR-06），會**原文帶進 DeepSeek prompt**。

`HighScoreQuality` 的四個 canonical 值：`EFFECTIVE` / `PARTIALLY_EFFECTIVE` / `MISUSED` / `UNMEASURED`
（UI 顯示「有效運用 / 差一點 / 用錯了 / 本次未出現」）。只有 `EFFECTIVE` 是明確的 positive evidence（TR-05）。

`CompetencyState` 的四個值：`STRONG` / `ADEQUATE` / `DEVELOPING` / `UNMEASURED`
——`UNMEASURED` 也必須有理由，它是判斷不是預設值。

---

## 你點名的關鍵字，逐一比對

| 你問的 | repo 裡的現況 |
|---|---|
| grammar error | ✅ `W4 句構與文法` + 9 個 `WRITE_ERR_*` 掛在 `WRITE_GRAMMAR_BASIC` |
| vocabulary error | ✅ `W3 詞彙運用` + `WRITE_ERR_SPELLING` / `WORD_CLASS` / `WORD_BOUNDARY` / `CHINGLISH` |
| sentence structure | ✅ `W4` + `H1 句構與句式技巧` |
| coherence | ✅ `W2 組織與連貫` + `H3 篇章與連貫技巧` |
| error type / error category | ✅ **17 個 `WRITE_ERR_*` stable code** |
| correction | ✅ `ErrorFinding.correction`，必填 |
| feedback type | ✅ `strengths` / `needs_work` / `next_steps`（`MAX_NEXT_STEPS = 3`） |
| **H1/H2/H3/H4/H5** | ✅ **就是 Axis 3 的五個 category**（不是 heading 層級） |
| writing weakness | ⚠️ 只有**單篇**的 `needs_work` |
| **recurring / repeated / persistent** | ❌ **完全沒有**。全 repo 零命中 |
| intervention | ❌ 沒有 |
| writing target | ⚠️ 只有單篇的 `next_steps`（最多 3 條），沒有跨篇目標 |
