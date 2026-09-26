# Six-Way Reading 來源檔全欄位盤點

對象：題庫管線的原始完整匯出（183 欄 × 600 列，2026-09-26）。

🛑 這份文件只記欄位名稱、筆數與分類。**沒有任何題目內容、選項或答案**，
所以它可以留在 repo 裡。要看內容請開來源檔。

分類與統計是程式產生的，不是手寫的：

- 分類規則 `src/lib/reading/columnClassification.ts`
- 重新產生報告 `npm run reading:dry-run -- <來源.xlsx>`

下一批檔案只要重跑，認不得的欄位會被列進「⚠️ 分類表不認得」，不會被安靜忽略。

---

## 0. 這份檔案的分層

| | 列數 | 意義 |
|---|---:|---|
| 有 topic_id | 600 | |
| 　還沒產出文章 | 289 | `workflow_status = QUEUED`，管線的待辦，**不是壞資料** |
| 　已產出文章 | 311 | 下面所有品質數字的分母 |

🛑 這兩者混在一起算，一個正常的產製佇列就會被報告成「一半資料壞掉」。

---

## 1. 分類方式：結構與健康狀態分兩層

| 層 | 看什麼 | 例子 |
|---|---|---|
| 結構分類 | 欄位**名稱** | `passage_final_text` 是 CORE |
| 健康狀態 | 欄位**值** | `passage_final_text` 在這一批是 PLACEHOLDER |

🛑 第六類「壞掉／placeholder」**必須**是第二層。把它寫死成靜態分類，
等管線修好那天我們會繼續忽略一個已經正確的欄位，而且沒有人會發現。
`verify-reading-parser` 的 K7／K8 兩條斷言釘住這件事。

---

## 2. 分類結果（183 欄）

| 類別 | 欄數 | 進 payload | 安全忽略 | 未承接 |
|---|---:|---:|---:|---:|
| 1 Core content | 30 | 30 | – | – |
| 2 High-value enrichment | 10 | 9 | – | 1 |
| 3 Useful metadata | 17 | 12 | – | 5 |
| 4 Provenance | 5 | 3 | 2 | – |
| 5 Pipeline-only | 121 | – | 121 | – |
| ⚠️ 不認得 | 0 | | | |

**54 欄進 canonical payload，123 欄安全忽略，6 欄有價值但 schema 尚未承接。**

---

## 3. B — 進 canonical payload 的 54 欄

**內容（7）**：`topic_id` `topic_title` `passage_final_title` `passage_final_text`
`passage_writer_title` `passage_writer_text` `passage_revised_text`

**六題 × 5 = 30**：`<c>_final_question` `<c>_final_options_json` `<c>_final_answer`
`<c>_final_explanation` `<c>_micro_skill_profile_json`，其中 `sm mi sd co cd vc`
**由欄位名推導**，不是寫死的。

> 🛑 `_final_answer` 與 `_final_explanation` 只寫進 `reading_question_keys`，
> 該表對 `authenticated` 既沒有 grant 也沒有 RLS policy。

**加值（3）**：`passage_writer_paragraph_map` `passage_writer_vocab_json` `passage_final_vocab_json`

**metadata（12）**：`difficulty_target` `content_family` `subdomain` `narrative_archetype`
`geography` `time_period` `fame_level` `passage_quality_score` `passage_readability_score`
`passage_sixway_score` `topic_quality_score` `passage_factual_risk`

**來源（2）**：`package_id` `batch_id`

---

## 4. C — 安全忽略的 123 欄

| 群組 | 欄數 | 為什麼可以丟 |
|---|---:|---|
| 各題的 writer / reviewer / judge 中間產物 | 96 | 最終結果已在 `_final_*`；**這 96 欄在這份檔案整欄空白** |
| 選題 brief（`central_story` `key_facts` `narrative_arc` `recommended_angle` `inference_opportunity` …） | 8 | 這是**寫給 writer 的輸入**，內文已經把它寫出來了；`inference_opportunity` 更等同 CO 題的提示 |
| 寫作／審查設定（`target_word_count` `language_variant` `review_strictness` `source_citation_requirement` `special_instruction`） | 5 | 產製參數，跟學生怎麼練沒有關係 |
| 文章層級的審查過程（`passage_review_verdict` `passage_review_comments` `passage_revision_instruction` `passage_judge_verdict`） | 4 | 結論已經被四個分數表示了 |
| workflow 狀態（`workflow_status` `current_stage` `retry_count` `error_message` `pabbly_trigger` `topic_status` `topic_notes` `passage_status`） | 8 | 管線的狀態機，**不等於我們的上架狀態**，收進來只會有兩個互相矛盾的真相 |
| 管線時間戳（`created_at` `updated_at`） | 2 | 不等於我們的入庫時間 |

---

## 5. D — 有價值，但 schema 目前沒有承接的 6 欄

| 欄位 | 筆數 | 可能的用途 | 為什麼 v1 不收 |
|---|---:|---|---|
| `specific_anchor` | 600 | 文章列表的一句話副標 | 需要先決定列表長什麼樣 |
| `knowledge_payoff` | 600 | 「讀完你會懂什麼」的課前導引 | 同上 |
| `intellectual_hook` | 600 | 卡片標語 | 同上 |
| `source_verifiability` | 600 | 與 `factual_risk` 互補的事實信心 | 沒有消費端 |
| `duplicate_risk` | 600 | 選篇時避免撞題 | 沒有消費端 |
| `passage_writer_main_idea` | 309 | 教師端參考、出題校對 | 🛑 **它等同 MI 那一題的答案**。`reading_passages` 是學生讀得到的表，schema 目前沒有「只有教師看得到」的位置，與其擠進去不如先不收 |

前五欄都在 600 列全滿，隨時可以補。加欄位時要一併決定**誰讀得到**。

---

## 6. E — 壞掉／不可信的欄位

| 欄位 | 狀況 |
|---|---|
| `passage_final_title` | 🛑 **311/311 列的值是字串 `passage_writer_title`** |
| `passage_final_text` | 🛑 **311/311 列的值是字串 `passage_revised_text`** |
| `passage_final_vocab_json` | 整欄空白 |
| `package_id` / `batch_id` | 整欄空白 → 來源批次追溯不到 |

### 「看起來是 final，其實只是欄位名」

管線把欄位**名稱**寫進了欄位**值**——一個沒有解開的樣板參照。
判斷方式是最直接的那個：去掉空白之後剛好等於來源檔的某個欄位名稱。
一段真正的文章不會剛好等於 `passage_revised_text`。

如果沒有擋，**296 篇文章的內文全都會變成字串 `passage_revised_text`**，
而且每一篇都「成功匯入」，資料庫看起來完全正常。

**這一批的影響是零**：fallback chain 跳過壞掉的 FINAL，296 篇全部落在 REVISED。
而且它壞掉的方式**剛好洩漏了管線的原意**——標題該取 writer、內文該取 revised，
跟我們的 fallback 順序一致。

---

## 7. 段落 → 題目的 evidence anchor

**結構化的錨點不存在。** 可用的只有兩種：

1. `passage_writer_paragraph_map` — `P1: … | P2: … | P3: …`，**文章層級**的段落摘要
2. `passage_writer_vocab_json` 的 Candidate 層 — `settled = … (P1)`，**詞彙**對段落

兩者都沒有把**題目**接到段落。

唯一的訊號是中文解說裡的散文提及（「文章第三段指出…」），六個 construct
合計約 156/1830 題，約 8.5%。那是散文，不是錨點：句子形式不固定、覆蓋率低，
而且**解說本身就是答案**，靠它反推段落等於把答案洩進一個學生讀得到的欄位。

→ **Phase 1 儲存段落地圖，不做任何 question → paragraph 推論。**

---

## 8. 這一批的匯入結果

以 311 篇已產出文章為分母：

| | 篇數 |
|---|---:|
| PUBLISH_READY（六題完整） | 282 |
| DRAFT（1–5 題） | 14 |
| BLOCKED（0 題，不匯入） | 15 |

canonical payload 296 份（282 + 14），與三態相符。
本機端對端匯入：296 imported / 1746 題 / 1276 段 / 2681 詞彙，
重送同一份 payload → 296 skipped、題數不變、回傳不含答案。

15 篇 BLOCKED 與 14 篇 DRAFT 幾乎都是同一個原因：**選項文字空白**
（`A:  | B:  | C:  | D: ` 結構在、內容沒生出來），少數是缺解說或缺正解。
這要回題庫管線補，不是匯入端能修的。
