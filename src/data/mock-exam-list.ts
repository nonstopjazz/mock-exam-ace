export interface ExamListItem {
  id: string;
  title: string;
  year: string;
  type: 'past' | 'mock';
  category?: string; // e.g., '北模', '全模'
  description: string;
  duration: number; // minutes
  totalPoints: number;
  hasContent: boolean; // true for past exams, false for mock exams
}

// 歷屆試題（有完整題目內容）
export const PAST_EXAMS: ExamListItem[] = [
  {
    id: 'past-114',
    title: '114 學年度學科能力測驗',
    year: '114',
    type: 'past',
    description: '114 學測英文科正式考題',
    duration: 100,
    totalPoints: 100,
    hasContent: true,
  },
  {
    id: 'past-113',
    title: '113 學年度學科能力測驗',
    year: '113',
    type: 'past',
    description: '113 學測英文科正式考題',
    duration: 100,
    totalPoints: 100,
    hasContent: true,
  },
  {
    id: 'past-112',
    title: '112 學年度學科能力測驗',
    year: '112',
    type: 'past',
    description: '112 學測英文科正式考題',
    duration: 100,
    totalPoints: 100,
    hasContent: true,
  },
  {
    id: 'past-111',
    title: '111 學年度學科能力測驗',
    year: '111',
    type: 'past',
    description: '111 學測英文科正式考題',
    duration: 100,
    totalPoints: 100,
    hasContent: true,
  },
];

// 模擬考題（無題目內容，僅計時）
export const MOCK_EXAMS: ExamListItem[] = [
  {
    id: 'mock-north-113-1',
    title: '113 年北模第 1 次',
    year: '113',
    type: 'mock',
    category: '北模',
    description: '北區模擬考第一次，需搭配紙本題本作答',
    duration: 100,
    totalPoints: 100,
    hasContent: false,
  },
  {
    id: 'mock-north-113-2',
    title: '113 年北模第 2 次',
    year: '113',
    type: 'mock',
    category: '北模',
    description: '北區模擬考第二次，需搭配紙本題本作答',
    duration: 100,
    totalPoints: 100,
    hasContent: false,
  },
  {
    id: 'mock-north-113-3',
    title: '113 年北模第 3 次',
    year: '113',
    type: 'mock',
    category: '北模',
    description: '北區模擬考第三次，需搭配紙本題本作答',
    duration: 100,
    totalPoints: 100,
    hasContent: false,
  },
  {
    id: 'mock-national-113-1',
    title: '113 年全模第 1 次',
    year: '113',
    type: 'mock',
    category: '全模',
    description: '全國模擬考第一次，需搭配紙本題本作答',
    duration: 100,
    totalPoints: 100,
    hasContent: false,
  },
  {
    id: 'mock-national-113-2',
    title: '113 年全模第 2 次',
    year: '113',
    type: 'mock',
    category: '全模',
    description: '全國模擬考第二次，需搭配紙本題本作答',
    duration: 100,
    totalPoints: 100,
    hasContent: false,
  },
  {
    id: 'mock-national-113-3',
    title: '113 年全模第 3 次',
    year: '113',
    type: 'mock',
    category: '全模',
    description: '全國模擬考第三次，需搭配紙本題本作答',
    duration: 100,
    totalPoints: 100,
    hasContent: false,
  },
];

export const ALL_EXAMS = [...PAST_EXAMS, ...MOCK_EXAMS];
