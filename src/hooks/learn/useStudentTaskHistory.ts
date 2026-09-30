import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StudentTaskHistoryPayload } from "@/lib/learn/taskHistory";

const EMPTY: StudentTaskHistoryPayload = { items: [], total: 0, truncated: false };

/** 一次帶回幾份。後端會夾到 1–200，這裡取一個畫面捲得動的量。 */
const LIMIT = 50;

/**
 * 學生自己已結束（封存）的任務。
 *
 * 🛑 learn_student_task_history() 不接受 student_id 參數——過濾條件永遠是 auth.uid()，
 *    跟 learn_student_tasks() 同一個原則。前端沒有辦法要求別人的歷史，
 *    因為 API 根本沒有那個參數。
 *
 * 🛑 這支只讀。歷史沒有任何可以按的東西：作業已經結束，再讓學生「回報完成」
 *    只會寫進一個老師永遠不會看的欄位。
 *
 * 🛑 刻意【不】跟 useStudentTasks 合併。「現在要做什麼」是每次進站都要的，
 *    「以前做過什麼」是點開才看的——合併會讓每個人的首頁都多背一份用不到的資料。
 */
export function useStudentTaskHistory({ enabled = true }: { enabled?: boolean } = {}) {
  const [data, setData] = useState<StudentTaskHistoryPayload>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: raw, error: rpcError } = await supabase.rpc("learn_student_task_history", {
      p_limit: LIMIT,
    });
    if (rpcError) {
      setError(rpcError.message);
      setData(EMPTY);
    } else {
      setData((raw as unknown as StudentTaskHistoryPayload) ?? EMPTY);
    }
    setLoading(false);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // 只在真的要看的時候才去拿（面板展開）。
    if (enabled && !loaded && !loading) void load();
  }, [enabled, loaded, loading, load]);

  const isEmpty = loaded && !error && data.items.length === 0;

  return { ...data, loading, loaded, error, isEmpty, reload: load };
}
