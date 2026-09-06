import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { WritingReport } from "./useWritingReport";

/**
 * 管理員讀單篇作文的最新分析。
 *
 * writing_admin_analysis() 回的是【歷次】分析的完整列（含診斷欄位），
 * 這裡只取最新一版並補上 report_ready，讓它能直接餵給 WritingReportView——
 * 老師看到的呈現與學生一致，才知道學生實際看到什麼。
 */
export function useAdminWritingAnalysis(essayId: string | undefined) {
  const [report, setReport] = useState<WritingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!essayId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("writing_admin_analysis", {
      p_essay_id: essayId,
    });
    if (rpcError) {
      setError(rpcError.message);
      setReport(null);
      setLoading(false);
      return;
    }
    const rows = (data as unknown as Record<string, unknown>[]) ?? [];
    if (rows.length === 0) {
      setReport(null);
      setLoading(false);
      return;
    }
    // RPC 已依 analysis_version DESC 排序。
    const latest = rows[0];
    setReport({
      ...(latest as unknown as WritingReport),
      report_ready: latest.status === "COMPLETED",
    });
    setLoading(false);
  }, [essayId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { report, loading, error, refetch: load };
}
