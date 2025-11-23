# 🚀 快速開始：DeepSeek 單字匯入

## 一分鐘上手

### 1️⃣ 給 DeepSeek 的提示詞

將 [`DEEPSEEK_PROMPT.md`](./DEEPSEEK_PROMPT.md) 的內容複製貼上給 DeepSeek，告訴它：

```
請依照這個規格生成 5545 個學測英文單字的 JSON 資料
```

---

### 2️⃣ 取得檔案並匯入

DeepSeek 生成後，將檔案儲存到 `data/` 目錄：

```bash
# 儲存檔案
data/gsat_5545_vocabulary.json

# 執行匯入（僅第一次需要安裝套件）
npm install csv-parse
npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json
```

---

### 3️⃣ 完成！

匯入成功後會生成：
```
src/data/vocabulary-imported.ts
```

在你的元件中使用：

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 直接使用，包含 5545 個單字！
console.log(vocabularyWords.length); // 5545
```

---

## 📊 資料格式範例

DeepSeek 應該生成這樣的 JSON：

```json
{
  "vocabularyPack": {
    "id": "PACK_GSAT_5545",
    "title": "學測核心 5545 單字",
    "totalWords": 5545
  },
  "words": [
    {
      "id": "1",
      "word": "abandon",
      "ipa": "/əˈbændən/",
      "translation": "放棄、遺棄",
      "partOfSpeech": "v.",
      "example": "They had to abandon their home.",
      "exampleTranslation": "他們不得不放棄家園。",
      "synonyms": ["desert", "forsake"],
      "antonyms": ["keep", "maintain"],
      "difficulty": "intermediate",
      "level": 1,
      "tags": ["學測", "Level 4"]
    }
  ]
}
```

---

## ✅ 必填欄位檢查表

確保每個單字包含：

- [x] **id** - 流水號（"1", "2", ...）
- [x] **word** - 英文單字
- [x] **ipa** - 音標（格式：`/.../)
- [x] **translation** - 中文翻譯
- [x] **example** - 英文例句
- [x] **exampleTranslation** - 例句中文翻譯
- [x] **synonyms** - 同義詞陣列
- [x] **antonyms** - 反義詞陣列
- [x] **difficulty** - beginner/intermediate/advanced
- [x] **level** - 熟練度（初始值 1）
- [x] **partOfSpeech** - 詞性（v./n./adj./adv.）
- [x] **tags** - 標籤陣列（["學測", "Level X"]）

---

## 🧪 測試匯入流程

我們已經準備好測試檔案：

```bash
# 測試匯入（使用範例資料：10 個單字）
npm run import-vocabulary -- --file data/vocabulary-example.json

# 檢查生成的檔案
cat src/data/vocabulary-imported.ts
```

**預期結果**：
```
✅ 資料驗證通過
📊 總字數：10
🎉 匯入完成！
```

---

## 📂 檔案結構

```
mock-exam-ace/
├── data/
│   ├── vocabulary-example.json      ← 測試用範例（10 個單字）
│   └── gsat_5545_vocabulary.json    ← DeepSeek 生成的完整資料（5545 個）
├── scripts/
│   └── import-vocabulary.ts         ← 匯入腳本
├── src/data/
│   └── vocabulary-imported.ts       ← 自動生成的 TS 檔案
├── DEEPSEEK_PROMPT.md              ← 給 DeepSeek 的完整提示詞
├── VOCABULARY_IMPORT_GUIDE.md      ← 詳細使用指南
└── QUICK_START.md                  ← 本文件
```

---

## 🔧 在元件中使用

### 翻轉卡片 (Flashcards.tsx)

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 直接替換 mockFlashcards
const flashcards = vocabularyWords;
```

### SRS 智慧複習 (SRSReview.tsx)

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

const srsCards = vocabularyWords.map(word => ({
  ...word,
  nextReview: '立即複習' // 初始值
}));
```

### 快速測驗 (QuickQuiz.tsx)

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 自動生成測驗題目
function generateQuiz(words: VocabularyWord[], count: number) {
  return words.slice(0, count).map(word => {
    const wrongOptions = words
      .filter(w => w.id !== word.id)
      .slice(0, 3)
      .map(w => w.translation);

    const allOptions = [word.translation, ...wrongOptions]
      .sort(() => Math.random() - 0.5);

    return {
      id: word.id,
      word: word.word,
      options: allOptions,
      correctAnswer: allOptions.indexOf(word.translation),
      ipa: word.ipa
    };
  });
}

const quizQuestions = generateQuiz(vocabularyWords, 20);
```

---

## 🎯 匯入後的統計範例

```
📊 ===== 匯入統計 =====

📦 單字包：學測核心 5545 單字
📝 總字數：5545
👤 作者：DeepSeek AI
📅 發布日期：2025-11-23

🎯 難度分布：
   - 初級 (beginner): 1500 個
   - 中級 (intermediate): 2500 個
   - 高級 (advanced): 1545 個

📚 詞性分布：
   - n.: 2200 個
   - v.: 1800 個
   - adj.: 1000 個

✨ 資料完整度：
   - 有同義詞: 5400 個 (97.4%)
   - 有反義詞: 4200 個 (75.7%)
   - 有標籤: 5545 個 (100.0%)
```

---

## ❓ 常見問題

### Q: 匯入失敗怎麼辦？
**A**: 腳本會顯示詳細的錯誤訊息，例如：
```
❌ 資料驗證失敗：
   - 第 100 筆資料缺少必填欄位: exampleTranslation
   - 第 250 筆資料的 level 必須在 1-5 之間
```
根據錯誤修正資料後重新匯入即可。

### Q: 支援 CSV 格式嗎？
**A**: 支援！但建議使用 JSON，因為：
- 支援陣列（synonyms/antonyms）更清晰
- 不需要處理分隔符（CSV 需要用 `|` 分隔陣列）
- DeepSeek 生成 JSON 也很方便

```bash
# CSV 匯入範例
npm run import-vocabulary -- --file data/gsat_5545_vocabulary.csv
```

### Q: 如何更新部分單字？
**A**: 修改原始 JSON 檔案後重新執行匯入指令，會自動覆寫生成的 TS 檔案。

---

## 📚 延伸閱讀

- [DEEPSEEK_PROMPT.md](./DEEPSEEK_PROMPT.md) - 給 DeepSeek 的完整提示詞
- [VOCABULARY_IMPORT_GUIDE.md](./VOCABULARY_IMPORT_GUIDE.md) - 詳細使用指南
- [scripts/import-vocabulary.ts](./scripts/import-vocabulary.ts) - 匯入腳本原始碼

---

## ✨ 總結

三步驟完成匯入：

1. 📋 複製 `DEEPSEEK_PROMPT.md` 給 DeepSeek
2. 💾 儲存 JSON 到 `data/gsat_5545_vocabulary.json`
3. ⚡ 執行 `npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json`

**零手動調整，DeepSeek 產出即可直接匯入！** 🎉

---

有任何問題請查看 [VOCABULARY_IMPORT_GUIDE.md](./VOCABULARY_IMPORT_GUIDE.md) 取得更多資訊。
