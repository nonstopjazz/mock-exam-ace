import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STUDENT_SCENARIOS, isTaskReady,
  type ClassTask, type PracticeItem, type StudentId, type StudentScenario,
} from "@/data/learn/studentDashboardMock";

interface DashboardState {
  tasks: ClassTask[];
  practice: PracticeItem[];
}

const seedFrom = (s: StudentScenario): DashboardState => ({
  tasks: structuredClone(s.tasks),
  practice: structuredClone(s.practice),
});

/**
 * 學生端首頁的狀態。全部在記憶體裡，沒有任何 network call。
 * 🛑 學生只能改自己的 self-report，不能改 teacherCheck ——
 *    這一點刻意在 API 層就限制住，避免 UI 不小心讓學生「自己確認自己」。
 */
export const useStudentDashboard = (studentId: StudentId) => {
  const scenario = STUDENT_SCENARIOS[studentId];
  const [state, setState] = useState<DashboardState>(() => seedFrom(scenario));

  useEffect(() => {
    setState(seedFrom(STUDENT_SCENARIOS[studentId]));
  }, [studentId]);

  /** 學生自行標記 / 取消標記紙本或外部作業。不會動到 teacherCheck */
  const toggleSelfReport = useCallback((taskId: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId && t.kind !== "digital"
          ? { ...t, studentReported: !t.studentReported }
          : t,
      ),
    }));
  }, []);

  /** 平台內任務完成 —— 由系統記錄，不是學生自述 */
  const completeDigital = useCallback((taskId: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId && t.kind === "digital" ? { ...t, autoCompleted: true } : t,
      ),
    }));
  }, []);

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

  const readiness = useMemo(() => {
    const ready = state.tasks.filter(isTaskReady).length;
    return { ready, total: state.tasks.length };
  }, [state.tasks]);

  const todayPractice = useMemo(
    () => state.practice.filter((p) => p.scheduledToday),
    [state.practice],
  );

  return {
    scenario,
    tasks: state.tasks,
    practice: state.practice,
    todayPractice,
    readiness,
    toggleSelfReport,
    completeDigital,
    togglePracticeDone,
  };
};

export type StudentDashboard = ReturnType<typeof useStudentDashboard>;
