import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  CostEstimate,
  EnqueueResult,
  QueueSummary,
  WritingQueueRow,
} from "@/lib/writing/gradingQueue";

/**
 * 作文收件匣的資料與批次動作。
 *
 * ⚠️ 這個 hook【不推進佇列】。它只負責：讀資料、送出「請排入這幾篇」、
 *    以及定時重新整理讓老師看到進度。
 *
 *    推進佇列的是伺服器端的 worker（api/writing-queue-worker.ts），
 *    它與這個分頁沒有任何關係。老師關掉瀏覽器，分析照跑。
 *    這是刻意的：瀏覽器端的 for-loop 一關頁面就斷，那正是這次要避免的做法。
 *
 * 自動重新整理只在「有事情在動」時才開——佇列空著的時候不該每十秒打一次資料庫。
 */

const POLL_MS = 10_000;

interface EnqueueOutcome {
  ok: boolean;
  result?: EnqueueResult;
  error?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("登入狀態已過期，請重新登入");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function useWritingQueue() {
  const [rows, setRows] = useState<WritingQueueRow[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 背景重新整理時不要把畫面打回 loading 骨架——老師正在勾選的東西會消失。
  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);

    const [queueRes, summaryRes] = await Promise.all([
      supabase.rpc("writing_admin_queue"),
      supabase.rpc("writing_queue_summary"),
    ]);

    if (queueRes.error) {
      setError(queueRes.error.message);
      setRows([]);
    } else {
      setRows((queueRes.data as unknown as WritingQueueRow[]) ?? []);
    }
    if (!summaryRes.error) {
      setSummary(summaryRes.data as unknown as QueueSummary);
    }
    if (!opts.silent) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 只在佇列真的在動的時候輪詢。
  const active = Boolean(summary && (summary.worker_busy || summary.work_waiting));
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void loadRef.current({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [active]);

  /** 排入多篇並踢第一腳。回傳逐篇結果，包含被跳過的原因。 */
  const enqueue = useCallback(
    async (essayIds: string[], force = false): Promise<EnqueueOutcome> => {
      setBusy(true);
      try {
        const res = await fetch("/api/writing-queue-enqueue", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ essayIds, force }),
        });
        const payload = (await res.json()) as EnqueueResult & { error?: string };
        if (!res.ok) return { ok: false, error: payload.error ?? "排入失敗" };
        await load({ silent: true });
        return { ok: true, result: payload };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "排入失敗" };
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  /**
   * 排入前的用量估算。
   *
   * 依據最近已完成分析的【實際 telemetry】，不是寫死的常數——所以 prompt 改版、
   * 作文變長、重試變多，這個數字都會自己跟上。
   */
  const estimate = useCallback(async (count: number): Promise<CostEstimate | null> => {
    const { data, error: rpcError } = await supabase.rpc("writing_analysis_cost_estimate", {
      p_count: count,
    });
    if (rpcError) return null;
    return data as unknown as CostEstimate;
  }, []);

  /**
   * 只踢一腳，不排入任何工作。
   * 鏈被平台中斷之後用這個重新點火；按幾次都沒有副作用。
   */
  const resume = useCallback(async (): Promise<EnqueueOutcome> => {
    setBusy(true);
    try {
      const res = await fetch("/api/writing-queue-enqueue", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ kickOnly: true }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) return { ok: false, error: payload.error ?? "無法繼續處理" };
      await load({ silent: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "無法繼續處理" };
    } finally {
      setBusy(false);
    }
  }, [load]);

  /** 標記／取消「已檢閱」。 */
  const setReviewed = useCallback(
    async (essayId: string, reviewed: boolean): Promise<{ ok: boolean; error?: string }> => {
      const { error: rpcError } = await supabase.rpc("writing_set_teacher_reviewed", {
        p_essay_id: essayId,
        p_reviewed: reviewed,
      });
      if (rpcError) return { ok: false, error: rpcError.message };
      await load({ silent: true });
      return { ok: true };
    },
    [load],
  );

  return {
    rows, summary, loading, error, busy,
    reload: load, enqueue, estimate, resume, setReviewed,
  };
}
