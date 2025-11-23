/**
 * 字卡資料匯入腳本
 * 用途：將 DeepSeek 生成的 JSON/CSV 格式單字資料匯入系統
 *
 * 使用方式：
 * 1. JSON 匯入：npm run import-vocabulary -- --file gsat_5545_vocabulary.json
 * 2. CSV 匯入：npm run import-vocabulary -- --file gsat_5545_vocabulary.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// ===== 型別定義 =====

interface VocabularyWord {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  partOfSpeech?: string;
  example: string;
  exampleTranslation: string;
  synonyms: string[];
  antonyms: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  level: number;
  tags?: string[];
}

interface VocabularyPack {
  id: string;
  title: string;
  theme: string;
  description: string;
  difficulty: string;
  totalWords: number;
  author: string;
  datePublished: string;
}

interface VocabularyData {
  vocabularyPack: VocabularyPack;
  words: VocabularyWord[];
}

// ===== 驗證函數 =====

function validateWord(word: any, index: number): string[] {
  const errors: string[] = [];
  const requiredFields = ['id', 'word', 'ipa', 'translation', 'example', 'exampleTranslation', 'level'];

  requiredFields.forEach(field => {
    if (!word[field]) {
      errors.push(`第 ${index + 1} 筆資料缺少必填欄位: ${field}`);
    }
  });

  // 驗證 level 範圍
  if (word.level && (word.level < 1 || word.level > 5)) {
    errors.push(`第 ${index + 1} 筆資料的 level 必須在 1-5 之間（目前：${word.level}）`);
  }

  // 驗證 difficulty
  if (word.difficulty && !['beginner', 'intermediate', 'advanced'].includes(word.difficulty)) {
    errors.push(`第 ${index + 1} 筆資料的 difficulty 必須是 beginner/intermediate/advanced（目前：${word.difficulty}）`);
  }

  // 驗證音標格式
  if (word.ipa && !word.ipa.match(/^\/.*\/$/)) {
    errors.push(`第 ${index + 1} 筆資料的音標格式不正確（應為 /.../ 格式）: ${word.ipa}`);
  }

  return errors;
}

function validateData(data: VocabularyData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 驗證資料包基本資訊
  if (!data.vocabularyPack) {
    errors.push('缺少 vocabularyPack 資訊');
  }

  if (!data.words || !Array.isArray(data.words)) {
    errors.push('缺少 words 陣列或格式錯誤');
    return { isValid: false, errors };
  }

  // 驗證總字數
  if (data.vocabularyPack && data.vocabularyPack.totalWords !== data.words.length) {
    errors.push(`totalWords (${data.vocabularyPack.totalWords}) 與實際單字數量 (${data.words.length}) 不符`);
  }

  // 驗證每個單字
  data.words.forEach((word, index) => {
    const wordErrors = validateWord(word, index);
    errors.push(...wordErrors);
  });

  // 驗證 ID 唯一性
  const ids = new Set(data.words.map(w => w.id));
  if (ids.size !== data.words.length) {
    errors.push('存在重複的 ID');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// ===== 匯入函數 =====

function importJSON(filePath: string): VocabularyData {
  console.log(`📖 正在讀取 JSON 檔案: ${filePath}`);

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const data: VocabularyData = JSON.parse(fileContent);

  return data;
}

function importCSV(filePath: string): VocabularyData {
  console.log(`📖 正在讀取 CSV 檔案: ${filePath}`);

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  // 轉換 CSV 資料為標準格式
  const words: VocabularyWord[] = records.map((record: any) => ({
    id: record.id,
    word: record.word,
    ipa: record.ipa,
    translation: record.translation,
    partOfSpeech: record.partOfSpeech || undefined,
    example: record.example,
    exampleTranslation: record.exampleTranslation,
    synonyms: record.synonyms ? record.synonyms.split('|').map((s: string) => s.trim()) : [],
    antonyms: record.antonyms ? record.antonyms.split('|').map((s: string) => s.trim()) : [],
    difficulty: record.difficulty as 'beginner' | 'intermediate' | 'advanced',
    category: record.category || undefined,
    level: parseInt(record.level) || 1,
    tags: record.tags ? record.tags.split('|').map((s: string) => s.trim()) : []
  }));

  // 建立預設的 vocabularyPack 資訊
  const vocabularyPack: VocabularyPack = {
    id: `PACK_${Date.now()}`,
    title: '匯入的單字包',
    theme: '自訂單字包',
    description: `從 CSV 匯入的 ${words.length} 個單字`,
    difficulty: 'mixed',
    totalWords: words.length,
    author: 'CSV Import',
    datePublished: new Date().toISOString().split('T')[0]
  };

  return { vocabularyPack, words };
}

// ===== 輸出函數 =====

function exportToTypeScript(data: VocabularyData, outputPath: string): void {
  console.log(`💾 正在生成 TypeScript 檔案: ${outputPath}`);

  const tsContent = `/**
 * 自動生成的字卡資料
 * 生成時間: ${new Date().toISOString()}
 * 總字數: ${data.words.length}
 */

export interface VocabularyWord {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  partOfSpeech?: string;
  example: string;
  exampleTranslation: string;
  synonyms: string[];
  antonyms: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  level: number;
  tags?: string[];
}

export interface VocabularyPack {
  id: string;
  title: string;
  theme: string;
  description: string;
  difficulty: string;
  totalWords: number;
  author: string;
  datePublished: string;
}

export const vocabularyPack: VocabularyPack = ${JSON.stringify(data.vocabularyPack, null, 2)};

export const vocabularyWords: VocabularyWord[] = ${JSON.stringify(data.words, null, 2)};

export default {
  vocabularyPack,
  words: vocabularyWords
};
`;

  fs.writeFileSync(outputPath, tsContent, 'utf-8');
  console.log(`✅ TypeScript 檔案已生成: ${outputPath}`);
}

function exportStatistics(data: VocabularyData): void {
  console.log('\n📊 ===== 匯入統計 =====\n');

  // 基本統計
  console.log(`📦 單字包：${data.vocabularyPack.title}`);
  console.log(`📝 總字數：${data.words.length}`);
  console.log(`👤 作者：${data.vocabularyPack.author}`);
  console.log(`📅 發布日期：${data.vocabularyPack.datePublished}\n`);

  // 難度分布
  const difficultyCount = {
    beginner: 0,
    intermediate: 0,
    advanced: 0
  };

  data.words.forEach(word => {
    if (word.difficulty) {
      difficultyCount[word.difficulty]++;
    }
  });

  console.log('🎯 難度分布：');
  console.log(`   - 初級 (beginner): ${difficultyCount.beginner} 個`);
  console.log(`   - 中級 (intermediate): ${difficultyCount.intermediate} 個`);
  console.log(`   - 高級 (advanced): ${difficultyCount.advanced} 個\n`);

  // 詞性分布
  const posCount: { [key: string]: number } = {};
  data.words.forEach(word => {
    if (word.partOfSpeech) {
      posCount[word.partOfSpeech] = (posCount[word.partOfSpeech] || 0) + 1;
    }
  });

  console.log('📚 詞性分布：');
  Object.entries(posCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pos, count]) => {
      console.log(`   - ${pos}: ${count} 個`);
    });
  console.log('');

  // 資料完整度
  const withSynonyms = data.words.filter(w => w.synonyms && w.synonyms.length > 0).length;
  const withAntonyms = data.words.filter(w => w.antonyms && w.antonyms.length > 0).length;
  const withTags = data.words.filter(w => w.tags && w.tags.length > 0).length;

  console.log('✨ 資料完整度：');
  console.log(`   - 有同義詞: ${withSynonyms} 個 (${(withSynonyms / data.words.length * 100).toFixed(1)}%)`);
  console.log(`   - 有反義詞: ${withAntonyms} 個 (${(withAntonyms / data.words.length * 100).toFixed(1)}%)`);
  console.log(`   - 有標籤: ${withTags} 個 (${(withTags / data.words.length * 100).toFixed(1)}%)`);
  console.log('\n========================\n');
}

// ===== 主程式 =====

function main() {
  const args = process.argv.slice(2);

  // 解析參數
  let inputFile = '';
  let outputFile = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      inputFile = args[i + 1];
    }
    if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
    }
  }

  // 檢查參數
  if (!inputFile) {
    console.error('❌ 錯誤：請指定輸入檔案');
    console.log('\n使用方式：');
    console.log('  npm run import-vocabulary -- --file <檔案路徑> [--output <輸出路徑>]');
    console.log('\n範例：');
    console.log('  npm run import-vocabulary -- --file data/gsat_5545_vocabulary.json');
    console.log('  npm run import-vocabulary -- --file data/gsat_5545_vocabulary.csv --output src/data/vocabulary.ts');
    process.exit(1);
  }

  // 檢查檔案是否存在
  const fullPath = path.resolve(inputFile);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ 錯誤：檔案不存在: ${fullPath}`);
    process.exit(1);
  }

  console.log('🚀 開始匯入字卡資料...\n');

  try {
    // 根據副檔名選擇匯入方式
    const ext = path.extname(fullPath).toLowerCase();
    let data: VocabularyData;

    if (ext === '.json') {
      data = importJSON(fullPath);
    } else if (ext === '.csv') {
      data = importCSV(fullPath);
    } else {
      throw new Error(`不支援的檔案格式: ${ext}（僅支援 .json 和 .csv）`);
    }

    // 驗證資料
    console.log('🔍 正在驗證資料...');
    const validation = validateData(data);

    if (!validation.isValid) {
      console.error('\n❌ 資料驗證失敗：\n');
      validation.errors.slice(0, 20).forEach(err => console.error(`   - ${err}`));
      if (validation.errors.length > 20) {
        console.error(`\n   ... 還有 ${validation.errors.length - 20} 個錯誤\n`);
      }
      process.exit(1);
    }

    console.log('✅ 資料驗證通過\n');

    // 輸出統計資訊
    exportStatistics(data);

    // 生成 TypeScript 檔案
    const defaultOutput = 'src/data/vocabulary-imported.ts';
    const finalOutput = outputFile || defaultOutput;
    exportToTypeScript(data, finalOutput);

    console.log('\n🎉 匯入完成！\n');
    console.log('📝 後續步驟：');
    console.log(`   1. 檢查生成的檔案: ${finalOutput}`);
    console.log('   2. 在你的元件中匯入使用：');
    console.log(`      import { vocabularyWords } from '.${finalOutput.replace(process.cwd(), '')}';`);
    console.log('   3. 替換現有的 mock 資料為真實資料\n');

  } catch (error) {
    console.error('\n❌ 匯入失敗：', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// 執行主程式
main();
