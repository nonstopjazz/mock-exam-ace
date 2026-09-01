import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STUDENT_SCENARIOS,
  type PracticeItem, type StudentId, type StudentScenario,
} from "@/data/learn/studentDashboardMock";
import {
  TASK_SCENARIOS, needsAction, sortTasks, taskStateOf, type StudentTask,
} from "@/data/learn/taskCenterMock";

interface DashboardState {
  /** 任務模型與 Next Class 區塊共用同一份定義，全站只有一套 task model */
  tasks: StudentTask[];
  practice: PracticeItem[];
}

const seedFrom = (s: StudentScenario): DashboardState => ({
  tasks: structuredClone(TASK_SCENARIOS[s.id].tasks),
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

  const patchTask = useCallback((id: string, fn: (t: StudentTask) => StudentTask) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? fn(structuredClone(t)) : t)),
    }));
  }, []);

  /** 紙本 / 外部：學生自行標記。🛑 永遠碰不到 teacherCheck */
  const toggleSelfReport = useCallback((id: string) => {
    patchTask(id, (t) => (t.teacherCheck ? t : { ...t, studentReported: !t.studentReported }));
  }, [patchTask]);

  /** 線上任務做到一半 —— 由平台記錄，不是學生自述 */
  const startDigital = useCallback((id: string) => {
    patchTask(id, (t) => {
      const total = t.progress?.total ?? 10;
      return { ...t, progress: { done: Math.max(1, Math.round(total / 2)), total } };
    });
  }, [patchTask]);

  /** 線上任務完成 —— 同樣由平台記錄 */
  const completeDigital = useCallback((id: string, value = 86) => {
    patchTask(id, (t) => {
      const total = t.progress?.total ?? 10;
      return { ...t, autoCompleted: true, progress: { done: total, total }, score: { value, total: 100 } };
    });
  }, [patchTask]);

  /** 🛑 部分完成只有一個正向出口：我要補完 */
  const chooseFollowUp = useCallback((id: string) => {
    patchTask(id, (t) => ({ ...t, followUp: "chosen" }));
  }, [patchTask]);

  const submitFollowUp = useCallback((id: string) => {
    patchTask(id, (t) => ({ ...t, followUp: "submitted" }));
  }, [patchTask]);

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

  /** 依「還需行動 → 不需立即行動 → 已完成」排序，同狀態再看急迫度 */
  const orderedTasks = useMemo(() => sortTasks(state.tasks), [state.tasks]);

  /** Next Class 摘要。readiness 仍是次要資訊，不是大型分析區塊 */
  const readiness = useMemo(() => {
    const count = (k: string) => state.tasks.filter((t) => taskStateOf(t).key === k).length;
    const ready = state.tasks.filter((t) => {
      const k = taskStateOf(t).key;
      return k === "verified" || k === "self" || k === "resubmitted";
    }).length;
    return {
      ready,
      total: state.tasks.length,
      needAction: state.tasks.filter(needsAction).length,
      partial: count("partial"),
      awaiting: count("self") + count("resubmitted"),
      verified: count("verified"),
    };
  }, [state.tasks]);

  const todayPractice = useMemo(
    () => state.practice.filter((p) => p.scheduledToday),
    [state.practice],
  );

  return {
    scenario,
    tasks: orderedTasks,
    practice: state.practice,
    todayPractice,
    readiness,
    toggleSelfReport,
    startDigital,
    completeDigital,
    chooseFollowUp,
    submitFollowUp,
    togglePracticeDone,
  };
};

export type StudentDashboard = ReturnType<typeof useStudentDashboard>;
