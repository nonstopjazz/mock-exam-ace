import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  AdminClassDetail, AdminTask, Recurrence, DueType, TaskType, TeacherStatus,
  StudentSearchResult,
} from "@/lib/learn/tasks";

export interface TaskDraft {
  taskId: string | null;
  type: TaskType;
  title: string;
  instruction: string;
  dueType: DueType;
  dueDate: string | null;
  recurrence: Recurrence;
  targetPerPeriod: number;
  /** null = 指派給全班；陣列 = 只指派給這些人 */
  studentIds: string[] | null;
}

type Result = { ok: true; retained?: string[] } | { ok: false; error: string };

/**
 * 單一班級的完整狀態（名冊 + 任務 + 每位學生的進度）。
 *
 * 一次 RPC 載入整頁，任何寫入之後重新載入——班級頁的資料彼此相依
 * （改名冊會影響指派、改上課日期會影響所有 NEXT_CLASS 作業），
 * 局部更新很容易讓畫面說謊。
 */
export function useAdminClassDetail(classId: string | undefined) {
  const [detail, setDetail] = useState<AdminClassDetail | null>(null);
  const [archived, setArchived] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setError(null);
    // 🛑 兩次往返，不是一次帶全部。班級頁預設只該看到進行中的任務——
    //    把已封存的混進同一份資料，畫面就得到處寫 filter，而漏掉一處
    //    就是「封存了還在眼前」。分開拿，兩邊的意義不會混。
    const { data, error: rpcError } = await supabase.rpc("learn_admin_class_detail", {
      p_class_id: classId,
    });
    if (rpcError) {
      setError(rpcError.message);
      setDetail(null);
      setArchived([]);
      setLoading(false);
      return;
    }
    setDetail(data as unknown as AdminClassDetail);

    const { data: withArchived } = await supabase.rpc("learn_admin_class_detail", {
      p_class_id: classId,
      p_include_archived: true,
    });
    setArchived(
      ((withArchived as unknown as AdminClassDetail | null)?.tasks ?? [])
        .filter((t) => t.status === "ARCHIVED"),
    );
    setLoading(false);
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (fn: string, params: Record<string, unknown>): Promise<Result> => {
      const { error: rpcError } = await supabase.rpc(fn, params);
      if (rpcError) return { ok: false, error: rpcError.message };
      await load();
      return { ok: true };
    },
    [load],
  );

  /* ---------- 班級 ---------- */

  const rename = useCallback(
    (name: string, nextClassDate: string | null) =>
      run("learn_admin_upsert_class", {
        p_class_id: classId,
        p_name: name,
        p_next_class_date: nextClassDate,
        p_note: detail?.class.note ?? null,
      }),
    [run, classId, detail],
  );

  /**
   * 只改下次上課日期。回傳受影響的 NEXT_CLASS 作業數，讓 UI 可以告訴老師
   * 「這一動會移動幾筆作業」，而不是安靜地改掉全班的截止日。
   */
  const setNextClassDate = useCallback(
    async (date: string | null) => {
      const { data, error: rpcError } = await supabase.rpc("learn_admin_set_next_class_date", {
        p_class_id: classId,
        p_date: date,
      });
      if (rpcError) return { ok: false as const, error: rpcError.message };
      await load();
      return { ok: true as const, affected: (data as { affected_homework: number }).affected_homework };
    },
    [classId, load],
  );

  /* ---------- 名冊 ---------- */

  const searchStudents = useCallback(
    async (query: string): Promise<StudentSearchResult[]> => {
      const { data, error: rpcError } = await supabase.rpc("learn_admin_search_students", {
        p_query: query,
        p_class_id: classId,
      });
      if (rpcError) return [];
      return (data as unknown as StudentSearchResult[]) ?? [];
    },
    [classId],
  );

  const addMembers = useCallback(
    (studentIds: string[]) =>
      run("learn_admin_add_class_members", { p_class_id: classId, p_student_ids: studentIds }),
    [run, classId],
  );

  const removeMember = useCallback(
    (studentId: string) =>
      run("learn_admin_remove_class_member", { p_class_id: classId, p_student_id: studentId }),
    [run, classId],
  );

  /* ---------- 任務 ---------- */

  const saveTask = useCallback(
    async (draft: TaskDraft): Promise<Result> => {
      const { data, error: rpcError } = await supabase.rpc("learn_admin_upsert_task", {
        p_task_id: draft.taskId,
        p_class_id: classId,
        p_type: draft.type,
        p_title: draft.title,
        p_instruction: draft.instruction || null,
        p_due_type: draft.type === "HOMEWORK" ? draft.dueType : null,
        p_due_date: draft.type === "HOMEWORK" && draft.dueType === "CUSTOM_DATE" ? draft.dueDate : null,
        p_recurrence: draft.type === "RECURRING" ? draft.recurrence : null,
        p_target_per_period: draft.type === "RECURRING" ? draft.targetPerPeriod : null,
        p_student_ids: draft.studentIds,
      });
      if (rpcError) return { ok: false, error: rpcError.message };
      await load();
      return { ok: true, retained: (data as { retained?: string[] })?.retained ?? [] };
    },
    [classId, load],
  );

  const archiveTask = useCallback(
    (taskId: string) => run("learn_admin_archive_task", { p_task_id: taskId, p_archived: true }),
    [run],
  );

  const restoreTask = useCallback(
    (taskId: string) => run("learn_admin_archive_task", { p_task_id: taskId, p_archived: false }),
    [run],
  );

  const checkTask = useCallback(
    (taskId: string, studentId: string, status: TeacherStatus | null, percent?: number, note?: string) =>
      run("learn_admin_check_task", {
        p_task_id: taskId,
        p_student_id: studentId,
        p_status: status,
        p_percent: percent ?? null,
        p_note: note ?? null,
      }),
    [run],
  );

  const checkTaskBulk = useCallback(
    (taskId: string, status: TeacherStatus | null) =>
      run("learn_admin_check_task_bulk", { p_task_id: taskId, p_status: status }),
    [run],
  );

  return {
    detail, archived, loading, error, reload: load,
    rename, setNextClassDate,
    searchStudents, addMembers, removeMember,
    saveTask, archiveTask, restoreTask, checkTask, checkTaskBulk,
  };
}

export type AdminClassDetailApi = ReturnType<typeof useAdminClassDetail>;
