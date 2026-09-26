# Six-Way Reading 與模考系統的邊界

> 產品決策，2026-09-26。這不是實作偏好，是兩個不同產品流程的分界。

---

## 規則

**閱讀專項訓練與模考系統完全分離。**

### 🛑 reading 不可以引用

| | |
|---|---|
| 資料表 | `exams` · `question_groups` · `group_questions` · `vocabulary_questions` · `translation_questions` · `essay_questions` · `exam_attempts` · `exam_statistics` |
| 型別 | `src/types/exam.ts` |
| 狀態 | `src/store/examStore.ts` |
| 資料存取 | `src/hooks/useExam.ts` |
| 靜態資料 | `src/data/mock-exam.ts` · `mock-exam-list.ts` |
| 頁面 | `src/pages/Exam*.tsx` · `src/pages/admin/Exam*.tsx` |
| 流程 | 模考的作答流程、計分、結果分析 |

反方向同樣成立：**模考不可以引用 `reading_*` 的任何東西。**

### ✅ 可以共用

- auth（`auth.uid()`、`is_admin()`）
- admin shell 與 UI 元件（`src/components/ui/*`）
- Supabase client
- design system
- 一般性的 hooks / utilities

判準很簡單：**共用基礎設施，不共用 domain model。**

---

## reading 自己的八張表

```
reading_passages              文章
reading_questions             題幹與選項
reading_question_keys         正解與解說（學生讀不到）
reading_question_skills       micro-skill（v1 只存）
reading_passage_paragraphs    段落地圖
reading_passage_vocab         三層詞彙
reading_sessions              一次練習
reading_attempts              逐題作答
```

---

## 為什麼需要特別寫下來

`question_groups` 的 `groupType` 有一個值就是 `'reading'`，而且它的結構乍看之下正是這件事需要的東西：

```
question_groups   content（文章）· contentTranslation · articleType · topicTags
group_questions   optionA–D · correctAnswer · explanation
```

所以**很容易**有人日後為了「不要重複造輪子」而把兩邊接起來。那個念頭是善意的，但代價是：**一個產品的改動會變成兩個產品的風險。** 模考要加一個題型、閱讀要改一個欄位，兩邊都得一起想。

而且那個相似只到表面為止。reading 需要而 `question_groups` 沒有的東西：

- `construct`（Six Ways 的六個穩定短碼）
- `micro_skills`
- `content_family` / `subdomain` / `narrative_archetype` / `geography` / `time_period` / `fame_level`
- 段落地圖與三層詞彙
- 逐題的 `response_time_ms` / `answer_change_count` / `first_answer`
- 答案與題幹分離

反過來，`question_groups` 有而 reading 用不到的：`structureOptionA`–`E`、`blankNumber`、`mixedType`、`score`、以及 `exam_id` 這個必要外鍵 —— 閱讀練習不是一份考卷。

---

## 順帶：那條路今天也走不通

即使不談產品邊界，技術上也接不起來：

| | |
|---|---|
| `question_groups` 在 repo 裡**沒有 DDL** | production 有、版控沒有。要改它就是在對一張看不到定義的表下 ALTER |
| 模考的**學生端不讀資料庫** | `ExamNew.tsx` / `ExamResult.tsx` 的 supabase 呼叫數是 **0**。它們讀 `src/data/mock-exam.ts` 的靜態資料，作答存在 zustand 的 localStorage |
| `useExam.ts`（含 `exam_attempts` 讀寫）**只被兩個後台頁面 import** | 學生做完模考，資料庫一筆都沒有 |

所以「沿用模考的作答與計分」實際上等於「沿用一套沒有在用的東西」。

---

## 檢查方式

```bash
# reading 的程式碼不可以出現任何模考的引用
grep -rn "exam\|Exam\|question_group\|mock" \
  src/lib/reading/ scripts/reading-*.ts \
  supabase/migrations/create_reading_*.sql supabase/tests/reading_phase1_test.sql
```

⚠️ 會有一個誤判：`example_function` 這個 micro-skill 代號裡含有 `exam`。除此之外應該是空的。

2026-09-26 執行結果：**零引用**（只有上述那一個誤判）。
