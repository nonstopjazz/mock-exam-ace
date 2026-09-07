import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SCENARIOS, type Assessment, type DigitalAssignment, type DigitalException,
  type HomeworkEntry, type HomeworkStatus, type NextHomework, type Observation,
  type Routine, type ScenarioId, type ScoreEntry, type SessionScenario,
  type SkillKey, type SkillRating,
} from "@/data/learn/teacherSessionMock";

export type SaveState = "idle" | "saving" | "saved";
export type SessionStatus = "in_progress" | "completed";

interface WorkspaceState {
  status: SessionStatus;
  homework: Record<string, HomeworkEntry>;
  observations: Record<string, Observation>;
  assessments: Assessment[];
  nextHomework: NextHomework;
  recurring: Routine[];
  digital: DigitalAssignment[];
}

/** 深拷貝 seed，讓切換 scenario 時回到乾淨狀態 */
const seedFrom = (s: SessionScenario): WorkspaceState => ({
  status: "in_progress",
  homework: structuredClone(s.previousHomework),
  observations: structuredClone(s.observations),
  assessments: structuredClone(s.assessments),
  nextHomework: structuredClone(s.nextHomework),
  recurring: structuredClone(s.recurring),
  digital: structuredClone(s.digital),
});

let seq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now()}_${seq++}`;

/**
 * 整個 workspace 的狀態機。全部在記憶體裡 —— 沒有任何 network call。
 * 每次變更都會觸發 autosave 指示（模擬），不需要老師按 Save。
 */
export const useSessionWorkspace = (scenarioId: ScenarioId) => {
  const scenario = SCENARIOS[scenarioId];
  const [state, setState] = useState<WorkspaceState>(() => seedFrom(scenario));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<string>("18:52");
  const firstRun = useRef(true);

  // 切換 scenario → 重新載入該情境的 seed
  useEffect(() => {
    setState(seedFrom(SCENARIOS[scenarioId]));
    firstRun.current = true;
  }, [scenarioId]);

  // Autosave（模擬）：任何變更後短暫顯示「儲存中」再回到「已自動儲存」
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      setSaveState("saved");
      setSavedAt(
        new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }),
      );
    }, 550);
    return () => clearTimeout(t);
  }, [state]);

  const patch = useCallback((fn: (s: WorkspaceState) => WorkspaceState) => {
    setState((prev) => fn(structuredClone(prev)));
  }, []);

  /* ---------- Previous homework ---------- */

  const setHomeworkStatus = useCallback((studentId: string, status: HomeworkStatus) => {
    patch((s) => {
      const prev = s.homework[studentId];
      s.homework[studentId] =
        status === "partial"
          ? { status, percent: prev?.percent ?? 50 }
          : { status };
      return s;
    });
  }, [patch]);

  const setHomeworkPercent = useCallback((studentId: string, percent: number) => {
    patch((s) => {
      const clamped = Math.max(0, Math.min(100, percent));
      s.homework[studentId] = { status: "partial", percent: clamped };
      return s;
    });
  }, [patch]);

  const markAllHomeworkDone = useCallback(() => {
    patch((s) => {
      scenario.students.forEach((st) => { s.homework[st.id] = { status: "done" }; });
      return s;
    });
  }, [patch, scenario.students]);

  /* ---------- Today's performance ---------- */

  const setObservationNote = useCallback((studentId: string, note: string) => {
    patch((s) => {
      s.observations[studentId] = { ...(s.observations[studentId] ?? { note: "", skills: {} }), note };
      return s;
    });
  }, [patch]);

  const setSkillRating = useCallback(
    (studentId: string, skill: SkillKey, rating: SkillRating) => {
      patch((s) => {
        const o = s.observations[studentId] ?? { note: "", skills: {} };
        const skills = { ...o.skills };
        if (rating === "not_observed") delete skills[skill];
        else skills[skill] = rating;
        s.observations[studentId] = { ...o, skills };
        return s;
      });
    },
    [patch],
  );

  /* ---------- Assessments ---------- */

  const addManualAssessment = useCallback((title: string, totalScore: number) => {
    const id = nextId("a");
    patch((s) => {
      s.assessments.push({
        id, title, source: "TEACHER", totalScore, systemGenerated: false,
        scores: Object.fromEntries(
          scenario.students.map((st) => [st.id, { state: "not_taken" } as ScoreEntry]),
        ),
      });
      return s;
    });
    return id;
  }, [patch, scenario.students]);

  const setScore = useCallback((assessmentId: string, studentId: string, raw: string) => {
    patch((s) => {
      const a = s.assessments.find((x) => x.id === assessmentId);
      if (!a) return s;
      const prev = a.scores[studentId] ?? { state: "not_taken" };
      if (raw.trim() === "") {
        a.scores[studentId] = { ...prev, state: "not_taken", value: undefined };
      } else {
        const n = Math.max(0, Math.min(a.totalScore, Number(raw)));
        a.scores[studentId] = { ...prev, state: "scored", value: Number.isNaN(n) ? undefined : n };
      }
      return s;
    });
  }, [patch]);

  const setScoreState = useCallback(
    (assessmentId: string, studentId: string, next: ScoreEntry["state"]) => {
      patch((s) => {
        const a = s.assessments.find((x) => x.id === assessmentId);
        if (!a) return s;
        const prev = a.scores[studentId] ?? { state: "not_taken" };
        a.scores[studentId] =
          next === "scored" ? { ...prev, state: "scored" } : { ...prev, state: next, value: undefined };
        return s;
      });
    },
    [patch],
  );

  const setScoreNote = useCallback((assessmentId: string, studentId: string, note: string) => {
    patch((s) => {
      const a = s.assessments.find((x) => x.id === assessmentId);
      if (!a) return s;
      a.scores[studentId] = { ...(a.scores[studentId] ?? { state: "not_taken" }), note };
      return s;
    });
  }, [patch]);

  const removeAssessment = useCallback((assessmentId: string) => {
    patch((s) => {
      s.assessments = s.assessments.filter((a) => a.id !== assessmentId);
      return s;
    });
  }, [patch]);

  /* ---------- Next-session homework ---------- */

  const updateNextHomework = useCallback((fields: Partial<NextHomework>) => {
    patch((s) => { s.nextHomework = { ...s.nextHomework, ...fields }; return s; });
  }, [patch]);

  const upsertHomeworkException = useCallback((studentId: string, text: string) => {
    patch((s) => {
      const list = s.nextHomework.exceptions;
      const i = list.findIndex((e) => e.studentId === studentId);
      if (i >= 0) list[i] = { studentId, text };
      else list.push({ studentId, text });
      return s;
    });
  }, [patch]);

  const removeHomeworkException = useCallback((studentId: string) => {
    patch((s) => {
      s.nextHomework.exceptions = s.nextHomework.exceptions.filter((e) => e.studentId !== studentId);
      return s;
    });
  }, [patch]);

  /* ---------- Recurring practice ---------- */

  const addRoutine = useCallback((title: string, cadence: string, minutes: number) => {
    patch((s) => {
      s.recurring.push({ id: nextId("r"), title, cadence, minutes, active: true, exceptions: [] });
      return s;
    });
  }, [patch]);

  const updateRoutine = useCallback((id: string, fields: Partial<Routine>) => {
    patch((s) => {
      const r = s.recurring.find((x) => x.id === id);
      if (r) Object.assign(r, fields);
      return s;
    });
  }, [patch]);

  const upsertRoutineException = useCallback((routineId: string, studentId: string, text: string) => {
    patch((s) => {
      const r = s.recurring.find((x) => x.id === routineId);
      if (!r) return s;
      const i = r.exceptions.findIndex((e) => e.studentId === studentId);
      if (i >= 0) r.exceptions[i] = { studentId, text };
      else r.exceptions.push({ studentId, text });
      return s;
    });
  }, [patch]);

  const removeRoutineException = useCallback((routineId: string, studentId: string) => {
    patch((s) => {
      const r = s.recurring.find((x) => x.id === routineId);
      if (r) r.exceptions = r.exceptions.filter((e) => e.studentId !== studentId);
      return s;
    });
  }, [patch]);

  /* ---------- Digital assignment ---------- */

  const addDigital = useCallback(
    (a: Omit<DigitalAssignment, "id" | "exceptions" | "dueMode" | "customDue">) => {
      patch((s) => {
        s.digital.push({ ...a, id: nextId("d"), dueMode: "next_class", customDue: "", exceptions: [] });
        return s;
      });
    },
    [patch],
  );

  const updateDigital = useCallback((id: string, fields: Partial<DigitalAssignment>) => {
    patch((s) => {
      const d = s.digital.find((x) => x.id === id);
      if (d) Object.assign(d, fields);
      return s;
    });
  }, [patch]);

  const removeDigital = useCallback((id: string) => {
    patch((s) => { s.digital = s.digital.filter((d) => d.id !== id); return s; });
  }, [patch]);

  const upsertDigitalException = useCallback((digitalId: string, ex: DigitalException) => {
    patch((s) => {
      const d = s.digital.find((x) => x.id === digitalId);
      if (!d) return s;
      const i = d.exceptions.findIndex((e) => e.studentId === ex.studentId);
      if (i >= 0) d.exceptions[i] = ex;
      else d.exceptions.push(ex);
      return s;
    });
  }, [patch]);

  const removeDigitalException = useCallback((digitalId: string, studentId: string) => {
    patch((s) => {
      const d = s.digital.find((x) => x.id === digitalId);
      if (d) d.exceptions = d.exceptions.filter((e) => e.studentId !== studentId);
      return s;
    });
  }, [patch]);

  /* ---------- Finish ---------- */

  const finishSession = useCallback(() => {
    patch((s) => { s.status = "completed"; return s; });
  }, [patch]);

  const reopenSession = useCallback(() => {
    patch((s) => { s.status = "in_progress"; return s; });
  }, [patch]);

  /* ---------- Derived summary（只是計數，不是完成度檢查） ---------- */

  const summary = useMemo(() => {
    const observed = scenario.students.filter((st) => {
      const o = state.observations[st.id];
      return !!o && (o.note.trim().length > 0 || Object.keys(o.skills).length > 0);
    }).length;
    return {
      observations: observed,
      studentCount: scenario.students.length,
      assessments: state.assessments.length,
      nextHomework: state.nextHomework.classDefault.trim() ? 1 : 0,
      recurring: state.recurring.filter((r) => r.active).length,
      digital: state.digital.length,
    };
  }, [scenario.students, state]);

  return {
    scenario,
    state,
    saveState,
    savedAt,
    summary,
    setHomeworkStatus,
    setHomeworkPercent,
    markAllHomeworkDone,
    setObservationNote,
    setSkillRating,
    addManualAssessment,
    setScore,
    setScoreState,
    setScoreNote,
    removeAssessment,
    updateNextHomework,
    upsertHomeworkException,
    removeHomeworkException,
    addRoutine,
    updateRoutine,
    upsertRoutineException,
    removeRoutineException,
    addDigital,
    updateDigital,
    removeDigital,
    upsertDigitalException,
    removeDigitalException,
    finishSession,
    reopenSession,
  };
};

export type SessionWorkspace = ReturnType<typeof useSessionWorkspace>;
