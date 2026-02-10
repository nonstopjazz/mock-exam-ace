import { supabase } from './supabase';
import type { VocabularyWord } from '@/data/vocabulary/types';

/**
 * 從 Supabase level_words 表讀取單字資料
 * DB 欄位 (snake_case) → 前端 (camelCase) 映射
 */

interface LevelWordRow {
  id: string;
  word: string;
  ipa: string | null;
  translation: string | null;
  part_of_speech: string | null;
  example: string | null;
  example_translation: string | null;
  synonyms: string[] | null;
  antonyms: string[] | null;
  level: number;
  difficulty: string | null;
  category: string | null;
  tags: string[] | null;
  extra_notes: string | null;
  audio_url: string | null;
  example_audio_url: string | null;
}

function mapRowToWord(row: LevelWordRow): VocabularyWord {
  return {
    id: row.id,
    word: row.word,
    ipa: row.ipa || '',
    translation: row.translation || '',
    partOfSpeech: row.part_of_speech || '',
    example: row.example || '',
    exampleTranslation: row.example_translation || '',
    synonyms: row.synonyms || [],
    antonyms: row.antonyms || [],
    level: row.level,
    difficulty: row.difficulty || '',
    category: row.category || '',
    tags: row.tags || [],
    extraNotes: row.extra_notes || '',
    audioUrl: row.audio_url,
    exampleAudioUrl: row.example_audio_url,
  };
}

// 快取，避免重複請求
let cachedWords: VocabularyWord[] | null = null;

/**
 * 從 Supabase 取得所有 level 單字
 * 有快取機制，只會請求一次
 */
export async function fetchLevelWords(): Promise<VocabularyWord[]> {
  if (cachedWords) return cachedWords;

  const { data, error } = await supabase
    .from('level_words')
    .select('*')
    .order('level', { ascending: true })
    .order('word', { ascending: true });

  if (error) {
    console.error('Failed to fetch level words from Supabase:', error);
    throw error;
  }

  cachedWords = (data as LevelWordRow[]).map(mapRowToWord);
  return cachedWords;
}

/**
 * 從 Supabase 取得特定 level 的單字
 */
export async function fetchWordsByLevel(level: number): Promise<VocabularyWord[]> {
  const allWords = await fetchLevelWords();
  return allWords.filter(w => w.level === level);
}

/**
 * 清除快取（用於強制重新載入）
 */
export function clearLevelWordsCache() {
  cachedWords = null;
}
