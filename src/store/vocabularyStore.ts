import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { VocabularyWord, VOCABULARY_LEVELS } from '@/data/vocabulary';

// SRS intervals in milliseconds
const SRS_INTERVALS = {
  0: 0,                    // New word - review now
  1: 10 * 60 * 1000,       // 10 minutes
  2: 1 * 24 * 60 * 60 * 1000,   // 1 day
  3: 3 * 24 * 60 * 60 * 1000,   // 3 days
  4: 7 * 24 * 60 * 60 * 1000,   // 1 week
  5: 14 * 24 * 60 * 60 * 1000,  // 2 weeks
};

export interface WordProgress {
  wordId: string;
  masteryLevel: number; // 0-5, 0=new, 5=mastered
  nextReviewTime: number; // Unix timestamp
  reviewCount: number;
  correctCount: number;
  lastReviewTime: number | null;
}

export interface StudySession {
  mode: 'srs' | 'flashcards' | 'quiz';
  selectedLevels: number[];
  selectedTags: string[];
  wordCount: number;
  startTime: number;
}

interface VocabularyState {
  // User progress for each word
  wordProgress: Record<string, WordProgress>;

  // Current study session settings
  selectedLevels: number[];
  selectedTags: string[];
  currentMode: 'srs' | 'flashcards' | 'quiz' | null;

  // Statistics
  totalWordsLearned: number;
  totalReviewCount: number;
  streakDays: number;
  lastStudyDate: string | null;

  // Actions - Progress
  initWordProgress: (wordId: string) => void;
  updateWordProgress: (wordId: string, isCorrect: boolean, response?: 'forgot' | 'hard' | 'easy') => void;
  getWordProgress: (wordId: string) => WordProgress;

  // Actions - Study Session
  setSelectedLevels: (levels: number[]) => void;
  setSelectedTags: (tags: string[]) => void;
  setCurrentMode: (mode: 'srs' | 'flashcards' | 'quiz' | null) => void;

  // Actions - Get Words
  getWordsForSRS: (limit?: number) => VocabularyWord[];
  getWordsForFlashcards: () => VocabularyWord[];
  getWordsForQuiz: (count?: number) => VocabularyWord[];

  // Actions - Statistics
  getLevelProgress: (level: number) => { total: number; learned: number; mastered: number };
  getOverallProgress: () => { total: number; learned: number; mastered: number; reviewDue: number };
  updateStreak: () => void;

  // Actions - Reset
  resetProgress: () => void;
}

// Import vocabulary data lazily to avoid circular dependencies
let vocabularyData: VocabularyWord[] | null = null;
const getVocabularyData = async (): Promise<VocabularyWord[]> => {
  if (!vocabularyData) {
    const { getAllWords } = await import('@/data/vocabulary');
    vocabularyData = getAllWords();
  }
  return vocabularyData;
};

// Synchronous version for store actions
let vocabularyDataSync: VocabularyWord[] = [];
import('@/data/vocabulary').then(({ getAllWords }) => {
  vocabularyDataSync = getAllWords();
});

export const useVocabularyStore = create<VocabularyState>()(
  persist(
    (set, get) => ({
      wordProgress: {},
      selectedLevels: [2, 3, 4, 5, 6], // Default to all levels
      selectedTags: [],
      currentMode: null,
      totalWordsLearned: 0,
      totalReviewCount: 0,
      streakDays: 0,
      lastStudyDate: null,

      initWordProgress: (wordId: string) => {
        const state = get();
        if (!state.wordProgress[wordId]) {
          set({
            wordProgress: {
              ...state.wordProgress,
              [wordId]: {
                wordId,
                masteryLevel: 0,
                nextReviewTime: Date.now(),
                reviewCount: 0,
                correctCount: 0,
                lastReviewTime: null,
              },
            },
          });
        }
      },

      updateWordProgress: (wordId: string, isCorrect: boolean, response?: 'forgot' | 'hard' | 'easy') => {
        const state = get();
        const existing = state.wordProgress[wordId] || {
          wordId,
          masteryLevel: 0,
          nextReviewTime: Date.now(),
          reviewCount: 0,
          correctCount: 0,
          lastReviewTime: null,
        };

        let newMasteryLevel = existing.masteryLevel;

        if (response === 'forgot') {
          // Reset to level 1
          newMasteryLevel = Math.max(0, existing.masteryLevel - 2);
        } else if (response === 'hard') {
          // Stay at same level or go down slightly
          newMasteryLevel = Math.max(0, existing.masteryLevel - 1);
        } else if (response === 'easy' || isCorrect) {
          // Move up one level
          newMasteryLevel = Math.min(5, existing.masteryLevel + 1);
        } else {
          // Wrong answer - go down
          newMasteryLevel = Math.max(0, existing.masteryLevel - 1);
        }

        const nextReviewTime = Date.now() + (SRS_INTERVALS[newMasteryLevel as keyof typeof SRS_INTERVALS] || 0);

        const wasNew = existing.masteryLevel === 0 && existing.reviewCount === 0;
        const isNowLearned = newMasteryLevel > 0;

        set({
          wordProgress: {
            ...state.wordProgress,
            [wordId]: {
              wordId,
              masteryLevel: newMasteryLevel,
              nextReviewTime,
              reviewCount: existing.reviewCount + 1,
              correctCount: isCorrect ? existing.correctCount + 1 : existing.correctCount,
              lastReviewTime: Date.now(),
            },
          },
          totalReviewCount: state.totalReviewCount + 1,
          totalWordsLearned: wasNew && isNowLearned ? state.totalWordsLearned + 1 : state.totalWordsLearned,
        });

        // Update streak
        get().updateStreak();
      },

      getWordProgress: (wordId: string) => {
        const state = get();
        return state.wordProgress[wordId] || {
          wordId,
          masteryLevel: 0,
          nextReviewTime: Date.now(),
          reviewCount: 0,
          correctCount: 0,
          lastReviewTime: null,
        };
      },

      setSelectedLevels: (levels: number[]) => {
        set({ selectedLevels: levels });
      },

      setSelectedTags: (tags: string[]) => {
        set({ selectedTags: tags });
      },

      setCurrentMode: (mode: 'srs' | 'flashcards' | 'quiz' | null) => {
        set({ currentMode: mode });
      },

      getWordsForSRS: (limit = 20) => {
        const state = get();
        const now = Date.now();

        // Filter words by selected levels and tags
        let filteredWords = vocabularyDataSync.filter(word => {
          const levelMatch = state.selectedLevels.length === 0 || state.selectedLevels.includes(word.level);
          const tagMatch = state.selectedTags.length === 0 || state.selectedTags.some(tag => word.tags.includes(tag));
          return levelMatch && tagMatch;
        });

        // Sort by: 1) Due for review (nextReviewTime <= now), 2) New words, 3) By next review time
        const wordsWithProgress = filteredWords.map(word => {
          const progress = state.wordProgress[word.id];
          return {
            word,
            progress,
            isDue: progress ? progress.nextReviewTime <= now : true,
            isNew: !progress || progress.reviewCount === 0,
          };
        });

        // Sort: due words first, then new words, then by next review time
        wordsWithProgress.sort((a, b) => {
          if (a.isDue && !b.isDue) return -1;
          if (!a.isDue && b.isDue) return 1;
          if (a.isNew && !b.isNew) return -1;
          if (!a.isNew && b.isNew) return 1;
          const aTime = a.progress?.nextReviewTime || 0;
          const bTime = b.progress?.nextReviewTime || 0;
          return aTime - bTime;
        });

        return wordsWithProgress.slice(0, limit).map(item => item.word);
      },

      getWordsForFlashcards: () => {
        const state = get();

        // Filter words by selected levels and tags
        return vocabularyDataSync.filter(word => {
          const levelMatch = state.selectedLevels.length === 0 || state.selectedLevels.includes(word.level);
          const tagMatch = state.selectedTags.length === 0 || state.selectedTags.some(tag => word.tags.includes(tag));
          return levelMatch && tagMatch;
        });
      },

      getWordsForQuiz: (count = 10) => {
        const state = get();

        // Filter words by selected levels and tags
        let filteredWords = vocabularyDataSync.filter(word => {
          const levelMatch = state.selectedLevels.length === 0 || state.selectedLevels.includes(word.level);
          const tagMatch = state.selectedTags.length === 0 || state.selectedTags.some(tag => word.tags.includes(tag));
          return levelMatch && tagMatch;
        });

        // Shuffle and take count
        const shuffled = [...filteredWords].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
      },

      getLevelProgress: (level: number) => {
        const state = get();
        const wordsInLevel = vocabularyDataSync.filter(w => w.level === level);
        const total = wordsInLevel.length;

        let learned = 0;
        let mastered = 0;

        wordsInLevel.forEach(word => {
          const progress = state.wordProgress[word.id];
          if (progress && progress.masteryLevel > 0) {
            learned++;
            if (progress.masteryLevel >= 4) {
              mastered++;
            }
          }
        });

        return { total, learned, mastered };
      },

      getOverallProgress: () => {
        const state = get();
        const now = Date.now();
        const total = vocabularyDataSync.length;

        let learned = 0;
        let mastered = 0;
        let reviewDue = 0;

        vocabularyDataSync.forEach(word => {
          const progress = state.wordProgress[word.id];
          if (progress) {
            if (progress.masteryLevel > 0) {
              learned++;
            }
            if (progress.masteryLevel >= 4) {
              mastered++;
            }
            if (progress.nextReviewTime <= now) {
              reviewDue++;
            }
          }
        });

        return { total, learned, mastered, reviewDue };
      },

      updateStreak: () => {
        const state = get();
        const today = new Date().toISOString().split('T')[0];

        if (state.lastStudyDate === today) {
          return; // Already studied today
        }

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        if (state.lastStudyDate === yesterday) {
          // Continue streak
          set({
            streakDays: state.streakDays + 1,
            lastStudyDate: today,
          });
        } else {
          // Reset streak
          set({
            streakDays: 1,
            lastStudyDate: today,
          });
        }
      },

      resetProgress: () => {
        set({
          wordProgress: {},
          totalWordsLearned: 0,
          totalReviewCount: 0,
          streakDays: 0,
          lastStudyDate: null,
        });
      },
    }),
    {
      name: 'vocabulary-storage',
    }
  )
);

// Initialize vocabulary data when store is created
import('@/data/vocabulary').then(({ getAllWords }) => {
  vocabularyDataSync = getAllWords();
});
