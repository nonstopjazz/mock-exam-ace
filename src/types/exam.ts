// 學測英文考試型別定義

export type QuestionType = 
  | 'multiple-choice'
  | 'cloze'
  | 'fill-in-blank'
  | 'sentence-ordering'
  | 'reading'
  | 'hybrid'
  | 'translation'
  | 'essay';

// 基礎題目介面
export interface BaseQuestion {
  id: string;
  type: QuestionType;
  points: number;
}

// 1. 單選題（10題，10分）
export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple-choice';
  question: string;
  options: {
    label: 'A' | 'B' | 'C' | 'D';
    text: string;
  }[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
}

// 2. 克漏字（2組×5題，10分）
export interface ClozeQuestion extends BaseQuestion {
  type: 'cloze';
  setId: string; // 區分第一組/第二組
  passage: string; // 含 {{1}}, {{2}} 等占位符
  questions: {
    blankNumber: number; // 1-5
    options: {
      label: 'A' | 'B' | 'C' | 'D';
      text: string;
    }[];
    correctAnswer: 'A' | 'B' | 'C' | 'D';
  }[];
}

// 3. 文意選填（10空，10-12選項，10分）
export interface FillInTheBlankSet extends BaseQuestion {
  type: 'fill-in-blank';
  passage: string; // 含 {{1}}, {{2}}, ... {{10}} 占位符
  optionPool: {
    label: string; // 'A', 'B', ... 'L'
    text: string;
  }[];
  blanks: {
    blankNumber: number; // 1-10
    correctAnswer: string; // 'A'-'L'
  }[];
}

// 4. 篇章結構（4空，4-5句子，8分）
export interface SentenceOrderingQuestion extends BaseQuestion {
  type: 'sentence-ordering';
  passage: string; // 含 {{1}}, {{2}}, {{3}}, {{4}} 占位符
  sentences: {
    label: string; // 'A', 'B', 'C', 'D', 'E'
    text: string;
  }[];
  blanks: {
    blankNumber: number; // 1-4
    correctAnswer: string; // 'A'-'E'
  }[];
}

// 5. 閱讀測驗（3組×4題，24分）
export interface ReadingSet extends BaseQuestion {
  type: 'reading';
  setId: string; // 區分三組
  passage: string;
  title?: string;
  questions: {
    questionNumber: number; // 1-4
    question: string;
    options: {
      label: 'A' | 'B' | 'C' | 'D';
      text: string;
    }[];
    correctAnswer: 'A' | 'B' | 'C' | 'D';
  }[];
}

// 6. 混合題（10分）
export interface HybridQuestion extends BaseQuestion {
  type: 'hybrid';
  setId: string;
  passage: string;
  questions: {
    questionNumber: number;
    question: string;
    questionType: 'single-choice' | 'multiple-choice' | 'text-input';
    options?: {
      label: string;
      text: string;
    }[];
    correctAnswer: string | string[]; // 單選：'A'，多選：['A','B']，填空：文字
  }[];
}

// 7. 翻譯（2組，8分）
export interface TranslationQuestion extends BaseQuestion {
  type: 'translation';
  questionNumber: number; // 1 或 2
  chineseText: string;
  correctAnswer: string; // 參考答案
  keyPoints?: string[]; // 評分要點
}

// 8. 作文（20分）
export interface EssayTask extends BaseQuestion {
  type: 'essay';
  prompt: string;
  wordLimit: {
    min: number;
    max: number;
  };
  rubric?: {
    content: number; // 內容 8分
    organization: number; // 組織 6分
    grammar: number; // 文法 4分
    vocabulary: number; // 字彙 2分
  };
}

// 統一題目型別
export type Question =
  | MultipleChoiceQuestion
  | ClozeQuestion
  | FillInTheBlankSet
  | SentenceOrderingQuestion
  | ReadingSet
  | HybridQuestion
  | TranslationQuestion
  | EssayTask;

// 考試區段
export interface ExamSection {
  sectionId: string;
  title: string;
  description?: string;
  totalPoints: number;
  questions: Question[];
}

// 完整試卷
export interface ExamPaper {
  examId: string;
  title: string;
  description: string;
  duration: number; // 分鐘
  totalPoints: number;
  sections: ExamSection[];
}

// 學生答案
export interface StudentAnswer {
  questionId: string;
  questionType: QuestionType;
  answer: string | string[] | { [key: string]: string }; // 彈性儲存不同題型答案
  timeSpent?: number; // 秒
}

// 考試結果
export interface ExamResult {
  attemptId: string;
  examId: string;
  studentId?: string;
  startTime: number;
  endTime: number;
  answers: StudentAnswer[];
  score?: number;
  breakdown?: {
    sectionId: string;
    score: number;
    maxScore: number;
  }[];
}
