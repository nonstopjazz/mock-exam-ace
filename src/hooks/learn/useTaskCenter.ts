import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TASK_SCENARIOS, needsAction, sortTasks, taskStateOf,
  type HistoryWeek, type StudentTask, type TaskScenario, type TaskStudentId,
} from "@/data/learn/taskCenterMock";

export type TaskView = "next_class" | "todo" | "awaiting" | "history";

interface State {
  tasks: StudentTask[];
  history: HistoryWeek[];
  /** 示範用：是否已經翻到下一週 */
  weekRolled: boolean;
}

const seed = (s: TaskScenario): State => ({
  tasks: structuredClone(s.tasks),
  history: structuredClone(s.history),
  weekRolled: false,
});

/**
 * Task Center 的狀態機。全部在記憶體，沒有 network call。
 * 🛑 學生只能改自己的自述與線上進度，永遠改不到 teacherCheck。
 */
export const useTaskCenter = (studentId: TaskStudentId) => {
  const scenario = TASK_SCENARIOS[studentId];
  const [state, setState] = useState<State>(() => seed(scenario));

  useEffect(() => setState(seed(TASK_SCENARIOS[studentId])), [studentId]);

  const patch = useCallback((fn: (t: StudentTask) => StudentTask, id: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? fn(structuredClone(t)) : t)),
    }));
  }, []);

  /** 紙本 / 外部：學生自述完成或取消。不會動到 teacherCheck */
  const toggleSelfReport = useCallback((id: string) => {
    patch((t) => (t.teacherCheck ? t : { ...t, studentReported: !t.studentReported }), id);
  }, [patch]);

  /** 線上任務：模擬做到一半 */
  const startDigital = useCallback((id: string) => {
    patch((t) => {
      const total = t.progress?.total ?? 10;
      return { ...t, progress: { done: Math.max(1, Math.round(total / 2)), total } };
    }, id);
  }, [patch]);

  /** 線上任務：模擬完成 —— 由平台記錄，學生不需要自述 */
  const completeDigital = useCallback((id: string, value: number) => {
    patch((t) => {
      const total = t.progress?.total ?? 10;
      return {
        ...t, autoCompleted: true,
        progress: { done: total, total },
        score: { value, total: 100 },
      };
    }, id);
  }, [patch]);

  /** 🛑 部分完成只有一個正向出口：我要補完 */
  const chooseFollowUp = useCallback((id: string) => {
    patch((t) => ({ ...t, followUp: "chosen" }), id);
  }, [patch]);

  const submitFollowUp = useCallback((id: string) => {
    patch((t) => ({ ...t, followUp: "submitted" }), id);
  }, [patch]);

  /**
   * 示範：進入下一週。
   * 🛑 Law 4 / Law 5 —— 沒有選擇補完的部分完成，成為當週的歷史事實，
   *    不會被帶進下一週繼續追著學生。
   */
  const rollWeek = useCallback(() => {
    setState((prev) => {
      if (prev.weekRolled) return prev;
      const stays: StudentTask[] = [];
      const archived = [];
      for (const t of prev.tasks) {
        const { key } = taskStateOf(t);
        if (key === "partial") {
          archived.push({
            id: `arch-${t.id}`, title: t.title, kind: t.kind,
            resultSource: "TEACHER" as const,
            resultLabel: `老師檢查：完成 ${t.teacherCheck?.percent}%`,
            partialPercent: t.teacherCheck?.percent,
          });
        } else if (key === "verified") {
          archived.push({
            id: `arch-${t.id}`, title: t.title, kind: t.kind,
            resultSource: t.kind === "digital" ? ("AUTO" as const) : ("TEACHER" as const),
            resultLabel: t.score ? `${t.score.value} / ${t.score.total}` : "老師已確認完成",
          });
        } else {
          stays.push(t);
        }
      }
      return {
        tasks: stays,
        history: [{ label: "上一堂課 · 本週結算", tasks: archived }, ...prev.history],
        weekRolled: true,
      };
    });
  }, []);

  const reset = useCallback(() => setState(seed(TASK_SCENARIOS[studentId])), [studentId]);

  /* ---------- 各視圖 ---------- */

  const nextClassTasks = useMemo(() => sortTasks(state.tasks), [state.tasks]);

  const todoTasks = useMemo(
    () => sortTasks(state.tasks.filter(needsAction)),
    [state.tasks],
  );

  const awaitingTasks = useMemo(
    () =>
      sortTasks(
        state.tasks.filter((t) => {
          const k = taskStateOf(t).key;
          return k === "self" || k === "resubmitted";
        }),
      ),
    [state.tasks],
  );

  /** 已完成：本週已有結論的 + 先前週的歷史 */
  const completedWeeks = useMemo<HistoryWeek[]>(() => {
    const thisWeek = state.tasks
      .filter((t) => {
        const k = taskStateOf(t).key;
        return k === "verified" || k === "partial";
      })
      .map((t) => ({
        id: `now-${t.id}`,
        title: t.title,
        kind: t.kind,
        resultSource: t.kind === "digital" ? ("AUTO" as const) : ("TEACHER" as const),
        resultLabel: t.score
          ? `${t.score.value} / ${t.score.total}`
          : t.teacherCheck?.status === "partial"
            ? `老師檢查：完成 ${t.teacherCheck.percent}%`
            : "老師已確認完成",
        partialPercent: t.teacherCheck?.status === "partial" ? t.teacherCheck.percent : undefined,
      }));
    return thisWeek.length
      ? [{ label: "本週 · 尚未結算", tasks: thisWeek }, ...state.history]
      : state.history;
  }, [state.tasks, state.history]);

  /** Next Class 摘要 —— readiness 只是其中一項，不是主角 */
  const summary = useMemo(() => {
    const count = (k: string) => state.tasks.filter((t) => taskStateOf(t).key === k).length;
    const ready = state.tasks.filter((t) => {
      const k = taskStateOf(t).key;
      return k === "verified" || k === "self" || k === "resubmitted";
    }).length;
    return {
      notStarted: count("none"),
      inProgress: count("in_progress"),
      partial: count("partial") + count("followup"),
      awaiting: count("self") + count("resubmitted"),
      ready,
      total: state.tasks.length,
    };
  }, [state.tasks]);

  return {
    scenario,
    tasks: state.tasks,
    weekRolled: state.weekRolled,
    nextClassTasks,
    todoTasks,
    awaitingTasks,
    completedWeeks,
    summary,
    toggleSelfReport,
    startDigital,
    completeDigital,
    chooseFollowUp,
    submitFollowUp,
    rollWeek,
    reset,
  };
};

export type TaskCenter = ReturnType<typeof useTaskCenter>;
