import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StudentTasksPayload } from "@/lib/learn/tasks";

const EMPTY: StudentTasksPayload = { today: "", homework: [], recurring: [] };

/**
 * 學生自己的任務。
 *
 * 🛑 learn_student_tasks() 不接受 student_id 參數——過濾條件永遠是 auth.uid()。
 *    前端沒有辦法要求別人的資料，因為 API 根本沒有那個參數。
 * 🛑 學生能寫的只有自述與自己的打卡。老師的檢查結果是唯讀的。
 */
export function useStudentTasks() {
  const [data, setData] = useState<StudentTasksPayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data: raw, error: rpcError } = await supabase.rpc("learn_student_tasks");
    if (rpcError) {
      setError(rpcError.message);
      setData(EMPTY);
    } else {
      setData((raw as unknown as StudentTasksPayload) ?? EMPTY);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 自述完成 / 取消。碰不到 teacher_status——那是資料庫層的保證。 */
  const reportHomework = useCallback(
    async (taskId: string, done: boolean): Promise<{ ok: boolean; error?: string }> => {
      // 樂觀更新：勾選要立刻有反應，失敗時再由 load() 校正回來
      setData((prev) => ({
        ...prev,
        homework: prev.homework.map((h) =>
          h.task_id === taskId ? { ...h, student_reported: done } : h,
        ),
      }));
      const { error: rpcError } = await supabase.rpc("learn_student_report_task", {
        p_task_id: taskId,
        p_done: done,
      });
      if (rpcError) {
        await load();
        return { ok: false, error: rpcError.message };
      }
      await load();
      return { ok: true };
    },
    [load],
  );

  /** 常態練習打卡。delta = +1 / -1，日期預設是後端算出來的「今天」。 */
  const logRecurring = useCallback(
    async (taskId: string, delta: 1 | -1): Promise<{ ok: boolean; error?: string }> => {
      const { error: rpcError } = await supabase.rpc("learn_student_log_recurring", {
        p_task_id: taskId,
        p_date: null,
        p_delta: delta,
      });
      if (rpcError) return { ok: false, error: rpcError.message };
      await load();
      return { ok: true };
    },
    [load],
  );

  const isEmpty = !loading && !error && data.homework.length === 0 && data.recurring.length === 0;

  return { ...data, loading, error, isEmpty, reload: load, reportHomework, logRecurring };
}

export type StudentTasks = ReturnType<typeof useStudentTasks>;
