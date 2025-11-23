# 📚 字卡資料匯入指南

## 🎯 目標

讓 DeepSeek 生成的 5545 個學測單字能夠**一鍵匯入**到字卡系統，無需手動調整格式。

---

## 📋 完整流程

### 步驟 1：準備 DeepSeek 提示詞

將 [`DEEPSEEK_PROMPT.md`](./DEEPSEEK_PROMPT.md) 的內容提供給 DeepSeek，要求它生成 5545 個單字的資料。

**推薦格式**：JSON（支援完整資料結構）

### 步驟 2：取得生成的檔案

DeepSeek 生成後，將檔案儲存到專案中：

```bash
# 建議路徑
/mock-exam-ace/data/gsat_5545_vocabulary.json
```

或

```bash
/mock-exam-ace/data/gsat_5545_vocabulary.csv
```

### 步驟 3：安裝必要套件（僅第一次）

```bash
npm install csv-parse
```

### 步驟 4：執行匯入腳本

```bash
# JSON 匯入（推薦）
npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json

# CSV 匯入
npm run import-vocabulary -- --file data/gsat_5545_vocabulary.csv

# 自訂輸出路徑
npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json --output src/data/my-vocabulary.ts
```

### 步驟 5：檢查生成的 TypeScript 檔案

匯入成功後，會在 `src/data/` 目錄生成：

```
src/data/vocabulary-imported.ts
```

檔案內容範例：

```typescript
export interface VocabularyWord {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  // ... 其他欄位
}

export const vocabularyPack: VocabularyPack = { /* ... */ };
export const vocabularyWords: VocabularyWord[] = [ /* 5545 筆資料 */ ];
```

### 步驟 6：在元件中使用真實資料

#### 6.1 翻轉卡片 (Flashcards.tsx)

**原本**（模擬資料）：
```typescript
const mockFlashcards: FlashcardData[] = [
  // 手寫的模擬資料
];
```

**替換為**（真實資料）：
```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 轉換資料格式（如果欄位名稱不同）
const flashcards: FlashcardData[] = vocabularyWords.map(word => ({
  id: word.id,
  word: word.word,
  ipa: word.ipa,
  translation: word.translation,
  example: word.example,
  synonyms: word.synonyms,
  antonyms: word.antonyms,
  level: word.level
}));
```

#### 6.2 SRS 智慧複習 (SRSReview.tsx)

**原本**：
```typescript
const mockCards: VocabularyCard[] = [
  // 模擬資料
];
```

**替換為**：
```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

const srsCards: VocabularyCard[] = vocabularyWords.map(word => ({
  id: word.id,
  word: word.word,
  ipa: word.ipa,
  translation: word.translation,
  example: word.example,
  exampleTranslation: word.exampleTranslation,
  level: word.level,
  nextReview: '立即複習' // 初始值
}));
```

#### 6.3 快速測驗 (QuickQuiz.tsx)

快速測驗需要自動生成選項，建議使用以下函數：

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

function generateQuizQuestions(words: VocabularyWord[], count: number): QuizQuestion[] {
  const shuffled = [...words].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count).map(word => {
    // 隨機選擇 3 個錯誤選項
    const wrongOptions = shuffled
      .filter(w => w.id !== word.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => w.translation);

    // 組合所有選項並隨機排序
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

// 使用
const quizQuestions = generateQuizQuestions(vocabularyWords, 20);
```

---

## 📊 資料結構對照表

### JSON 格式（推薦）

```json
{
  "vocabularyPack": {
    "id": "PACK_GSAT_5545",
    "title": "學測核心 5545 單字",
    "theme": "學測必備單字",
    "description": "完整收錄學測必考單字",
    "difficulty": "mixed",
    "totalWords": 5545,
    "author": "DeepSeek AI",
    "datePublished": "2025-11-23"
  },
  "words": [
    {
      "id": "1",
      "word": "abandon",
      "ipa": "/əˈbændən/",
      "translation": "放棄、遺棄",
      "partOfSpeech": "v.",
      "example": "They had to abandon their home due to the flood.",
      "exampleTranslation": "由於洪水，他們不得不放棄家園。",
      "synonyms": ["desert", "forsake", "give up"],
      "antonyms": ["keep", "maintain", "continue"],
      "difficulty": "intermediate",
      "category": "動詞",
      "level": 1,
      "tags": ["學測", "Level 4", "生活"]
    }
  ]
}
```

### CSV 格式（備選）

```csv
id,word,ipa,translation,partOfSpeech,example,exampleTranslation,synonyms,antonyms,difficulty,category,level,tags
1,abandon,/əˈbændən/,放棄、遺棄,v.,They had to abandon their home due to the flood.,由於洪水他們不得不放棄家園。,desert|forsake|give up,keep|maintain|continue,intermediate,動詞,1,學測|Level 4|生活
```

**注意**：
- 陣列欄位使用 `|` 分隔（如 `synonyms`、`antonyms`、`tags`）
- 若欄位包含逗號，需用雙引號包覆

---

## 🔍 匯入腳本功能說明

### 自動驗證

腳本會自動檢查：

- ✅ 所有必填欄位是否存在
- ✅ `level` 範圍是否在 1-5 之間
- ✅ `difficulty` 是否為 `beginner`/`intermediate`/`advanced`
- ✅ 音標格式是否正確（`/.../ 格式`）
- ✅ ID 是否唯一
- ✅ `totalWords` 是否與實際數量一致

### 統計報告

匯入完成後會顯示：

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
   - adv.: 400 個
   ...

✨ 資料完整度：
   - 有同義詞: 5400 個 (97.4%)
   - 有反義詞: 4200 個 (75.7%)
   - 有標籤: 5545 個 (100.0%)
```

---

## ❗ 常見問題

### Q1：匯入失敗怎麼辦？

**A1**：檢查錯誤訊息，腳本會列出所有驗證失敗的項目，例如：

```
❌ 資料驗證失敗：
   - 第 100 筆資料缺少必填欄位: exampleTranslation
   - 第 250 筆資料的 level 必須在 1-5 之間（目前：7）
   - 第 500 筆資料的音標格式不正確（應為 /.../ 格式）: əˈbændən
```

根據錯誤訊息修正資料後重新匯入。

### Q2：CSV 和 JSON 哪個比較好？

**A2**：建議使用 **JSON 格式**，因為：
- 支援陣列（同反義詞）無需分隔符
- 資料結構更清晰
- 避免 CSV 的跳脫字元問題
- DeepSeek 生成 JSON 也很方便

### Q3：如何更新部分資料？

**A3**：
1. 修改原始的 JSON/CSV 檔案
2. 重新執行匯入腳本
3. 腳本會覆寫之前生成的 TypeScript 檔案

### Q4：能否分批匯入？

**A4**：可以！將不同批次的資料合併成一個檔案即可：

```typescript
// 方法一：手動合併 JSON
{
  "vocabularyPack": { /* ... */ },
  "words": [
    /* 批次 1 的單字 */,
    /* 批次 2 的單字 */
  ]
}

// 方法二：程式化合併
import batch1 from './batch1';
import batch2 from './batch2';

const allWords = [...batch1.words, ...batch2.words];
```

### Q5：匯入後如何測試？

**A5**：
1. 檢查生成的 `.ts` 檔案是否有語法錯誤
2. 在元件中匯入並使用 `console.log` 確認資料正確
3. 執行 `npm run dev` 開啟開發伺服器
4. 訪問 `/practice/vocabulary/flashcards` 查看字卡是否正確顯示

---

## 🚀 進階使用

### 自訂資料轉換

如果 DeepSeek 生成的欄位名稱與系統不同，可以在匯入後手動調整：

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 轉換欄位名稱
const convertedWords = vocabularyWords.map(word => ({
  ...word,
  // 如果 DeepSeek 使用 "meaning" 而不是 "translation"
  translation: word.meaning || word.translation
}));
```

### 過濾特定難度

```typescript
// 只匯入高級單字
const advancedWords = vocabularyWords.filter(w => w.difficulty === 'advanced');
```

### 依主題分類

```typescript
// 根據標籤分組
const wordsByTheme = vocabularyWords.reduce((acc, word) => {
  word.tags?.forEach(tag => {
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(word);
  });
  return acc;
}, {} as Record<string, VocabularyWord[]>);

// 使用：取得「科技」主題的單字
const techWords = wordsByTheme['科技'];
```

---

## 📂 專案結構

```
mock-exam-ace/
├── data/                              # 原始資料檔案
│   ├── gsat_5545_vocabulary.json      # DeepSeek 生成的 JSON
│   └── gsat_5545_vocabulary.csv       # （備選）CSV 格式
├── scripts/
│   └── import-vocabulary.ts           # 匯入腳本
├── src/
│   ├── data/
│   │   └── vocabulary-imported.ts     # 自動生成的 TypeScript 檔案
│   └── pages/practice/
│       ├── Flashcards.tsx             # 翻轉卡片（使用匯入資料）
│       ├── SRSReview.tsx              # SRS 複習（使用匯入資料）
│       └── QuickQuiz.tsx              # 快速測驗（使用匯入資料）
├── DEEPSEEK_PROMPT.md                 # DeepSeek 提示詞
├── VOCABULARY_IMPORT_GUIDE.md         # 本指南
└── package.json
```

---

## ✅ 檢查清單

匯入前：
- [ ] 已將 `DEEPSEEK_PROMPT.md` 提供給 DeepSeek
- [ ] DeepSeek 已生成 JSON 或 CSV 檔案
- [ ] 檔案已儲存到 `data/` 目錄
- [ ] 已執行 `npm install csv-parse`（使用 CSV 時）

匯入時：
- [ ] 執行匯入腳本無錯誤
- [ ] 統計報告數據正確（總字數 5545）
- [ ] 資料完整度符合預期

匯入後：
- [ ] 檢查 `src/data/vocabulary-imported.ts` 檔案
- [ ] 在元件中替換模擬資料
- [ ] 執行 `npm run dev` 測試功能
- [ ] 三個功能（SRS、翻轉卡片、快速測驗）都能正常運作

---

## 🎯 總結

使用此匯入流程，你只需：

1. 📝 複製 `DEEPSEEK_PROMPT.md` 給 DeepSeek
2. 💾 儲存生成的 JSON 檔案
3. ⚡ 執行 `npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json`
4. ✅ 在元件中使用 `import { vocabularyWords } from '@/data/vocabulary-imported'`

**零手動調整**，DeepSeek 產出即可直接匯入！🎉

---

## 📞 需要協助？

如有問題，請查看：
- 匯入腳本輸出的錯誤訊息
- 本指南的「常見問題」章節
- TypeScript 型別定義（在生成的檔案中）

祝你匯入順利！📚✨
