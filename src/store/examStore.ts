import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// TODO: Replace with API types
export interface Question {
  id: string;
  type: 'multiple-choice' | 'cloze' | 'reading';
  content: string;
  options?: string[];
  correctAnswer?: string;
  passage?: string;
}

export interface Answer {
  questionId: string;
  answer: string;
  timeSpent: number;
}

interface ExamState {
  currentAttemptId: string | null;
  questions: Question[];
  answers: Record<string, string>;
  startTime: number | null;
  timeRemaining: number;
  isSubmitted: boolean;
  
  // Actions
  startExam: (questions: Question[], duration: number) => void;
  setAnswer: (questionId: string, answer: string) => void;
  submitExam: () => void;
  resetExam: () => void;
  updateTimeRemaining: (time: number) => void;
}

export const useExamStore = create<ExamState>()(
  persist(
    (set) => ({
      currentAttemptId: null,
      questions: [],
      answers: {},
      startTime: null,
      timeRemaining: 0,
      isSubmitted: false,

      startExam: (questions, duration) => {
        const attemptId = `attempt_${Date.now()}`;
        set({
          currentAttemptId: attemptId,
          questions,
          answers: {},
          startTime: Date.now(),
          timeRemaining: duration * 60, // Convert to seconds
          isSubmitted: false,
        });
      },

      setAnswer: (questionId, answer) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: answer },
        })),

      submitExam: () => {
        // TODO: Submit to API
        set({ isSubmitted: true });
      },

      resetExam: () =>
        set({
          currentAttemptId: null,
          questions: [],
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
