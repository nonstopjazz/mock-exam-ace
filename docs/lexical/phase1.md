# Lexical Model Phase 1 —— 交付說明

> **本次沒有重新設計 SRS / mastery 演算法。** 詳見 §10。
>
> 策略：additive migration + compatibility layer。
> 沒有刪除任何既有 table、route 或功能；七個 practice 頁面的可見行為與改版前一致。

---

## 1. 新的 ER 圖

```
auth.users ─┬────────────────────────────────────────────────┐
            │                                                │
            │  ┌─── 既有（完全未動）─────────────────┐        │
            ├─→│ user_word_progress  (BIGINT ms)     │        │
            ├─→│ pack_item_progress  (TIMESTAMPTZ)   │        │
            ├─→│ user_stats                          │        │
            ├─→│ user_pack_claims  ─→ packs          │        │
            │  └─────────────────────────────────────┘        │
            │                                                 │
            │  ┌─── 新增（Phase 1）──────────────────┐         │
            ├─→│ student_lexical_mastery             │         │
            └─→│ lexical_attempts                    │         │
               └──────────┬──────────────────────────┘         │
                          │ lexical_item_id                    │
                          ▼                                    │
   ┌──────────────────────────────────────────────┐            │
   │             lexical_items                    │            │
   │  canonical 語彙單位                           │◄───────────┘
   │  item_type: word | phrase | collocation      │   created_by
   │             | pattern | expression           │
   │  legacy_level_word_id ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─→ level_words (不動)
   └──┬────────────┬─────────────┬────────────────┘
      │            │             │
      │            │             │ source / target
      │            │             ▼
      │            │   ┌───────────────────────────────┐
      │            │   │ lexical_relations             │
      │            │   │ synonym | antonym             │
      │            │   │ word_family | confusable      │
      │            │   │ phrase_of | pattern_of        │
      │            │   │ related                       │
      │            │   └───────────────────────────────┘
      │            │
      │            │   ┌───────────────────────────────┐
      │            └──→│ lexical_unresolved_relations  │  無法安全判定的，
      │                │ no_match | ambiguous_match    │  等人工處理
      │                └───────────────────────────────┘
      │
      │  ┌──────────────────────────────┐
      ├─→│ lexical_pack_items (M:N)     │──→ packs （沿用既有，未另建 pack 主表）
      │  │ sort_order / teacher_note    │
      │  │ pack_specific_metadata       │
      │  └──────────────────────────────┘
      │
      │  ┌──────────────────────────────┐
      └─→│ lexical_legacy_map           │──→ level_words.id / pack_items.id
         │ match_method（＝migration    │
         │ report 的四個分類）           │
         └──────────────────────────────┘
```

**三個關鍵設計**

1. `lexical_items` 一張表裝五種 item_type。phrase 沒有另一套學習系統 —— 否則 relations / pack / mastery / attempt 全部要寫兩遍。
2. `student_lexical_mastery` 的 identity 是 `(student_id, lexical_item_id)`，**不含 pack_id**。同一個 `persist` 出現在五個 pack，熟練度仍然只有一份。
3. `lexical_attempts` 與 mastery 分離。留下 attempt 不代表要動熟練度（`affected_mastery` 欄位記錄有沒有動）。

---

## 2. 新增／修改的 table

### 新增（8 張表 + 5 個視圖）

| Table | 用途 | RLS |
|---|---|---|
| `lexical_items` | canonical 語彙單位 | 登入者可讀；寫入限 `is_admin()` |
| `lexical_legacy_map` | legacy id → canonical id，兼 migration report | 同上 |
| `lexical_relations` | 語彙關係（FK，非純文字） | 登入者可讀；寫入限 admin |
| `lexical_unresolved_relations` | 無法安全判定的關係 | **只有 admin**（學生看不到內部待辦） |
| `lexical_pack_items` | packs ↔ lexical_items 多對多 | 看得到 pack 才看得到；擁有者或 admin 可寫 |
| `student_lexical_mastery` | 學生熟練度（不綁 pack） | **只能讀自己**；完全沒有寫入 grant |
| `lexical_attempts` | 每一次作答的完整證據 | **只能讀自己**；完全沒有寫入 grant |

視圖（全部 admin-only）：`lexical_migration_report`、`lexical_migration_needs_review`、`lexical_duplicate_candidates`、`lexical_unresolved_relations_report`、`lexical_progress_coexistence`

### 修改

**沒有任何既有 table 被修改。** 沒有 ALTER、沒有 DROP、沒有 UPDATE 到 legacy 資料。

`level_words`、`pack_items`、`packs`、`user_word_progress`、`pack_item_progress`、`user_pack_claims`、`user_stats` 全部一欄不改、一列不動。

### 新增的函式

| 函式 | 性質 | search_path |
|---|---|---|
| `lexical_touch_updated_at()` | trigger | `SET search_path = ''` |
| `lexical_compat_review_interval(smallint)` | IMMUTABLE | `SET search_path = ''` |
| `lexical_compat_next_mastery(smallint, boolean, text)` | IMMUTABLE | `SET search_path = ''` |
| `record_lexical_attempt(...)` | SECURITY DEFINER | `SET search_path = ''` |
| `get_lexical_mastery_map()` | SECURITY DEFINER | `SET search_path = ''` |

四支非 trigger 函式都 `REVOKE ALL FROM PUBLIC, anon`，只 `GRANT EXECUTE TO authenticated, service_role`。

---

## 3. Migration SQL

### 執行順序（**必須照這個順序**）

| # | 檔案 | 類型 | 標示 |
|---|---|---|---|
| 1 | `create_lexical_core.sql` | DDL | 🟢 |
| 2 | `create_lexical_relations.sql` | DDL | 🟢 |
| 3 | `create_lexical_pack_items.sql` | DDL | 🟢 |
| 4 | `create_lexical_progress.sql` | DDL | 🟢 |
| 5 | `create_lexical_rpcs.sql` | 函式 | 🟢 |
| 6 | `migrate_level_words_to_lexical.sql` | 資料 | 🟢 |
| 7 | `migrate_pack_items_to_lexical.sql` | 資料 | 🟢 |
| 8 | `migrate_lexical_relations_from_arrays.sql` | 資料 | 🟢 |
| 9 | `create_lexical_migration_report.sql` | 視圖 | 🟢 |

🟢 **這九支都只要在 production 執行一次**（照慣例先在 gsat-staging 跑一遍確認，再上 production）。

它們全部是純新增，不改任何既有資料，所以不需要「在兩個環境各跑一次以比對」的那種 🔴 流程。

### 回滾

每一支都有對應的 `.rollback.sql`，**回滾順序與上表相反**（9 → 1）。

```
create_lexical_migration_report.rollback.sql
migrate_lexical_relations_from_arrays.rollback.sql
migrate_pack_items_to_lexical.rollback.sql
migrate_level_words_to_lexical.rollback.sql
create_lexical_rpcs.rollback.sql
create_lexical_progress.rollback.sql
create_lexical_pack_items.rollback.sql
create_lexical_relations.rollback.sql
create_lexical_core.rollback.sql
```

**沒有任何一支 migration 是破壞性的。** 全鏈回滾後實測：`level_words` 8 列、`pack_items` 6 列、`user_word_progress` 1 列、`packs` 2 列全部完好，lexical 相關物件歸零。

⚠️ **唯一會遺失的東西**：`lexical_attempts`。它是原生新資料（每一次作答的細節），舊表沒有等價物，刪掉無法重建。`create_lexical_progress.rollback.sql` 的開頭有備份指令。
`student_lexical_mastery` 可以從完好的 `user_word_progress` 重新匯入。

---

## 4. 修改的檔案

### 新增

| 檔案 | 說明 |
|---|---|
| `supabase/migrations/create_lexical_*.sql` ×5（+5 rollback） | DDL 與函式 |
| `supabase/migrations/migrate_*_lexical*.sql` ×3（+3 rollback） | 資料搬移 |
| `supabase/tests/lexical_phase1_test.sql` | 89 條資料層斷言 |
| `src/lib/lexical/types.ts` | zod schema + 型別（DB 邊界唯一入口） |
| `src/lib/lexical/mapper.ts` | **唯一的** 語彙 mapper |
| `src/lib/lexical/attempts.ts` | `recordPracticeAttempt()` 服務 |
| `tests/preview/` | 七頁的 Playwright 驗證 harness（58 條斷言） |
| `vite.preview.config.ts` | harness 專用設定，不參與正式 build |
| `docs/lexical/phase1.md` | 本文件 |

### 修改

| 檔案 | 改了什麼 |
|---|---|
| `src/pages/practice/SRSReview.tsx` | 刪掉本地 mapper；改呼叫 `recordPracticeAttempt`；記 reveal 前時間 |
| `src/pages/practice/QuickQuiz.tsx` | 同上；記 response time（含逾時） |
| `src/pages/practice/Flashcards.tsx` | 同上；曝光與自評分開記 |
| `src/pages/practice/SpellingPractice.tsx` | 同上；記 attempt_count 與 used_hint |
| `src/pages/practice/FillBlank.tsx` | 同上 |
| `src/pages/practice/MatchGame.tsx` | 同上；**誤點開始留紀錄** |
| `src/pages/practice/SynonymAntonym.tsx` | 同上；記這題考同義還是反義 |
| `src/hooks/useUserPacks.ts` | `PackItem` 改由 zod schema 推導；三處查詢改走 `parsePackItems()` |
| `supabase/tests/_local_harness.sql` | 補上 `service_role` 角色與 Supabase 的預設權限行為 |

**七個頁面的 UI 一行都沒改。** 改的只有資料寫入路徑。

### `convertPackItemToVocabularyWord()` 去重

改版前這個函式在 **7 個頁面各有一份**（內容還不一致：只有 Flashcards 與 SRSReview 帶音檔，只有 SRSReview 帶 `pack_id`）。
現在全部 import `src/lib/lexical/mapper.ts` 的 `packItemToVocabularyWord()`，repo 內只剩一份。

---

## 5. Legacy → New 對照

### 字詞本體

| Legacy | New | 對應方式 |
|---|---|---|
| `level_words.id`（TEXT） | `lexical_items.legacy_level_word_id` | 主鍵直接對應，**零字串比對**，全部 `exact_safe_match` |
| `pack_items.id`（UUID） | `lexical_legacy_map(legacy_source='pack_item')` | 見下方合併規則 |
| `level_words.word` 含空白 | `item_type = 'phrase'` | 其餘為 `'word'`。collocation / pattern / expression 這次**不自動判定** |
| `level_words.level/category/tags` | 同名欄位 | 規格沒要求，但不帶過來就是資料遺失，且前端篩選器要用 |
| `level_words.synonyms/antonyms`（text[]） | `lexical_relations` | 見 §Phase 8 規則 |

### pack_items 的合併規則（規格：禁止只靠 display string 無條件 merge）

只有**同時**滿足三個條件才指向既有項目：

1. 正規化 lemma 只命中**一個**候選
2. 兩邊都有非空的 `part_of_speech`
3. 兩邊的 `part_of_speech` 相同（忽略大小寫與空白）

任一項不成立 → **建立新的** `lexical_item`，標記 `ambiguous_match`。

| 分類 | 意義 | 有建立 canonical 項目？ |
|---|---|---|
| `exact_safe_match` | 三個條件全中 | 指向既有 |
| `new_item_created` | 題庫沒有相同 lemma | 建新的 |
| `ambiguous_match` | 多個候選，或詞性缺失／不符 | **建新的**，待人工確認 |
| `manual_review_required` | 資料本身有問題（空字串） | 沒有建立 |

所以 `book`(n. 書) 與 `book`(v. 預訂) 不會被合併；pack 裡沒標詞性的字也不會被合併。兩者都是刻意的 —— 合併之後熟練度會混在一起，而且不可逆。

### 關係匯入規則（Phase 8）

- **唯一命中才建立關係**。0 個或多個候選 → 寫進 `lexical_unresolved_relations`，理由是 `no_match` 或 `ambiguous_match`
- **不自動補反向**。A 的 synonyms 有 B，不代表題庫作者也在 B 的 synonyms 放了 A。自動補等於替原始資料做決定
- 自我參照（A 的 synonyms 含 A）直接略過，不算未解決

### 進度

| Legacy | New | 差異 |
|---|---|---|
| `user_word_progress` | `student_lexical_mastery` | identity 去掉 pack；`BIGINT`（Unix 毫秒）→ `TIMESTAMPTZ` |
| `mastery_level` 0–6 | 相同 | 公式與上下限完全相同 |
| `next_review_time BIGINT` | `next_review_at TIMESTAMPTZ` | 間隔表相同 |
| `review_count` / `correct_count` | 相同 | 見下方 ⚠️ |
| （無） | `lexical_attempts` | 全新，改版前完全不存在 |

⚠️ **`correct_count` 在兩套系統會出現合理的差異**：
SRS 的 hard/easy 與 flashcard 的 Mark as Known，舊系統記成「答對」（`correct_count + 1`），新系統記成 `correct = NULL` 的**自評**（不計入 `correct_count`）。
熟練度的結果完全一樣，差的只是「自己說會」與「考出來會」現在分得開。
舊表的數字**沒有被改變** —— 前端用 `legacyCorrect` 把原本的值原樣送進舊路徑。

---

## 6. Compatibility strategy

### 雙寫，舊路徑優先

```
practice page
   │
   └─→ recordPracticeAttempt(input)
         │
         ├─ 1. applyCompatMastery()        ← 同步。就是既有的
         │      store.updateWordProgress()    updateWordProgress()，一個字沒改。
         │      → user_word_progress          畫面反應時機與改版前一模一樣。
         │
         └─ 2. sendAttempt()               ← 非同步 fire-and-forget
                RPC record_lexical_attempt
                → lexical_attempts
                → student_lexical_mastery     用 lexical_compat_* 兩支函式
                                              （＝同一條公式搬到後端）
```

**新路徑整個壞掉也不影響七個頁面**：
- RPC 失敗 → `console.error`，吞掉
- migration 還沒跑（函式不存在）→ 同上
- legacy id 還沒對應（`manual_review_required`）→ 回 `UNMAPPED`，`console.warn`，不丟錯

### 為什麼舊路徑還留著

規格要求不刪 legacy。更實際的理由：七個頁面的**讀取**端還完全靠 `user_word_progress`
（`getWordsForSRS` / `getDueWords` / `getOverallProgress` 都讀 zustand 的 `wordProgress`）。
這次只接上寫入端；讀取端切換是下一階段的事。

### 職責變化

| | 改版前 | 改版後 |
|---|---|---|
| 顯示題目 | 頁面 | 頁面 |
| 判定對錯 | 頁面 | 頁面 |
| 記錄 attempt | **沒有人做** | `recordPracticeAttempt()` |
| 決定熟練度 | 頁面直接呼叫 store | 相容層（頁面不再碰 `updateWordProgress`） |

七個頁面現在都**沒有 import `updateWordProgress`**。

---

## 7. Migration report

四個分類存在 `lexical_legacy_map.match_method`，查詢：

```sql
SELECT * FROM lexical_migration_report;              -- 分類統計
SELECT * FROM lexical_migration_needs_review;        -- 需要人工看的明細
SELECT * FROM lexical_duplicate_candidates;          -- 同 lemma 多份項目
SELECT * FROM lexical_unresolved_relations_report;   -- 關係未解決統計
SELECT * FROM lexical_progress_coexistence;          -- 新舊進度並存狀況
```

### 測試資料上的實際結果

| legacy_source | match_method | 筆數 |
|---|---|---|
| level_word | exact_safe_match | 7 |
| level_word | manual_review_required | 1 |
| pack_item | exact_safe_match | 2 |
| pack_item | new_item_created | 1 |
| pack_item | ambiguous_match | 2 |
| pack_item | manual_review_required | 1 |

⚠️ **正式環境的數字要跑完才知道。** 因為 `pack_items` 的實際內容不在 repository 內，我無法預估
`ambiguous_match` 會有多少 —— 這取決於老師建 pack 時有沒有填詞性。
沒填詞性的 pack item 一律不會被合併，所以如果 pack 普遍沒填詞性，`ambiguous_match` 會偏多。
**這是刻意的安全方向**，不是 bug。跑完之後查 `lexical_migration_report` 就知道實際分布。

---

## 8. Validation / test 結果

### 8.1 資料層：`supabase/tests/lexical_phase1_test.sql`

**89 條斷言，全數通過。**

```
createdb lex
for f in \
  supabase/tests/_local_harness.sql \
  supabase/schema.sql \
  supabase/migrations/create_user_profiles_table.sql \
  supabase/migrations/create_level_words_table.sql \
  supabase/migrations/create_user_word_progress_table.sql \
  supabase/migrations/unify_word_progress_tracking.sql \
  supabase/migrations/create_user_stats_table.sql \
  supabase/migrations/add_audio_to_pack_items.sql \
  supabase/migrations/add_site_to_user_pack_claims.sql \
  supabase/migrations/add_skill_type_to_packs.sql \
  supabase/migrations/create_lexical_core.sql \
  supabase/migrations/create_lexical_relations.sql \
  supabase/migrations/create_lexical_pack_items.sql \
  supabase/migrations/create_lexical_progress.sql \
  supabase/migrations/create_lexical_rpcs.sql \
  supabase/migrations/migrate_level_words_to_lexical.sql \
  supabase/migrations/migrate_pack_items_to_lexical.sql \
  supabase/migrations/migrate_lexical_relations_from_arrays.sql \
  supabase/migrations/create_lexical_migration_report.sql
do psql -v ON_ERROR_STOP=1 -d lex -f "$f"; done

psql -v ON_ERROR_STOP=1 -d lex -f supabase/tests/lexical_phase1_test.sql
=== 全部通過 ===
```

⚠️ baseline 的這幾支是【測試才需要】的，不是上線步驟 —— 正式環境早就有這些表了。
   本機少跑任何一支，錯誤訊息都只會說「某個欄位不存在」，看不出少的是哪一支，
   所以這裡把實際跑得起來的完整清單列出來，不要再讓人自己拼。

涵蓋：四個 match 分類、冪等性、不合併的證據（C6/C7）、同一 item 跨兩 pack 只有一份 mastery、
關係不猜、相容公式逐條比對、attempt 與 mastery 分離、RLS 跨學生隔離、anon 全擋、舊表未動。

### 8.2 前端：`tests/preview/validate.mjs`

**58 條斷言，全數通過。** 用 Playwright 掛載**真正的**七個頁面（只換掉資料來源），實際點擊作答。

```
npx vite --config vite.preview.config.ts
node tests/preview/validate.mjs
=== 58 PASS / 0 FAIL ===
```

### 8.3 對照規格的十項驗證

| # | 項目 | 結果 |
|---|---|---|
| 1 | 舊 level word Quick Quiz 可正常完成 | ✅ 3 題完整跑完，主控台無錯誤 |
| 2 | 舊 pack Quick Quiz 可正常完成 | ✅ 同上，且 attempt 有帶 `pack_id` |
| 3 | Spelling 正常記錄 attempt | ✅ 含 `attempt_count`、`used_hint`、`response_time_ms` |
| 4 | Fill Blank 正常記錄 attempt | ✅ `skill_dimension = context` |
| 5 | Matching 的 wrong attempt 有留下紀錄 | ✅ 一次誤點對兩個字各留一筆，且 `apply_mastery = false`；舊路徑只被正確配對觸發 |
| 6 | Flashcard exposure 不被誤標為客觀答對 | ✅ `correct = null`、`skill_dimension = self_assessment`、不建立 mastery 列 |
| 7 | Synonym / Antonym 可支援 pack item | ⚠️ **部分完成**，見 §9 第 1 點 |
| 8 | 同一 item 在兩個 pack，mastery 仍只有一份 | ✅ SQL 測試 H3 / I1：三次答對累積到同一列 |
| 9 | legacy progress 沒有消失 | ✅ SQL 測試 S1–S6；前端測試確認舊路徑照常寫入 |
| 10 | RLS 不允許跨學生讀寫 mastery / attempt | ✅ SQL 測試 Q3–Q10、R1–R4 |

### 8.4 其他檢查

| 檢查 | 結果 |
|---|---|
| `tsc --noEmit` | 通過 |
| `npm run build` | 通過（17s） |
| `eslint`（本次改動的 10 個檔案） | **12 problems，與改動前完全相同** —— 沒有引入任何新的 lint 問題 |
| 既有 `writing_phase1_test.sql` | 19 PASS / 1 FAIL（T20），**改動前後完全一致**，與本次無關 |

---

## 9. 尚未解決的 ambiguity / technical debt

1. **同義／反義練習仍然不支援 pack item（驗證第 7 項只完成一半）。**
   canonical 的 `lexical_relations` 已經建好，同一個 `persist` 不論來自 level 還是 pack 都指到同一個 canonical item，關係查得到。
   但七個頁面這次**只改了寫入端，讀取端還沒切換** —— `SynonymAntonym.tsx` 仍然讀 `VocabularyWord.synonyms`，而 pack 來源的那個陣列恆為空。
   要真的支援，必須讓頁面改讀 `lexical_relations`，那是**讀取端遷移**，屬於下一階段。這次刻意不做，因為讀取端一改就等於重做選題邏輯，風險遠高於寫入端。

2. **`ambiguous_match` 會產生重複的 canonical item。**
   這是「寧可重複，不要錯誤合併」的必然代價。`lexical_duplicate_candidates` 視圖列出所有同 lemma 的多份項目，合併需要人工判斷 + 一支尚未撰寫的合併函式（合併時要一併搬 mastery 與 attempt）。

3. **`item_type` 只自動分得出 word / phrase。**
   collocation / pattern / expression 這次完全沒有自動判定 —— 分辨它們需要語言學判斷，猜錯會汙染 canonical 資料。目前它們只能靠後台人工設定（後台 UI 也還沒做）。

4. **`assignment_id` 沒有 FK。**
   目前沒有 canonical 的 assignment 主表（legacy `assignments` 已於 2026-09-18 退役，`learn_tasks` 是另一個模組的概念）。現在硬綁一張表，等真正的 teacher assignment 模型出來就要改。

5. **`pack_item_progress` 仍然是孤兒。**
   它有 DDL 缺失（repo 內沒有），目前只被讀（`useUserPacks` 算已學習 %、`useWeakWords`）、沒有被寫。這次沒有動它。現在系統裡有**三套**進度表並存：`user_word_progress`（在寫）、`pack_item_progress`（沒人寫）、`student_lexical_mastery`（在寫）。

6. **`is_admin()` 仍然硬編碼單一 email。**
   規格要求用既有機制，所以我用了 `is_admin()`，沒有另寫一套 email 比對。但這支函式本身的硬編碼是既有技術債，本次沒有改（也依既有指示不重建它）。

7. **`lexical_items` 的寫入路徑還不存在。**
   Phase 1 的寫入只發生在 migration（以 table owner 身分執行）。RLS 政策已經寫好（admin 可寫），但刻意**沒有發 DML grant** —— 後台編輯介面應該走 SECURITY DEFINER 函式，那支函式還沒寫。

8. **讀取端完全沒有切換。**
   `fetchLevelWords()` 仍然讀 `level_words`，`usePackItems()` 仍然讀 `pack_items`，
   `getWordsForSRS` / `getDueWords` 仍然讀 zustand 裡的 `user_word_progress` 快照。
   `lexical_items` / `student_lexical_mastery` 目前**只寫不讀**。這是刻意的：一次只換一邊。

9. **Production schema 與 repository 不一致的部分。**
   `pack_item_progress`、`pack_images`、`app_admins`、`site_settings` 以及三個 pack RPC 在 repository 內沒有 DDL。
   本次所有 migration **都不碰這些物件**，`migrate_pack_items_to_lexical.sql` 也用 `to_regclass` 守住 `pack_items` 不存在的情況。
   所以這個不一致不影響本次上線，但它還在。

---

## 10. 明確確認：本次沒有做的事

| # | 規格明列不要做 | 確認 |
|---|---|---|
| 1 | 不要重新設計 SRS / mastery formula | ✅ **確認沒有做**。見下方 |
| 2 | 不要做 Daily Mixed Practice | ✅ 沒有 |
| 3 | 不要做 Scheduler | ✅ 沒有。沒有新增任何 cron / 排程 |
| 4 | 不要做 Smart Notification | ✅ 沒有。沒有動 `send-daily-reminders` |
| 5 | 不要做 Weekly Plan | ✅ 沒有 |
| 6 | 不要做 Calendar | ✅ 沒有 |
| 7 | 不要重做 vocabulary UI | ✅ 七個頁面的 JSX 一行沒改 |
| 8 | 不要刪 legacy tables | ✅ 零 DROP、零 ALTER |
| 9 | 不要自行 merge ambiguous lexical items | ✅ 三條件不全中一律另建新項目 |
| 10 | 不要修改 writing / speaking / reading | ✅ 沒有動 `api/`、`supabase/functions/`、任何 `writing_*` / `speaking_*` 檔案 |

### 關於第 1 點

`lexical_compat_review_interval()` 與 `lexical_compat_next_mastery()` 是把
`src/store/vocabularyStore.ts` 裡那段既有 JavaScript **逐條搬到資料庫**：

| | 既有前端 | 新的 SQL 函式 |
|---|---|---|
| forgot | `max(0, 現值 - 2)` | `greatest(0, p_current - 2)` |
| hard | `max(0, 現值 - 1)` | `greatest(0, p_current - 1)` |
| easy / 答對 | `min(6, 現值 + 1)` | `least(6, p_current + 1)` |
| 答錯 | `max(0, 現值 - 1)` | `greatest(0, p_current - 1)` |
| 間隔 | `0 / 10m / 1d / 3d / 7d / 14d / 30d` | 同 |

唯一的差別是時間型別（Unix 毫秒 → `TIMESTAMPTZ`），這是規格明確要求的。

⚠️ 一個照搬的細節：既有程式碼的註解寫 forgot 是「Reset to level 1」，**實際程式碼是 `-2`**。
相容層照**程式碼**搬，不照註解 —— 相容層要相容的是實際行為。
SQL 測試 F1 明確斷言這一點（`3 → 1`）。

搬到後端的理由是規格的「新資料寫入不得只靠前端 local state」與「七個頁面不要再各自直接決定 mastery」，**不是因為演算法要改**。

---

## 11. 安全需求逐項對照

| # | 要求 | 做法 |
|---|---|---|
| 1 | 新表必須有正確 RLS | 7 張表全部 `ENABLE ROW LEVEL SECURITY` + 明確政策。mastery / attempt 是 owner-scoped |
| 2 | 不要 hard-code admin email | 全部用既有的 `is_admin()`。本次沒有新增任何 email 比對 |
| 3 | SECURITY DEFINER 必須設安全 search_path | 五支函式全部 `SET search_path = ''`，內部一律完整限定 `public.xxx` |
| 4 | 寫入不得只靠前端 local state | attempt 與 mastery 都由 `record_lexical_attempt()` 在後端寫入，`student_id` 取自 `auth.uid()`，呼叫端無法指定別人（SQL 測試 Q10） |
| 5 | DB boundary 要有 runtime validation | `src/lib/lexical/types.ts` 的 zod schema；`PackItem` 型別由 schema 推導；三處查詢改走 `parsePackItems()` |
| 6 | 不要再複製 `convertPackItemToVocabularyWord()` | 7 份 → 1 份 |
| 7 | 建立共用 lexical mapper/service | `src/lib/lexical/{types,mapper,attempts}.ts` |
| 8 | migration 必須可 rollback，禁止破壞性 | 9 支各有 rollback，全鏈實測通過，legacy 資料零損失 |

⚠️ **關於 grant**：Supabase 的 `ALTER DEFAULT PRIVILEGES` 會把新表的 ALL 權限直接發給 `anon` / `authenticated`。
每一支 DDL 都點名 `REVOKE ALL ... FROM PUBLIC, anon, authenticated` 再按需要 `GRANT SELECT`。
`service_role` 的 grant **刻意保留** —— 它繞過 RLS 但不繞過 grant，收掉會把後端一起鎖在外面（這是 PR #124 那次抓到的教訓）。
