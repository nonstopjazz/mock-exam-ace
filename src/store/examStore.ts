import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Question, ExamPaper, StudentAnswer } from '@/types/exam';

interface QuestionTiming {
  questionId: string;
  startTime: number | null;
  totalTime: number; // 累計秒數
  isPaused: boolean;
}

interface ExamState {
  currentAttemptId: string | null;
  examPaper: ExamPaper | null;
  currentQuestionIndex: number;
  answers: Record<string, any>;
  startTime: number | null;
  timeRemaining: number;
  isSubmitted: boolean;
  
  // 題目計時
  questionTimings: Record<string, QuestionTiming>;
  currentQuestionId: string | null;
  
  // Actions
  startExam: (examPaper: ExamPaper) => void;
  setAnswer: (questionId: string, answer: any) => void;
  setCurrentQuestionIndex: (index: number) => void;
  submitExam: () => void;
  resetExam: () => void;
  updateTimeRemaining: (time: number) => void;
  
  // 計時相關
  startQuestionTimer: (questionId: string) => void;
  stopQuestionTimer: (questionId: string) => void;
  pauseAllTimers: () => void;
  resumeAllTimers: () => void;
  switchQuestion: (prevQuestionId: string | null, nextQuestionId: string) => void;
  getTimingSummary: () => { questionId: string; timeSpent: number }[];
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      currentAttemptId: null,
      examPaper: null,
      currentQuestionIndex: 0,
      answers: {},
      startTime: null,
      timeRemaining: 0,
      isSubmitted: false,
      questionTimings: {},
      currentQuestionId: null,

      startExam: (examPaper) => {
        const attemptId = `attempt_${Date.now()}`;
        const allQuestions = examPaper.sections.flatMap((s) => s.questions);
        const firstQuestionId = allQuestions[0]?.id;
        
        set({
          currentAttemptId: attemptId,
          examPaper,
          currentQuestionIndex: 0,
          answers: {},
          startTime: Date.now(),
          timeRemaining: examPaper.duration * 60,
          isSubmitted: false,
          questionTimings: {},
          currentQuestionId: firstQuestionId || null,
        });
        
        // 啟動第一題計時
        if (firstQuestionId) {
          get().startQuestionTimer(firstQuestionId);
        }
      },

      setAnswer: (questionId, answer) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: answer },
        })),

      setCurrentQuestionIndex: (index) => {
        const state = get();
        const allQuestions = state.examPaper?.sections.flatMap((s) => s.questions) || [];
        const prevQuestionId = allQuestions[state.currentQuestionIndex]?.id;
        const nextQuestionId = allQuestions[index]?.id;
        
        if (prevQuestionId && nextQuestionId) {
          state.switchQuestion(prevQuestionId, nextQuestionId);
        }
        
        set({ currentQuestionIndex: index, currentQuestionId: nextQuestionId || null });
      },

      submitExam: () => {
        const state = get();
        
        // 停止當前題目計時
        if (state.currentQuestionId) {
          state.stopQuestionTimer(state.currentQuestionId);
        }
        
        // 取得計時摘要
        const timingSummary = state.getTimingSummary();
        
        // TODO: Submit to API
        console.log('=== 交卷 Payload (Mock) ===');
        console.log({
          attemptId: state.currentAttemptId,
          examId: state.examPaper?.examId,
          startTime: state.startTime,
          endTime: Date.now(),
          answers: Object.entries(state.answers).map(([questionId, answer]) => ({
            questionId,
            answer,
            timeSpent: timingSummary.find((t) => t.questionId === questionId)?.timeSpent || 0,
          })),
          timingSummary,
        });
        
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
          questionTimings: {},
          currentQuestionId: null,
        }),

      updateTimeRemaining: (time) => set({ timeRemaining: time }),

      // 計時功能
      startQuestionTimer: (questionId) => {
        const state = get();
        const existing = state.questionTimings[questionId];
        
        set({
          questionTimings: {
            ...state.questionTimings,
            [questionId]: {
              questionId,
              startTime: Date.now(),
              totalTime: existing?.totalTime || 0,
              isPaused: false,
            },
          },
        });
      },

      stopQuestionTimer: (questionId) => {
        const state = get();
        const timing = state.questionTimings[questionId];
        
        if (timing && timing.startTime && !timing.isPaused) {
          const elapsed = Math.floor((Date.now() - timing.startTime) / 1000);
          set({
            questionTimings: {
              ...state.questionTimings,
              [questionId]: {
                ...timing,
                startTime: null,
                totalTime: timing.totalTime + elapsed,
                isPaused: true,
              },
            },
          });
        }
      },

      pauseAllTimers: () => {
        const state = get();
        const now = Date.now();
        const updatedTimings = { ...state.questionTimings };
        
        Object.keys(updatedTimings).forEach((qid) => {
          const timing = updatedTimings[qid];
          if (timing.startTime && !timing.isPaused) {
            const elapsed = Math.floor((now - timing.startTime) / 1000);
            updatedTimings[qid] = {
              ...timing,
              startTime: null,
              totalTime: timing.totalTime + elapsed,
              isPaused: true,
            };
          }
        });
        
        set({ questionTimings: updatedTimings });
      },

      resumeAllTimers: () => {
        const state = get();
        const updatedTimings = { ...state.questionTimings };
        
        Object.keys(updatedTimings).forEach((qid) => {
          const timing = updatedTimings[qid];
          if (timing.isPaused && qid === state.currentQuestionId) {
            updatedTimings[qid] = {
              ...timing,
              startTime: Date.now(),
              isPaused: false,
            };
          }
        });
        
        set({ questionTimings: updatedTimings });
      },

      switchQuestion: (prevQuestionId, nextQuestionId) => {
        const state = get();
        
        // 停止前一題
        if (prevQuestionId) {
          state.stopQuestionTimer(prevQuestionId);
        }
        
        // 開始新題
        state.startQuestionTimer(nextQuestionId);
      },

      getTimingSummary: () => {
        const state = get();
        const now = Date.now();
        
        return Object.values(state.questionTimings).map((timing) => {
          let timeSpent = timing.totalTime;
          
          // 如果還在計時中，加上當前時段
          if (timing.startTime && !timing.isPaused) {
            timeSpent += Math.floor((now - timing.startTime) / 1000);
          }
          
          return {
            questionId: timing.questionId,
            timeSpent,
          };
        });
      },
    }),
    {
      name: 'exam-storage',
    }
  )
);
