// TODO: 未來從 API 拉取真實分析數據
// GET /api/analytics/grammar-topics?userId={uid}&days={7|30|90}
// GET /api/analytics/question-types?userId={uid}&days={7|30|90}
// GET /api/analytics/exam-history?userId={uid}&days={7|30|90}
// GET /api/analytics/vocabulary-levels?userId={uid}&days={7|30|90}
// GET /api/analytics/timing-stats?userId={uid}&days={7|30|90}

export interface GrammarTopicData {
  mainTopic: string;
  subTopics: {
    name: string;
    accuracy: number; // 0-100
    recentPerformance: string; // 描述文字
    commonMistakes: string[];
    suggestion: string;
  }[];
}

export interface QuestionTypeScore {
  type: string;
  typeName: string;
  score: number; // 0-100
  maxScore: number;
  accuracy: number; // 0-100
}

export interface ExamHistory {
  attemptId: string;
  date: string;
  score: number;
  maxScore: number;
}

export interface VocabularyLevelData {
  level: number; // 3, 4, 5, 6
  totalWords: number;
  wrongWords: number;
  errorRate: number; // 0-100
}

export interface QuestionTypeTiming {
  type: string;
  typeName: string;
  totalTime: number; // 秒
  averageTime: number; // 秒
  questionCount: number;
  details: {
    attemptId: string;
    date: string;
    time: number;
  }[];
}

// ===== 1. 文法主題同心圓 =====
export const MOCK_GRAMMAR_TOPICS: GrammarTopicData[] = [
  {
    mainTopic: 'Tense',
    subTopics: [
      {
        name: 'Present Simple',
        accuracy: 92,
        recentPerformance: '近三次：90% → 92% → 94%（進步中）',
        commonMistakes: ['第三人稱單數 -s/-es 遺漏', '否定句助動詞錯誤'],
        suggestion: '表現優異，繼續保持！可多練習疑問句型。',
      },
      {
        name: 'Past Perfect',
        accuracy: 68,
        recentPerformance: '近三次：65% → 70% → 68%（波動中）',
        commonMistakes: ['had + p.p. 結構混淆', '與過去簡單式誤用'],
        suggestion: '建議複習過去完成式使用時機，特別是「過去的過去」概念。',
      },
      {
        name: 'Present Progressive',
        accuracy: 85,
        recentPerformance: '近三次：82% → 85% → 85%（穩定）',
        commonMistakes: ['stative verbs 誤用進行式'],
        suggestion: '注意狀態動詞（know, believe, like）通常不用進行式。',
      },
      {
        name: 'Future Tense',
        accuracy: 78,
        recentPerformance: '近三次：75% → 78% → 80%（進步中）',
        commonMistakes: ['will vs. be going to 選用錯誤'],
        suggestion: '複習 will（臨時決定）vs. be going to（計劃）的差異。',
      },
    ],
  },
  {
    mainTopic: 'Articles',
    subTopics: [
      {
        name: 'Definite (the)',
        accuracy: 88,
        recentPerformance: '近三次：85% → 88% → 90%',
        commonMistakes: ['特定對象但未加 the'],
        suggestion: '表現良好！注意獨一無二事物必加 the。',
      },
      {
        name: 'Indefinite (a/an)',
        accuracy: 90,
        recentPerformance: '近三次：88% → 90% → 92%',
        commonMistakes: ['母音開頭單字未用 an'],
        suggestion: '掌握良好，持續練習特殊情況（如 an hour）。',
      },
      {
        name: 'Zero Article (Ø)',
        accuracy: 72,
        recentPerformance: '近三次：70% → 72% → 74%',
        commonMistakes: ['複數泛指時誤加 the', '抽象名詞誤加冠詞'],
        suggestion: '加強複習何時不用冠詞（複數泛指、抽象概念）。',
      },
    ],
  },
  {
    mainTopic: 'Prepositions',
    subTopics: [
      {
        name: 'Time',
        accuracy: 80,
        recentPerformance: '近三次：78% → 80% → 82%',
        commonMistakes: ['in/on/at 時間介系詞混淆'],
        suggestion: '記住：at（時刻）、on（日期）、in（月/年/季）。',
      },
      {
        name: 'Place',
        accuracy: 85,
        recentPerformance: '近三次：83% → 85% → 87%',
        commonMistakes: ['in/at 地點介系詞選用錯誤'],
        suggestion: '表現不錯！注意 at（小地點）vs. in（大範圍）。',
      },
      {
        name: 'Movement',
        accuracy: 76,
        recentPerformance: '近三次：74% → 76% → 78%',
        commonMistakes: ['to/into/onto 方向介系詞誤用'],
        suggestion: '建議多練習動態介系詞，注意動詞搭配。',
      },
    ],
  },
  {
    mainTopic: 'S-V Agreement',
    subTopics: [
      {
        name: 'Singular/Plural',
        accuracy: 87,
        recentPerformance: '近三次：85% → 87% → 89%',
        commonMistakes: ['集合名詞單複數判斷錯誤'],
        suggestion: '掌握良好！注意 each/every 後接單數動詞。',
      },
      {
        name: 'Complex Subjects',
        accuracy: 70,
        recentPerformance: '近三次：68% → 70% → 72%',
        commonMistakes: ['either...or/neither...nor 動詞一致性錯誤'],
        suggestion: '複習相關句型，就近原則（動詞與最近主詞一致）。',
      },
    ],
  },
  {
    mainTopic: 'Clauses',
    subTopics: [
      {
        name: 'Relative Clauses',
        accuracy: 75,
        recentPerformance: '近三次：72% → 75% → 78%',
        commonMistakes: ['關係代名詞選用錯誤（who/which/that）'],
        suggestion: '加強限定/非限定關係子句的辨識與標點使用。',
      },
      {
        name: 'Conditional',
        accuracy: 65,
        recentPerformance: '近三次：60% → 65% → 68%',
        commonMistakes: ['假設語氣時態混淆', 'if 子句與主要子句時態不對應'],
        suggestion: '重點複習：Type 1/2/3 條件句的時態結構。',
      },
    ],
  },
];

// ===== 2. 各題型得分比率 =====
export const MOCK_QUESTION_TYPE_SCORES: QuestionTypeScore[] = [
  { type: 'multiple-choice', typeName: '單選題', score: 9, maxScore: 10, accuracy: 90 },
  { type: 'cloze', typeName: '克漏字', score: 7.5, maxScore: 10, accuracy: 75 },
  { type: 'fill-in-blank', typeName: '文意選填', score: 8, maxScore: 10, accuracy: 80 },
  { type: 'sentence-ordering', typeName: '篇章結構', score: 6, maxScore: 8, accuracy: 75 },
  { type: 'reading', typeName: '閱讀測驗', score: 20, maxScore: 24, accuracy: 83 },
  { type: 'hybrid', typeName: '混合題', score: 7, maxScore: 10, accuracy: 70 },
  { type: 'translation', typeName: '翻譯', score: 5, maxScore: 8, accuracy: 63 },
  { type: 'essay', typeName: '作文', score: 14, maxScore: 20, accuracy: 70 },
];

// ===== 3. 歷次模考總分 =====
export const MOCK_EXAM_HISTORY: ExamHistory[] = [
  { attemptId: 'attempt_001', date: '2025-01-05', score: 75, maxScore: 100 },
  { attemptId: 'attempt_002', date: '2025-01-12', score: 78, maxScore: 100 },
  { attemptId: 'attempt_003', date: '2025-01-19', score: 82, maxScore: 100 },
  { attemptId: 'attempt_004', date: '2025-01-26', score: 80, maxScore: 100 },
  { attemptId: 'attempt_005', date: '2025-02-02', score: 85, maxScore: 100 },
  { attemptId: 'attempt_006', date: '2025-02-09', score: 87, maxScore: 100 },
  { attemptId: 'attempt_007', date: '2025-02-16', score: 88, maxScore: 100 },
  { attemptId: 'attempt_008', date: '2025-02-23', score: 90, maxScore: 100 },
];

// ===== 4. Level 3-6 單字錯誤比率 =====
export const MOCK_VOCABULARY_LEVELS: VocabularyLevelData[] = [
  { level: 3, totalWords: 120, wrongWords: 8, errorRate: 6.7 },
  { level: 4, totalWords: 150, wrongWords: 22, errorRate: 14.7 },
  { level: 5, totalWords: 100, wrongWords: 28, errorRate: 28.0 },
  { level: 6, totalWords: 80, wrongWords: 35, errorRate: 43.8 },
];

// ===== 5. 各題型耗時 =====
export const MOCK_QUESTION_TYPE_TIMING: QuestionTypeTiming[] = [
  {
    type: 'multiple-choice',
    typeName: '單選題',
    totalTime: 480, // 8 分鐘
    averageTime: 48, // 每題平均 48 秒
    questionCount: 10,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 450 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 480 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 510 },
    ],
  },
  {
    type: 'cloze',
    typeName: '克漏字',
    totalTime: 720, // 12 分鐘
    averageTime: 72,
    questionCount: 10,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 700 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 720 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 740 },
    ],
  },
  {
    type: 'fill-in-blank',
    typeName: '文意選填',
    totalTime: 900, // 15 分鐘
    averageTime: 90,
    questionCount: 10,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 880 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 900 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 920 },
    ],
  },
  {
    type: 'sentence-ordering',
    typeName: '篇章結構',
    totalTime: 600, // 10 分鐘
    averageTime: 150,
    questionCount: 4,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 580 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 600 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 620 },
    ],
  },
  {
    type: 'reading',
    typeName: '閱讀測驗',
    totalTime: 1440, // 24 分鐘
    averageTime: 120,
    questionCount: 12,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 1400 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 1440 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 1480 },
    ],
  },
  {
    type: 'hybrid',
    typeName: '混合題',
    totalTime: 660, // 11 分鐘
    averageTime: 66,
    questionCount: 10,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 640 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 660 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 680 },
    ],
  },
  {
    type: 'translation',
    typeName: '翻譯',
    totalTime: 540, // 9 分鐘
    averageTime: 270,
    questionCount: 2,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 520 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 540 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 560 },
    ],
  },
  {
    type: 'essay',
    typeName: '作文',
    totalTime: 1800, // 30 分鐘
    averageTime: 1800,
    questionCount: 1,
    details: [
      { attemptId: 'attempt_001', date: '2025-01-05', time: 1750 },
      { attemptId: 'attempt_002', date: '2025-01-12', time: 1800 },
      { attemptId: 'attempt_003', date: '2025-01-19', time: 1850 },
    ],
  },
];
