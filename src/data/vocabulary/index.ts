// Auto-generated vocabulary index
import type { VocabularyWord } from './types';
import { level2Words } from './level2';
import { level3Words } from './level3';
import { level4Words } from './level4';
import { level5Words } from './level5';
import { level6Words } from './level6';

export * from './types';

// All words by level
export const vocabularyByLevel: Record<number, VocabularyWord[]> = {
  2: level2Words,
  3: level3Words,
  4: level4Words,
  5: level5Words,
  6: level6Words,
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
export const TOTAL_WORDS = 5542;

// Export level arrays for direct import
export { level2Words };
export { level3Words };
export { level4Words };
export { level5Words };
export { level6Words };
