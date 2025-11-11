import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Question, ExamPaper, StudentAnswer } from '@/types/exam';

interface ExamState {
  currentAttemptId: string | null;
  examPaper: ExamPaper | null;
  currentQuestionIndex: number;
  answers: Record<string, any>; // 彈性儲存各種答案格式
  startTime: number | null;
  timeRemaining: number;
  isSubmitted: boolean;
  
  // Actions
  startExam: (examPaper: ExamPaper) => void;
  setAnswer: (questionId: string, answer: any) => void;
  setCurrentQuestionIndex: (index: number) => void;
  submitExam: () => void;
  resetExam: () => void;
  updateTimeRemaining: (time: number) => void;
}

export const useExamStore = create<ExamState>()(
  persist(
    (set) => ({
      currentAttemptId: null,
      examPaper: null,
      currentQuestionIndex: 0,
      answers: {},
      startTime: null,
      timeRemaining: 0,
      isSubmitted: false,

      startExam: (examPaper) => {
        const attemptId = `attempt_${Date.now()}`;
        set({
          currentAttemptId: attemptId,
          examPaper,
          currentQuestionIndex: 0,
          answers: {},
          startTime: Date.now(),
          timeRemaining: examPaper.duration * 60, // Convert to seconds
          isSubmitted: false,
        });
      },

      setAnswer: (questionId, answer) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: answer },
        })),

      setCurrentQuestionIndex: (index) =>
        set({ currentQuestionIndex: index }),

      submitExam: () => {
        // TODO: Submit to API
        set({ isSubmitted: true });
      },

      resetExam: () =>
        set({
          currentAttemptId: null,
          examPaper: null,
          currentQuestionIndex: 0,
          answers: {},
          startTime: null,
          timeRemaining: 0,
          isSubmitted: false,
        }),

      updateTimeRemaining: (time) => set({ timeRemaining: time }),
    }),
    {
      name: 'exam-storage',
    }
  )
);
