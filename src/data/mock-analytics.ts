// TODO: 未來從 API 拉取真實分析數據
// GET /api/analytics/grammar-topics?userId={uid}&days={7|30|90}
// GET /api/analytics/question-types?userId={uid}&days={7|30|90}
// GET /api/analytics/exam-history?userId={uid}&days={7|30|90}
// GET /api/analytics/vocabulary-levels?userId={uid}&days={7|30|90}
// GET /api/analytics/timing-stats?userId={uid}&days={7|30|90}

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

// ===== 各題型得分比率 =====
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
