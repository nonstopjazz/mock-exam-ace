import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SpeakingGradingRow, SpeakingGradingSummary } from "@/lib/speaking/types";

export type GradingFilter = "ungraded" | "queued" | "failed" | "completed" | "all";

/**
 * 老師端：口說批改收件匣。
 *
 * 授權在資料庫層（learn_require_admin），不是靠前端藏按鈕。
 *
 * 排入之後【一定要踢 worker】。佇列是資料庫裡的 QUEUED 列，推進它的是
 * /api/speaking-queue-worker 那條自我串接的鏈；只排入不踢，工作會安靜地
 * 躺在那裡等到有人按「繼續處理佇列」為止。
 */
export function useSpeakingGradingQueue(filter: GradingFilter) {
  const [rows, setRows] = useState<SpeakingGradingRow[]>([]);
  const [summary, setSummary] = useState<SpeakingGradingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [queueRes, summaryRes] = await Promise.all([
      supabase.rpc("speaking_admin_grading_queue", { p_state: filter, p_limit: 200 }),
      supabase.rpc("speaking_grading_summary"),
    ]);

    if (queueRes.error) {
      setError(queueRes.error.message);
      setRows([]);
    } else {
      setRows((queueRes.data as unknown as SpeakingGradingRow[]) ?? []);
    }
    if (!summaryRes.error) {
      setSummary(summaryRes.data as unknown as SpeakingGradingSummary);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 踢 worker。端點只驗管理員身分，本身不排入任何工作，所以按幾次都無害。 */
  const kickWorker = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { ok: false as const, error: "登入狀態已失效，請重新登入" };

    try {
      const res = await fetch("/api/speaking-queue-enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false as const, error: body.error ?? `啟動失敗（${res.status}）` };
      }
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "啟動失敗" };
    }
  }, []);

  /**
   * 排入一批，然後踢 worker。
   *
   * 回傳逐則的結果而不是一個總數：老師勾了 20 則、進去 17 則，
   * 他要知道是哪三則沒進去、為什麼。
   */
  const enqueue = useCallback(
    async (recordingIds: string[]) => {
      const { data, error: rpcError } = await supabase.rpc("speaking_enqueue_grading_batch", {
        p_recording_ids: recordingIds,
      });
      if (rpcError) return { ok: false as const, error: rpcError.message };

      const result = data as unknown as {
        queued: number;
        daily_cap_reached: boolean;
        items: { recording_id: string; outcome: string }[];
      };

      // 只有真的排進去東西才需要踢。一批全是 ALREADY_ACTIVE 時不必打擾 worker。
      if (result.queued > 0) await kickWorker();
      await load();
      return { ok: true as const, ...result };
    },
    [kickWorker, load],
  );

  return { rows, summary, loading, error, refetch: load, enqueue, kickWorker };
}
