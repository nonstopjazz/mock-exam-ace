# 📚 字卡資料匯入系統

## 🎯 目標

讓你能夠請 **DeepSeek 生成 5545 個學測單字**，並且**一鍵匯入到網站資料庫**，無需手動調整格式。

---

## 📁 相關文件

| 文件 | 用途 | 適合對象 |
|------|------|---------|
| **[QUICK_START.md](./QUICK_START.md)** | 快速上手指南（1 分鐘） | ⭐ 想快速開始的使用者 |
| **[DEEPSEEK_PROMPT.md](./DEEPSEEK_PROMPT.md)** | 給 DeepSeek 的提示詞 | 需要提供給 AI 生成資料 |
| **[VOCABULARY_IMPORT_GUIDE.md](./VOCABULARY_IMPORT_GUIDE.md)** | 完整使用指南 | 需要詳細說明的使用者 |
| **[scripts/import-vocabulary.ts](./scripts/import-vocabulary.ts)** | 匯入腳本原始碼 | 開發者 |

---

## ⚡ 快速開始

### 步驟 1：請 DeepSeek 生成資料

複製 [`DEEPSEEK_PROMPT.md`](./DEEPSEEK_PROMPT.md) 的內容給 DeepSeek：

```
請依照這個規格生成 5545 個學測英文單字的 JSON 資料
```

### 步驟 2：儲存並匯入

```bash
# 將 DeepSeek 生成的檔案儲存到
data/gsat_5545_vocabulary.json

# 安裝必要套件（僅第一次）
npm install csv-parse

# 執行匯入
npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json
```

### 步驟 3：在元件中使用

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 5545 個單字立即可用！
console.log(vocabularyWords.length); // 5545
```

---

## 📊 資料結構設計

基於網站的三個字卡功能：

### 1️⃣ SRS 智慧複習
- 需要：word, ipa, translation, example, exampleTranslation, level
- 使用間隔重複演算法（Spaced Repetition）

### 2️⃣ 翻轉卡片
- 需要：word, ipa, translation, example, synonyms, antonyms, level
- 3D 翻轉動畫展示

### 3️⃣ 快速測驗
- 需要：word, translation, options（自動生成）
- 限時挑戰 + 連擊系統

### 完整欄位定義

```typescript
interface VocabularyWord {
  // === 核心欄位（必填）===
  id: string;                    // 唯一識別碼
  word: string;                  // 英文單字
  ipa: string;                   // 音標（/.../ 格式）
  translation: string;           // 中文翻譯
  example: string;               // 英文例句
  exampleTranslation: string;    // 例句翻譯
  level: number;                 // 熟練度（1-5）

  // === 進階欄位（建議填寫）===
  synonyms: string[];            // 同義詞
  antonyms: string[];            // 反義詞
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  partOfSpeech?: string;         // 詞性（n./v./adj.）
  category?: string;             // 分類
  tags?: string[];               // 標籤（["學測", "Level X"]）
}
```

---

## 🧪 測試範例

我們準備了 10 個單字的測試檔案：

```bash
# 測試匯入流程
npm run import-vocabulary -- --file data/vocabulary-example.json

# 預期輸出
✅ 資料驗證通過
📊 總字數：10
🎉 匯入完成！
```

測試檔案位置：[`data/vocabulary-example.json`](./data/vocabulary-example.json)

---

## 📈 匯入統計範例

匯入成功後會顯示完整統計：

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
   - adv.: 345 個

✨ 資料完整度：
   - 有同義詞: 5400 個 (97.4%)
   - 有反義詞: 4200 個 (75.7%)
   - 有標籤: 5545 個 (100.0%)
```

---

## 🔧 技術細節

### 匯入腳本功能

✅ **自動驗證**
- 檢查必填欄位
- 驗證資料格式（音標、level 範圍、difficulty 值）
- ID 唯一性檢查
- 總字數一致性驗證

✅ **多格式支援**
- JSON（推薦）
- CSV（備選）

✅ **TypeScript 生成**
- 自動產生型別定義
- 匯出 `vocabularyPack` 和 `vocabularyWords`
- 包含完整的 JSDoc 註解

✅ **詳細統計**
- 難度分布
- 詞性分布
- 資料完整度分析

### 專案結構

```
mock-exam-ace/
├── 📂 data/                         # 原始資料
│   ├── vocabulary-example.json      # 測試範例（10 個單字）
│   └── gsat_5545_vocabulary.json    # DeepSeek 生成的完整資料
│
├── 📂 scripts/
│   └── import-vocabulary.ts         # 匯入腳本（含驗證邏輯）
│
├── 📂 src/
│   ├── 📂 data/
│   │   └── vocabulary-imported.ts   # 自動生成的 TS 檔案
│   └── 📂 pages/practice/
│       ├── Flashcards.tsx           # 翻轉卡片
│       ├── SRSReview.tsx            # SRS 智慧複習
│       └── QuickQuiz.tsx            # 快速測驗
│
├── 📄 DEEPSEEK_PROMPT.md           # DeepSeek 提示詞（完整版）
├── 📄 VOCABULARY_IMPORT_GUIDE.md   # 完整使用指南
├── 📄 QUICK_START.md               # 快速開始（1 分鐘上手）
└── 📄 README_VOCABULARY.md         # 本文件（總覽）
```

---

## 🎨 在元件中的使用範例

### 翻轉卡片（Flashcards.tsx）

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 原本的 mockFlashcards
const mockFlashcards = [ /* ... */ ];

// 替換為真實資料
const flashcards = vocabularyWords;

// 或者依難度篩選
const beginnerCards = vocabularyWords.filter(w => w.difficulty === 'beginner');
```

### SRS 智慧複習（SRSReview.tsx）

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

const srsCards = vocabularyWords.map(word => ({
  ...word,
  nextReview: '立即複習' // 初始值
}));

// 儲存到狀態
const [cards, setCards] = useState(srsCards);
```

### 快速測驗（QuickQuiz.tsx）

```typescript
import { vocabularyWords } from '@/data/vocabulary-imported';

// 自動生成測驗題目
function generateQuizQuestions(words: VocabularyWord[], count: number) {
  const shuffled = [...words].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count).map(word => {
    const wrongOptions = shuffled
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

const quizQuestions = generateQuizQuestions(vocabularyWords, 20);
```

---

## ✅ 優點

### 對你而言
- ✨ **零手動調整**：DeepSeek 產出即可直接匯入
- ⚡ **一鍵匯入**：單一指令完成所有工作
- 📊 **自動驗證**：確保資料品質
- 🔄 **可重複使用**：支援資料更新

### 對 DeepSeek 而言
- 📋 **明確規格**：提示詞包含完整的欄位說明和範例
- 🎯 **清晰格式**：JSON 或 CSV 兩種選擇
- ✅ **易於生成**：結構化的資料格式

### 對系統而言
- 🎨 **三功能通用**：同一份資料支援所有字卡功能
- 💪 **型別安全**：TypeScript 介面定義
- 📦 **模組化**：匯入後可在任何元件使用

---

## ❓ 常見問題

### Q1：匯入失敗怎麼辦？
腳本會顯示詳細錯誤訊息，例如：
```
❌ 第 100 筆資料缺少必填欄位: exampleTranslation
```
根據錯誤修正後重新匯入即可。

### Q2：支援 CSV 嗎？
支援！但建議用 JSON：
- 陣列（synonyms/antonyms）更清晰
- 不需要特殊分隔符
- DeepSeek 生成 JSON 也很方便

### Q3：可以分批匯入嗎？
可以！合併 JSON 後一起匯入：
```json
{
  "vocabularyPack": { /* ... */ },
  "words": [
    /* 批次 1 */,
    /* 批次 2 */
  ]
}
```

### Q4：如何更新資料？
修改原始 JSON 檔案後重新執行匯入指令即可。

---

## 🚀 立即開始

1. 📖 閱讀 [QUICK_START.md](./QUICK_START.md) 快速上手
2. 📋 複製 [DEEPSEEK_PROMPT.md](./DEEPSEEK_PROMPT.md) 給 DeepSeek
3. 💾 儲存生成的 JSON 到 `data/gsat_5545_vocabulary.json`
4. ⚡ 執行 `npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json`
5. ✅ 在元件中使用 `import { vocabularyWords } from '@/data/vocabulary-imported'`

**三分鐘完成，5545 個單字立即可用！** 🎉

---

## 📞 需要幫助？

- 詳細說明：[VOCABULARY_IMPORT_GUIDE.md](./VOCABULARY_IMPORT_GUIDE.md)
- DeepSeek 提示詞：[DEEPSEEK_PROMPT.md](./DEEPSEEK_PROMPT.md)
- 快速開始：[QUICK_START.md](./QUICK_START.md)

祝你匯入順利！📚✨
