# Lexical Phase 1 —— production rollout 記錄

> 執行日期：2026-09-23
> 環境：production（gsat-staging **沒有**執行，原因見 §1）
> 狀態：**九支全部完成並驗證**
>
> 這份文件只記錄【事實】：跑了什麼、量到什麼、哪些對得上、哪些沒有。
> 決策與設計理由在 `docs/lexical/phase1.md`。

---

## 1. 為什麼沒有先在 staging 演練

原計畫是 staging 先跑。實際盤點後放棄，理由是**材料不足**：

| | production | gsat-staging |
|---|---|---|
| `level_words` | 5542 | **不存在** |
| `pack_items` | 1120 | **3 筆，且 0 筆有填詞性** |
| `user_word_progress` | 1077 | **不存在** |
| `packs` | 21 | 存在 |

在那上面跑第 6–8 支，結果會是「搬 0 筆、合併 0 筆、ambiguous 0 筆」——不是因為程式對，
是因為沒東西可搬。第 9 支還會直接失敗（`lexical_progress_coexistence` 讀 `user_word_progress`）。

改用的方法：**在 production 跑唯讀預演**（`supabase/tests/lexical-dryrun/`），
用真實資料預先算出每一支會產生什麼，數字確認後才執行。預演與實際的差異見 §4。

---

## 2. 執行順序與結果

| # | migration | 結果 |
|---|---|---|
| 1 | `create_lexical_core` | ✅ |
| 2 | `create_lexical_relations` | ✅ |
| 3 | `create_lexical_pack_items` | ✅ |
| 4 | `create_lexical_progress` | ✅ |
| 5 | `create_lexical_rpcs` | ✅ |
| — | `lexical_items_lemma_exact_idx`（效能，見 §7） | ✅ |
| 6 | `migrate_level_words_to_lexical` | ✅ |
| 7 | `migrate_pack_items_to_lexical` | ✅ |
| 8 | `migrate_lexical_relations_from_arrays` | ✅ |
| 9 | `create_lexical_migration_report` | ✅ |

**migration error 0 筆，skipped rows 0 筆。**

執行前的 preflight 確認：七張表、六支函式、trigger、四條 policy 全部不存在，
因此所有 `DROP ... IF EXISTS` 都是 no-op，沒有刪掉任何既有物件。

### 第一組驗證（結構與權限）

| 檢查 | 結果 |
|---|---|
| 表 | 7 |
| 函式 | 6 |
| RLS 開啟 | 7 / 7 |
| 政策數 | 11（items 2、legacy_map 2、relations 2、pack_items 2、unresolved 1、mastery 1、attempts 1）|
| anon SELECT / INSERT | **全部 false** |
| authenticated INSERT / UPDATE | **全部 false**（Phase 1 不發 DML grant）|
| authenticated SELECT | 除 `lexical_unresolved_relations`（false）外皆 true |
| service_role INSERT | 全部 true |

---

## 3. 搬移結果（實際數字）

| 項目 | 數量 |
|---|---|
| `level_words` 搬入 | **5542**（100%，`manual_review_required` 0） |
| pack item `exact_safe_match` | **286** |
| pack item `new_item_created` | **808** |
| pack item `ambiguous_match` | **26** |
| pack item `manual_review_required` | **0** |
| canonical items 總數 | **6376** |
| 其中 `item_type = 'phrase'` | **537** |
| pack 連結（`lexical_pack_items`） | **1101** |
| 關係建立 | **14114** |
| 關係未解決 | **12957** |
| └ synonym / no_match | 7711 |
| └ antonym / no_match | 4969 |
| └ synonym / ambiguous_match | 179 |
| └ antonym / ambiguous_match | 98 |
| 重複 lemma（多個 canonical） | **75** ＝ 題庫自己同名 52 ＋ 題庫 1 筆+pack 另建 22 ＋ pack 之間 1 |

`pack 連結 1101 < pack_items 1120`：同一個 pack 裡有多筆 pack item 併到同一個 canonical
項目時，連結只會有一筆（`UNIQUE (pack_id, lexical_item_id)`）。

### 詞性正規化的效益（PR #134 之前 vs 之後）

| | 正規化前 | 正規化後 | 差 |
|---|---|---|---|
| `exact_safe_match` | 26 | **286** | **+260** |
| `ambiguous_match` | 234 | **26** | **−208** |

正規化前的 234 筆 ambiguous 有 **233 筆**候選數是 1 —— 題庫裡就是同一個字，
只是一邊寫 `n.`、一邊寫 `noun`。若沒有 PR #134，今天會多出兩百多個
「明知是同一個字卻分成兩份」的 canonical 項目，而且熟練度會跟著一分為二。

---

## 4. dry-run 預測 vs 實際（逐筆分解）

| 效應 | exact | new | ambiguous |
|---|---|---|---|
| dry-run 預測 | 236 | 860 | 24 |
| (a) pack 之間互相合併（迴圈累積） | +51 | −51 | — |
| (b) `ban`(verb)：兄弟先建項目 → 候選變 2 | −1 | — | +1 |
| (c) `crescent`：題庫沒有，兄弟先建 → 候選 1 但詞性不符 | — | −1 | +1 |
| **實際** | **286** | **808** | **26** |

**三個分類、每一列都解釋得出來，沒有無法歸因的差異。**

(a) 是 `lexical-dryrun/README.md` 已經寫明的第 1 個已知偏差：真正的 migration 是逐筆
迴圈，前面插入的項目會成為後面那一筆的候選，而預演查詢無法模擬這種循序相依。

(b) 與 (c) 用資料證實，不是推論：

| 檢查 | `level_words` | `pack_items` |
|---|---|---|
| `ban` | 1 筆（`v.`） | 2 筆（`noun`、`verb`） |
| `crescent` | **0 筆** | 2 筆（`adjective`、`noun`） |

`ban(noun)` 先處理、先建了一個 `ban`，於是 `ban(verb)` 看到兩個候選就不合併
（預演以為它會併進題庫那一筆）。`crescent` 題庫根本沒有，所以預演判為 new；
實際上第一筆建立之後，第二筆看到候選 1 但詞性不同 → ambiguous。

**偏差方向是好的**：多合併 51 筆、少建 52 個重複項目、關係多解開 20 筆。

關係的預測與實際：

| | 預測 | 實際 |
|---|---|---|
| 建立 | 14094 | **14114** |
| 未解決 | 12978 | **12957** |

---

## 5. 六組抽查

| # | 對象 | 結果 |
|---|---|---|
| 1 | 普通單字 | `abortion` / `absorb` —— note 寫著「原始『noun』正規化為 NOUN」，`item_type = word`，題庫詞性保留 `n.` / `v.` |
| 2 | 片語 | `artificial intelligence`、`acquired immune deficiency syndrome`、`automatic teller machine` —— `item_type = phrase`，詞性保留題庫的 `n.` |
| 3 | 成功合併且跨 pack | `atmosphere`、`axis`、`celestial` 各掛在 **3 個 pack**，只有一份 canonical item |
| 4 | ambiguous | `advocate`(noun)、`arrest`(v.n.)、`balance`(verb) —— 全部 `是新建的 = true`，**沒有**被併進官方那一列 |
| 5 | synonym | `abandon → forsake`、`abandon → desert`、`abbreviate → condense` |
| 6 | 未解決關係 | `jeep → 4x4`（no_match，題庫沒有 4x4）、`somebody → a person`（no_match）、`p.m. → a.m.`（ambiguous，候選 2，不猜）|

### 26 筆 ambiguous 的組成

- **複合標籤 5 筆**：`arrest`(v.n.)、`capture`(v.n.)、`check-in`(verb / noun)、`delay`(noun / verb)、`tilt`(noun/verb)
- **詞性與題庫不符 18 筆**：`advocate` `balance` `ban` `bulge` `concentrate` `conjunction` `consent` `crescent` `current` `decline` `fluid` `grind` `grip` `influence` `moderate` `monitor` `obscure` `sort` `tilt`
- **多候選 3 筆**：`measure`(verb)、`ban`(verb)、`tilt`(noun/verb)

「詞性與題庫不符」那一群幾乎全是**同時能當名詞與動詞**的字（`decline` 名詞下降／動詞婉拒、
`monitor` 名詞螢幕／動詞監控…）。拒絕合併是正確行為，與 `book`(n.) / `book`(v.) 不得合併同理。

⚠️ 其中 `conjunction` 標 `noun` 卻對不上，疑似**題庫自己標錯**（把「連接詞」這個名詞
的詞性標成了 `conj.`）。**未處理**，留待人工確認。

---

## 6. 舊表未被修改

四張舊表在**九支全部執行完之後**的內容指紋，與執行前逐字相同：

| 表 | 列數 | 內容指紋（執行前＝執行後） |
|---|---|---|
| `level_words` | 5542 | `a336be9b192bb6e9c197621988933482` |
| `pack_items` | 1120 | `ffc6709d97b3aca6c987ae5a5e7a0b68` |
| `packs` | 21 | `62f8a07f47638cfde8e8e4bc863cf832` |
| `user_word_progress` | 1077 | `366a2f7fee07547c965872cd0b23edb4` |

指紋的算法：`md5(string_agg(整列的文字表示, '|' ORDER BY 整列的文字表示))`。
任何一欄被改寫都會讓它變。

---

## 7. 效能：`lexical_items_lemma_exact_idx`

執行第 6 支之前追加的索引（PR #136）。原因：既有索引建在 `lower(lemma)`，
但 migration 的查詢寫的是 `WHERE i.lemma = $1`，運算式索引對不上那種述語，只會走 Seq Scan。

本機用 production 同量體的資料實測：

| | 無索引 | 有索引 |
|---|---|---|
| 單次 lemma 查詢 | 0.55 ms（Seq Scan） | 0.047 ms（Bitmap Index Scan） |
| 第 6 支 | 235 ms | 258 ms |
| 第 7 支 | 900 ms | **359 ms** |
| 第 8 支 | **14 433 ms** | **1 312 ms** |

索引在 `lexical_items` 還是空表時建立，瞬間完成。

---

## 8. 雙寫實測

九支完成後，用學生帳號在 SRS 實際作答，然後比對：

| | 作答前 | 作答後 |
|---|---|---|
| `lexical_attempts` | 0 | **30** |
| `student_lexical_mastery` | 0 | **20** |
| `user_word_progress` 列數 | 1077 | 1077（UPDATE，不是 INSERT） |
| `user_word_progress` 指紋 | `366a2f7f…` | **`0611670c…`（變了）** |

**指紋變了就是舊路徑確實有寫入。** 同一次作答，新舊兩邊都動了 ——
這是相容策略最後一塊沒有證據的地方，現在有了。

新表記錄的內容與設計一致：

```
字 airline  練習 srs  面向 self_assessment  對錯 null  自評 easy
反應時間 465ms  有動熟練度 true  來自pack false
```

`skill_dimension = self_assessment`、`correct = null` —— SRS 的「easy」是自評，
不是客觀答對。這正是新系統刻意要分開的兩件事。

---

## 9. 重大發現：`student_lexical_mastery` 沒有承接 legacy history

新表是**從 0 開始累積**的。沒有任何一支 migration 把 `user_word_progress` 的
1077 列匯入新表 —— 唯一會寫 `student_lexical_mastery` 的是 `record_lexical_attempt()`。

實測對照（同一位學生、同一個字）：

| 字 | 新熟練度 | 新複習次數 | 新答對數 | 舊熟練度 | 舊複習次數 | 舊答對數 |
|---|---|---|---|---|---|---|
| `airline` | 2 | 2 | 0 | 6 | 6 | 6 |
| `aircraft` | 1 | 1 | 0 | 5 | 5 | 5 |
| `aid` | 1 | 1 | 0 | 5 | 5 | 5 |

「新答對數 0」是**另一回事**，是刻意的設計差異：SRS 的 easy 在舊系統算「答對」
（`correct_count + 1`），新系統記成自評（`correct = NULL`）不計入 `correct_count`。
熟練度公式的結果相同，差別只在「自己說會」與「考出來會」現在分得開。

### 產品決策（2026-09-23）

目前實際使用這套單字系統的學生**非常少**，`user_word_progress` 的既有資料不是
重要的 production learning history。因此：

1. **Phase 1 不做 `student_lexical_mastery` backfill。**
2. 保留 `user_word_progress` 舊表與既有資料，**不刪除**。
3. 新的 `student_lexical_mastery` / `lexical_attempts` 從現在開始累積，
   視為新系統的**正式起點**。
4. Phase 1.1 切換 read path 時，**不要求**把 legacy aggregate 完整轉換成
   新的 evidence semantics。
5. 若日後發現有少數舊學生需要保留歷史，再針對**特定學生**做一次性
   migration / manual seed，**不做全站通用 backfill**。

🛑 因此：**backfill 不是 Phase 1.1 的必要前置條件。**
已接受新 mastery 從 0 開始；legacy progress 保留供歷史參考。

（原本的說法是「backfill 是 Phase 1.1 前置條件」，依本決策作廢。）

---

## 10. 不相關的後續觀察（unrelated follow-up）

**同一次作答被記錄兩次。** `airline` 有兩筆相隔一秒的 attempt，
`response_time_ms` 都是 465；而舊表的 `review_count` 是 6、其他字是 5。

**兩條路徑都記了兩次**，代表送出動作本身發生了兩次（頁面重複觸發），
**不是 Phase 1 造成的**，也不是雙寫的問題。

未查明，未處理。與本次 rollout 無關，另列追蹤。

---

## 11. 尚未完成

| 項目 | 狀態 |
|---|---|
| `lexical_legacy_map` 權限收窄 | 獨立 migration，見 `restrict_lexical_legacy_map_read.sql` |
| `conjunction` 等疑似題庫標錯的詞性 | 未處理，留待人工 |
| 26 筆 ambiguous / 12957 筆未解決關係 | **刻意不處理**。未解決關係 97% 是 `no_match`（題庫的同義詞欄位寫了題庫本身沒有的字），那是原始資料的性質，多數永遠不需要處理 —— 它不是待辦清單 |
| Phase 1.1 canonical read path | 未開始 |
