import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  CompetencyAnalysis,
  ErrorAnalysis,
  HighScoreAnalysis,
  Highlight,
  NextStep,
  OverallEvaluation,
} from "@/lib/writing/analysisContract";

/**
 * 學生端的作文分析報告。
 *
 * 資料一律走 writing_student_analysis() RPC，不直接查 writing_analyses——
 * 那張表對 authenticated 沒有任何權限，RPC 是唯一的讀取路徑，而且它會：
 *   • 確認這篇作文屬於呼叫者（不是自己的就回 NULL）
 *   • 濾掉 provider / model / error_detail / validation_issues 等內部欄位
 *   • 綜合層未完成時，那四欄一律回 NULL（寧可顯示「批改中」也不給半套摘要）
 */
export interface WritingReport {
  id: string;
  essay_id: string;
  status: string;
  synthesis_status: string | null;
  /** 四軸有效【且】綜合層完成 */
  report_ready: boolean;
  analysis_version: number;
  taxonomy_version: string;
  requested_at: string | null;
  completed_at: string | null;

  /** 四軸通過驗證就有值，即使綜合層還沒好 */
  competency_analysis: CompetencyAnalysis | null;
  error_analysis: ErrorAnalysis | null;
  high_score_feature_analysis: HighScoreAnalysis | null;

  /** 只有 report_ready 時才有值 */
  overall_evaluation: OverallEvaluation | null;
  strengths: Highlight[] | null;
  needs_work: Highlight[] | null;
  next_steps: NextStep[] | null;
}

interface State {
  report: WritingReport | null;
  loading: boolean;
  error: string | null;
  /** 分析尚未被觸發過（老師還沒按批改）。與「載入失敗」是兩回事。 */
  notRequested: boolean;
}

export function useWritingReport(essayId: string | undefined) {
  const [state, setState] = useState<State>({
    report: null,
    loading: true,
    error: null,
    notRequested: false,
  });

  const load = useCallback(async () => {
    if (!essayId) {
      setState({ report: null, loading: false, error: null, notRequested: true });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));

    const { data, error } = await supabase.rpc("writing_student_analysis", {
      p_essay_id: essayId,
    });

    if (error) {
      setState({ report: null, loading: false, error: error.message, notRequested: false });
      return;
    }
    // RPC 對「不是你的作文」與「還沒分析過」都回 NULL。前者已經由 RPC 擋住，
    // 這裡剩下的只會是後者——顯示「還沒開始批改」，不是錯誤。
    if (!data) {
      setState({ report: null, loading: false, error: null, notRequested: true });
      return;
    }
    setState({
      report: data as unknown as WritingReport,
      loading: false,
      error: null,
      notRequested: false,
    });
  }, [essayId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refetch: load };
}
