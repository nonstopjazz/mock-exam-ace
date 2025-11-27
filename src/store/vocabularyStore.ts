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

// Learning status types
export type LearningStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

// Topic categories mapping
export const TOPIC_CATEGORIES: Record<string, string[]> = {
  '日常生活': ['日常', '日常生活', '日常活動', '日常動作', '日常用品', '日常對話', '日常溝通', '生活', '生活用品', '居家', '居住', '家庭', '家具', '家電', '家務', '廚房', '廚房用品', '餐具', '清潔'],
  '科學科技': ['科學', '科技', '技術', '物理', '化學', '生物', '生物學', '數學', '數據', '數據分析', '電腦', '程式設計', '軟體', '人工智慧', '網路', '網路安全', '太空', '太空探索', '天文', '宇宙'],
  '商業金融': ['商業', '商務', '金融', '經濟', '財經', '投資', '理財', '金錢', '貿易', '國際貿易', '行銷', '管理', '組織管理', '專案管理'],
  '情感心理': ['情感', '情緒', '情緒表達', '情感表達', '心理', '心理學', '心理健康', '心理狀態', '心態', '心境', '心靈', '感覺', '感官', '性格', '性格特質', '人格特質'],
  '教育學習': ['教育', '學習', '學校', '校園', '校園生活', '考試', '測驗', '學測', '指考', '學術', '學術用語', '學術寫作', '研究', '知識', '閱讀', '寫作', '寫作技巧'],
  '自然環境': ['自然', '環境', '環保', '生態', '氣候', '天氣', '氣象', '季節', '動物', '植物', '海洋', '海洋生態', '海洋生物', '自然景觀', '自然現象', '自然災害', '風景'],
  '藝術文化': ['藝術', '文化', '文學', '音樂', '樂器', '表演', '表演藝術', '美學', '設計', '攝影', '創作', '創意', '傳統', '傳統技藝', '歷史', '宗教', '神話', '節慶', '節日', '慶典', '慶祝'],
  '健康醫療': ['健康', '醫療', '醫學', '身體', '身體部位', '人體', '營養', '飲食', '食物', '健身', '運動', '體育', '休閒活動', '戶外活動'],
  '社會政治': ['社會', '政治', '政府', '政策', '法律', '權力', '選舉', '公民', '人權', '社會議題', '社會發展', '國際', '國際關係', '戰爭', '軍事'],
  '旅遊交通': ['旅遊', '旅行', '交通', '交通工具', '運輸', '飛行', '航海', '住宿', '地理', '地點', '地標', '城市', '國家'],
  '職場工作': ['工作', '職場', '職業', '職涯', '職位', '辦公', '辦公室', '辦公用品', '會議', '專業', '團隊合作', '領導', '領導力'],
  '人際社交': ['人際關係', '人際互動', '社交', '社交互動', '社交禮儀', '溝通', '禮儀', '關係', '互動', '合作'],
};

// Part of speech mapping for display
export const PARTS_OF_SPEECH: Record<string, { label: string; matches: string[] }> = {
  noun: { label: '名詞 (n.)', matches: ['n.', 'n', 'n, adj'] },
  verb: { label: '動詞 (v.)', matches: ['v.', 'v'] },
  adjective: { label: '形容詞 (adj.)', matches: ['adj.', 'adj', 'n, adj'] },
  adverb: { label: '副詞 (adv.)', matches: ['adv.'] },
  preposition: { label: '介系詞 (prep.)', matches: ['prep.'] },
  conjunction: { label: '連接詞 (conj.)', matches: ['conj.'] },
  pronoun: { label: '代名詞 (pron.)', matches: ['pron.', 'pron'] },
};

// Alphabet for filtering
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface VocabularyState {
  // User progress for each word
  wordProgress: Record<string, WordProgress>;

  // Current study session settings
  selectedLevels: number[];
  selectedTags: string[];
  selectedLetters: string[];
  selectedPartsOfSpeech: string[];
  selectedCategories: string[];
  selectedLearningStatus: LearningStatus[];
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
  setSelectedLetters: (letters: string[]) => void;
  setSelectedPartsOfSpeech: (pos: string[]) => void;
  setSelectedCategories: (categories: string[]) => void;
  setSelectedLearningStatus: (status: LearningStatus[]) => void;
  setCurrentMode: (mode: 'srs' | 'flashcards' | 'quiz' | null) => void;
  clearAllFilters: () => void;

  // Actions - Get Words
  getWordsForSRS: (limit?: number) => VocabularyWord[];
  getWordsForFlashcards: () => VocabularyWord[];
  getWordsForQuiz: (count?: number) => VocabularyWord[];
  getFilteredWordCount: () => number;

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

// Helper function to filter words based on all criteria
const filterWords = (
  words: VocabularyWord[],
  state: {
    selectedLevels: number[];
    selectedTags: string[];
    selectedLetters: string[];
    selectedPartsOfSpeech: string[];
    selectedCategories: string[];
    selectedLearningStatus: LearningStatus[];
    wordProgress: Record<string, WordProgress>;
  }
): VocabularyWord[] => {
  const now = Date.now();

  return words.filter(word => {
    // Level filter
    const levelMatch = state.selectedLevels.length === 0 || state.selectedLevels.includes(word.level);
    if (!levelMatch) return false;

    // Letter filter (first letter of word)
    const letterMatch = state.selectedLetters.length === 0 ||
      state.selectedLetters.includes(word.word.charAt(0).toUpperCase());
    if (!letterMatch) return false;

    // Part of speech filter
    const posMatch = state.selectedPartsOfSpeech.length === 0 ||
      state.selectedPartsOfSpeech.some(pos => {
        const posData = PARTS_OF_SPEECH[pos];
        return posData && posData.matches.includes(word.partOfSpeech);
      });
    if (!posMatch) return false;

    // Category filter (maps to tags)
    const categoryMatch = state.selectedCategories.length === 0 ||
      state.selectedCategories.some(category => {
        const categoryTags = TOPIC_CATEGORIES[category] || [];
        return categoryTags.some(tag => word.tags.includes(tag));
      });
    if (!categoryMatch) return false;

    // Tag filter (direct tags)
    const tagMatch = state.selectedTags.length === 0 ||
      state.selectedTags.some(tag => word.tags.includes(tag));
    if (!tagMatch) return false;

    // Learning status filter
    if (state.selectedLearningStatus.length > 0) {
      const progress = state.wordProgress[word.id];
      const masteryLevel = progress?.masteryLevel || 0;
      const reviewCount = progress?.reviewCount || 0;
      const nextReviewTime = progress?.nextReviewTime || 0;

      let status: LearningStatus;
      if (reviewCount === 0) {
        status = 'new';
      } else if (masteryLevel >= 4) {
        status = 'mastered';
      } else if (nextReviewTime <= now) {
        status = 'reviewing';
      } else {
        status = 'learning';
      }

      if (!state.selectedLearningStatus.includes(status)) return false;
    }

    return true;
  });
};

export const useVocabularyStore = create<VocabularyState>()(
  persist(
    (set, get) => ({
      wordProgress: {},
      selectedLevels: [2, 3, 4, 5, 6], // Default to all levels
      selectedTags: [],
      selectedLetters: [],
      selectedPartsOfSpeech: [],
      selectedCategories: [],
      selectedLearningStatus: [],
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

      setSelectedLetters: (letters: string[]) => {
        set({ selectedLetters: letters });
      },

      setSelectedPartsOfSpeech: (pos: string[]) => {
        set({ selectedPartsOfSpeech: pos });
      },

      setSelectedCategories: (categories: string[]) => {
        set({ selectedCategories: categories });
      },

      setSelectedLearningStatus: (status: LearningStatus[]) => {
        set({ selectedLearningStatus: status });
      },

      setCurrentMode: (mode: 'srs' | 'flashcards' | 'quiz' | null) => {
        set({ currentMode: mode });
      },

      clearAllFilters: () => {
        set({
          selectedLevels: [2, 3, 4, 5, 6],
          selectedTags: [],
          selectedLetters: [],
          selectedPartsOfSpeech: [],
          selectedCategories: [],
          selectedLearningStatus: [],
        });
      },

      getWordsForSRS: (limit = 20) => {
        const state = get();
        const now = Date.now();

        // Filter words using all criteria
        const filteredWords = filterWords(vocabularyDataSync, state);

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
        // Filter words using all criteria
        return filterWords(vocabularyDataSync, state);
      },

      getWordsForQuiz: (count = 10) => {
        const state = get();

        // Filter words using all criteria
        const filteredWords = filterWords(vocabularyDataSync, state);

        // Shuffle and take count
        const shuffled = [...filteredWords].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
      },

      getFilteredWordCount: () => {
        const state = get();
        return filterWords(vocabularyDataSync, state).length;
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
