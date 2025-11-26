import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Excel file
const filePath = path.resolve(__dirname, '../data/gsat_5543_vocabulary.xlsx');
const workbook = XLSX.readFile(filePath);

// Get the first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON
const rawData = XLSX.utils.sheet_to_json(worksheet);

// Process and transform the data
let autoIncrementId = 1;
const processedWords = rawData.map((row, index) => {
  // Extract level number from "Level X" format
  const levelMatch = String(row['Level'] || '').match(/Level\s*(\d+)/i);
  const level = levelMatch ? parseInt(levelMatch[1]) : 1;

  // Parse tags into array
  const tagsString = String(row['tags'] || '');
  const tags = tagsString.split('|').filter(tag => tag.trim() !== '');

  // Parse synonyms and antonyms
  const synonyms = String(row['synonyms'] || '').split('|').filter(s => s.trim() !== '');
  const antonyms = String(row['antonyms'] || '').split('|').filter(a => a.trim() !== '');

  // Use auto-increment ID (1, 2, 3...)
  const id = autoIncrementId++;

  return {
    id: String(id),
    word: String(row['word'] || '').trim(),
    ipa: String(row['ipa'] || '').trim(),
    translation: String(row['translation'] || '').trim(),
    partOfSpeech: String(row['partOfSpeech'] || '').trim(),
    example: String(row['example'] || '').trim(),
    exampleTranslation: String(row['exampleTranslation'] || '').trim(),
    synonyms,
    antonyms,
    level,
    difficulty: String(row['difficulty'] || 'intermediate').trim(),
    category: String(row['category'] || '').trim(),
    tags,
    extraNotes: String(row['extraNotes'] || '').trim(),
  };
});

// Group words by level
const wordsByLevel = {};
processedWords.forEach(word => {
  const level = word.level;
  if (!wordsByLevel[level]) {
    wordsByLevel[level] = [];
  }
  wordsByLevel[level].push(word);
});

// Extract unique tags for filtering
const allTags = new Set();
processedWords.forEach(word => {
  word.tags.forEach(tag => {
    // Skip level tags since we have a dedicated level filter
    if (!tag.match(/^Level\s*\d+$/i)) {
      allTags.add(tag);
    }
  });
});

// Create output directory
const outputDir = path.resolve(__dirname, '../src/data/vocabulary');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate TypeScript type definition
const typeContent = `// Auto-generated vocabulary types
export interface VocabularyWord {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  partOfSpeech: string;
  example: string;
  exampleTranslation: string;
  synonyms: string[];
  antonyms: string[];
  level: number;
  difficulty: string;
  category: string;
  tags: string[];
  extraNotes: string;
}

export interface VocabularyLevel {
  level: number;
  name: string;
  description: string;
  wordCount: number;
  difficulty: string;
}

export const VOCABULARY_LEVELS: VocabularyLevel[] = [
  { level: 1, name: 'Level 1 - 基礎', description: '國中基礎單字', wordCount: ${wordsByLevel[1]?.length || 0}, difficulty: '初級' },
  { level: 2, name: 'Level 2 - 進階', description: '國中進階單字', wordCount: ${wordsByLevel[2]?.length || 0}, difficulty: '初中級' },
  { level: 3, name: 'Level 3 - 核心', description: '高中核心單字', wordCount: ${wordsByLevel[3]?.length || 0}, difficulty: '中級' },
  { level: 4, name: 'Level 4 - 中高', description: '高中中高級單字', wordCount: ${wordsByLevel[4]?.length || 0}, difficulty: '中高級' },
  { level: 5, name: 'Level 5 - 高級', description: '高中高級單字', wordCount: ${wordsByLevel[5]?.length || 0}, difficulty: '高級' },
  { level: 6, name: 'Level 6 - 挑戰', description: '學測挑戰單字', wordCount: ${wordsByLevel[6]?.length || 0}, difficulty: '進階' },
];

export const VOCABULARY_TAGS = ${JSON.stringify(Array.from(allTags).sort(), null, 2)} as const;

export type VocabularyTag = typeof VOCABULARY_TAGS[number];
`;

fs.writeFileSync(path.join(outputDir, 'types.ts'), typeContent);
console.log('Generated: types.ts');

// Generate data file for each level
Object.keys(wordsByLevel).forEach(level => {
  const words = wordsByLevel[level];
  const content = `// Auto-generated - Level ${level} vocabulary data
import type { VocabularyWord } from './types';

export const level${level}Words: VocabularyWord[] = ${JSON.stringify(words, null, 2)};

export default level${level}Words;
`;
  fs.writeFileSync(path.join(outputDir, `level${level}.ts`), content);
  console.log(`Generated: level${level}.ts (${words.length} words)`);
});

// Generate main index file
const levels = Object.keys(wordsByLevel).sort((a, b) => Number(a) - Number(b));
const indexContent = `// Auto-generated vocabulary index
import type { VocabularyWord } from './types';
${levels.map(l => `import { level${l}Words } from './level${l}';`).join('\n')}

export * from './types';

// All words by level
export const vocabularyByLevel: Record<number, VocabularyWord[]> = {
${levels.map(l => `  ${l}: level${l}Words,`).join('\n')}
};

// Get all words
export const getAllWords = (): VocabularyWord[] => {
  return Object.values(vocabularyByLevel).flat();
};

// Get words by level
export const getWordsByLevel = (level: number): VocabularyWord[] => {
  return vocabularyByLevel[level] || [];
};

// Get words by levels (multiple)
export const getWordsByLevels = (levels: number[]): VocabularyWord[] => {
  return levels.flatMap(level => vocabularyByLevel[level] || []);
};

// Get words by tag
export const getWordsByTag = (tag: string): VocabularyWord[] => {
  return getAllWords().filter(word => word.tags.includes(tag));
};

// Get words by filter
export const getWordsByFilter = (options: {
  levels?: number[];
  tags?: string[];
  searchQuery?: string;
}): VocabularyWord[] => {
  let words = getAllWords();

  if (options.levels && options.levels.length > 0) {
    words = words.filter(word => options.levels!.includes(word.level));
  }

  if (options.tags && options.tags.length > 0) {
    words = words.filter(word =>
      options.tags!.some(tag => word.tags.includes(tag))
    );
  }

  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase();
    words = words.filter(word =>
      word.word.toLowerCase().includes(query) ||
      word.translation.includes(query)
    );
  }

  return words;
};

// Total word count
export const TOTAL_WORDS = ${processedWords.length};

// Export level arrays for direct import
${levels.map(l => `export { level${l}Words };`).join('\n')}
`;

fs.writeFileSync(path.join(outputDir, 'index.ts'), indexContent);
console.log('Generated: index.ts');

// Generate ID mapping file (for database update)
const idMapping = processedWords.map(word => ({
  id: word.id,
  word: word.word,
  level: word.level,
}));

// Save as JSON
const mappingJsonPath = path.join(outputDir, 'id-mapping.json');
fs.writeFileSync(mappingJsonPath, JSON.stringify(idMapping, null, 2));
console.log(`Generated: id-mapping.json (${idMapping.length} entries)`);

// Save as CSV for easy database import
const csvHeader = 'id,word,level';
const csvRows = idMapping.map(item => `${item.id},"${item.word}",${item.level}`);
const csvContent = [csvHeader, ...csvRows].join('\n');
const mappingCsvPath = path.join(outputDir, 'id-mapping.csv');
fs.writeFileSync(mappingCsvPath, csvContent);
console.log(`Generated: id-mapping.csv`);

// Print summary
console.log('\n=== Summary ===');
console.log(`Total words: ${processedWords.length}`);
Object.keys(wordsByLevel).sort((a, b) => Number(a) - Number(b)).forEach(level => {
  console.log(`Level ${level}: ${wordsByLevel[level].length} words`);
});
console.log(`Unique tags: ${allTags.size}`);
console.log('\nVocabulary data generated successfully!');
console.log(`\nID Mapping files saved to:`);
console.log(`  - ${mappingJsonPath}`);
console.log(`  - ${mappingCsvPath}`);
