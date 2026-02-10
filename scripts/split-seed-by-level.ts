/**
 * 將 Level 單字分別匯出為每個 Level 一個 SQL 檔
 *
 * 用法：bun run scripts/split-seed-by-level.ts
 */

import { level2Words } from '../src/data/vocabulary/level2';
import { level3Words } from '../src/data/vocabulary/level3';
import { level4Words } from '../src/data/vocabulary/level4';
import { level5Words } from '../src/data/vocabulary/level5';
import { level6Words } from '../src/data/vocabulary/level6';
import type { VocabularyWord } from '../src/data/vocabulary/types';
import { writeFileSync } from 'fs';
import { join } from 'path';

function esc(str: string | null | undefined): string {
  if (!str) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

function pgArray(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return "'{}'";
  const escaped = arr.map(s => `"${s.replace(/"/g, '\\"').replace(/'/g, "''")}"`).join(',');
  return `'{${escaped}}'`;
}

function generateSQL(words: VocabularyWord[], level: number): string {
  let sql = `-- Level ${level}: ${words.length} 筆單字\n`;
  sql += `INSERT INTO level_words (id, word, ipa, translation, part_of_speech, example, example_translation, synonyms, antonyms, level, difficulty, category, tags, extra_notes)\nVALUES\n`;

  const rows = words.map((w) => {
    return `  (${esc(w.id)}, ${esc(w.word)}, ${esc(w.ipa)}, ${esc(w.translation)}, ${esc(w.partOfSpeech)}, ${esc(w.example)}, ${esc(w.exampleTranslation)}, ${pgArray(w.synonyms)}, ${pgArray(w.antonyms)}, ${w.level}, ${esc(w.difficulty)}, ${esc(w.category)}, ${pgArray(w.tags)}, ${esc(w.extraNotes)})`;
  });

  sql += rows.join(',\n');
  sql += `\nON CONFLICT (id) DO NOTHING;\n`;
  return sql;
}

const levels = [
  { words: level2Words, level: 2 },
  { words: level3Words, level: 3 },
  { words: level4Words, level: 4 },
  { words: level5Words, level: 5 },
  { words: level6Words, level: 6 },
];

const outDir = join(import.meta.dir, '..', 'supabase', 'migrations');

for (const { words, level } of levels) {
  const sql = generateSQL(words, level);
  const filename = `seed_level_${level}_words.sql`;
  writeFileSync(join(outDir, filename), sql, 'utf-8');
  console.log(`✅ ${filename} (${words.length} 筆, ${(Buffer.byteLength(sql) / 1024).toFixed(0)}KB)`);
}
