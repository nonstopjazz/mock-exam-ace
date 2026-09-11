import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { analysisState, type WritingQueueRow } from "@/lib/writing/gradingQueue";

/**
 * 檢閱動線：這一篇處理完之後，下一篇是哪一篇。
 *
 * 只挑「AI 已完成、老師還沒標記處理完」的作文——那才是真正等著人看的東西。
 * 還在分析中的不列入：老師點過去也只會看到一個空報告。
 *
 * 順序與收件匣一致（送出時間新的在前，writing_admin_queue 已經排好），
 * 所以「下一篇」就是清單上的下一個，不會跳來跳去。
 */
export function useReviewQueueNav(currentEssayId: string | undefined) {
  const [rows, setRows] = useState<WritingQueueRow[]>([]);
  const [pending, setPending] = useState<WritingQueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("writing_admin_queue");
    if (error) {
      setRows([]);
      setPending([]);
      setLoading(false);
      return;
    }
    const all = (data as unknown as WritingQueueRow[]) ?? [];
    setRows(all);
    setPending(all.filter((r) => analysisState(r) === "DONE" && !r.teacher_reviewed));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 目前這一篇如果還在清單裡，下一篇就是它後面那個；
  // 已經被標記處理完（所以不在清單裡）的話，下一篇就是清單的第一個。
  const index = pending.findIndex((r) => r.essay_id === currentEssayId);
  const next = index >= 0 ? pending[index + 1] : pending[0];

  const current = rows.find((r) => r.essay_id === currentEssayId);

  return {
    loading,
    /** 目前這一篇有沒有被標記處理完 */
    currentReviewed: Boolean(current?.teacher_reviewed),
    /** 還有幾篇 AI 完成但沒人看過的（含目前這一篇） */
    remaining: pending.length,
    nextEssayId: next?.essay_id ?? null,
    nextLabel: next ? `${next.student_name ?? "未命名學生"}·${next.title}` : null,
    refetch: load,
  };
}
