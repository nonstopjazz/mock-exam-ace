import { useCallback, useEffect, useState } from "react";
import {
  STUDENT_SCENARIOS,
  type PracticeItem, type StudentId, type StudentScenario,
} from "@/data/learn/studentDashboardMock";

/**
 * 學生端首頁其餘區塊的狀態。
 *
 * 🛑 任務【不在這裡】。作業與常態練習已經是真實資料，走 useStudentTasks()
 *    與 learn_student_tasks() RPC；這個 hook 只剩下尚未接後端的示範區塊
 *    （今天的練習、學習狀況、節奏、成績、老師的話）。
 */
interface DashboardState {
  practice: PracticeItem[];
}

const seedFrom = (s: StudentScenario): DashboardState => ({
  practice: structuredClone(s.practice),
});

export const useStudentDashboard = (studentId: StudentId) => {
  const scenario = STUDENT_SCENARIOS[studentId];
  const [state, setState] = useState<DashboardState>(() => seedFrom(scenario));

  useEffect(() => {
    setState(seedFrom(STUDENT_SCENARIOS[studentId]));
  }, [studentId]);

  const togglePracticeDone = useCallback((itemId: string) => {
    setState((prev) => ({
      ...prev,
      practice: prev.practice.map((p) =>
        p.id === itemId
          ? p.done
            ? { ...p, done: false, doneSource: null }
            : { ...p, done: true, doneSource: p.mode === "online" ? "auto" : "self" }
          : p,
      ),
    }));
  }, []);

  const todayPractice = state.practice.filter((p) => p.scheduledToday);

  return {
    scenario,
    practice: state.practice,
    todayPractice,
    togglePracticeDone,
  };
};

export type StudentDashboard = ReturnType<typeof useStudentDashboard>;
