/**
 * 將 Level 單字資料從 .ts 靜態檔匯出為 SQL INSERT 語句
 *
 * 用法：bun run scripts/export-vocabulary-to-sql.ts
 * 輸出：supabase/migrations/seed_level_words.sql
 */

import { level2Words } from '../src/data/vocabulary/level2';
import { level3Words } from '../src/data/vocabulary/level3';
import { level4Words } from '../src/data/vocabulary/level4';
import { level5Words } from '../src/data/vocabulary/level5';
import { level6Words } from '../src/data/vocabulary/level6';
import { writeFileSync } from 'fs';
import { join } from 'path';

const allWords = [
  ...level2Words,
  ...level3Words,
  ...level4Words,
  ...level5Words,
  ...level6Words,
];

// Escape single quotes for SQL
function esc(str: string | null | undefined): string {
  if (!str) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

// Convert JS array to PostgreSQL array literal
function pgArray(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return "'{}'";
  const escaped = arr.map(s => `"${s.replace(/"/g, '\\"').replace(/'/g, "''")}"`).join(',');
  return `'{${escaped}}'`;
}

let sql = `-- =====================================================
-- Seed: 匯入 ${allWords.length} 筆 Level 單字到 level_words 表
-- 自動產生於 ${new Date().toISOString()}
-- =====================================================

`;

// Split into batches of 500 for better performance
const BATCH_SIZE = 500;
const batches = [];
for (let i = 0; i < allWords.length; i += BATCH_SIZE) {
  batches.push(allWords.slice(i, i + BATCH_SIZE));
}

for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
  const batch = batches[batchIndex];

  sql += `-- Batch ${batchIndex + 1}/${batches.length}\n`;
  sql += `INSERT INTO level_words (id, word, ipa, translation, part_of_speech, example, example_translation, synonyms, antonyms, level, difficulty, category, tags, extra_notes)\nVALUES\n`;

  const rows = batch.map((w) => {
    return `  (${esc(w.id)}, ${esc(w.word)}, ${esc(w.ipa)}, ${esc(w.translation)}, ${esc(w.partOfSpeech)}, ${esc(w.example)}, ${esc(w.exampleTranslation)}, ${pgArray(w.synonyms)}, ${pgArray(w.antonyms)}, ${w.level}, ${esc(w.difficulty)}, ${esc(w.category)}, ${pgArray(w.tags)}, ${esc(w.extraNotes)})`;
  });

  sql += rows.join(',\n');
  sql += `\nON CONFLICT (id) DO NOTHING;\n\n`;
}

sql += `-- =====================================================
-- 匯入完成！共 ${allWords.length} 筆
-- =====================================================
`;

const outputPath = join(import.meta.dir, '..', 'supabase', 'migrations', 'seed_level_words.sql');
writeFileSync(outputPath, sql, 'utf-8');

console.log(`✅ 匯出完成！`);
console.log(`   總筆數: ${allWords.length}`);
console.log(`   Level 2: ${level2Words.length}`);
console.log(`   Level 3: ${level3Words.length}`);
console.log(`   Level 4: ${level4Words.length}`);
console.log(`   Level 5: ${level5Words.length}`);
console.log(`   Level 6: ${level6Words.length}`);
console.log(`   輸出: ${outputPath}`);
