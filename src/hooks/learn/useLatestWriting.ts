import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { OverallEvaluation, Highlight } from "@/lib/writing/analysisContract";

/**
 * 學生最近一篇【已送出】作文的批改狀態。給 Dashboard 的摘要卡用。
 *
 * 全部是真實資料，沒有任何 mock：
 *   • writing_submissions —— RLS 已經把範圍限縮在自己的作文
 *   • writing_student_analysis() —— 批改狀態與綜合層
 *   • writing_teacher_feedback_for() —— 只用來判斷「有沒有」，不取內容
 *
 * 卡片是摘要，不是報告：這裡刻意只取第一屏需要的欄位，
 * 三軸明細留在 /learn/student/writing/:essayId。
 */
export type LatestWritingStatus = "NONE" | "WAITING" | "GRADING" | "COMPLETED";

export interface LatestWriting {
  essayId: string;
  title: string;
  topic: string | null;
  essayDate: string;
  status: LatestWritingStatus;
  /** COMPLETED 時才有 */
  overall: OverallEvaluation | null;
  firstStrength: string | null;
  firstNeedsWork: string | null;
  hasTeacherFeedback: boolean;
}

export function useLatestWriting() {
  const [latest, setLatest] = useState<LatestWriting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setLatest(null);
      setLoading(false);
      return;
    }

    // 最近一篇【已送出】的。草稿不算——還沒送出就沒有批改可言。
    const { data: rows, error: queryError } = await supabase
      .from("writing_submissions")
      .select("id, title, essay_topic, essay_date, status")
      .eq("status", "SUBMITTED")
      .order("essay_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (queryError) {
      setError("讀取作文狀態失敗");
      setLatest(null);
      setLoading(false);
      return;
    }
    if (!rows || rows.length === 0) {
      setLatest(null);
      setLoading(false);
      return;
    }

    const essay = rows[0] as {
      id: string; title: string; essay_topic: string | null; essay_date: string;
    };

    const [{ data: analysis }, { data: feedback }] = await Promise.all([
      supabase.rpc("writing_student_analysis", { p_essay_id: essay.id }),
      supabase.rpc("writing_teacher_feedback_for", { p_essay_id: essay.id }),
    ]);

    const a = analysis as unknown as {
      status?: string;
      report_ready?: boolean;
      overall_evaluation?: OverallEvaluation | null;
      strengths?: Highlight[] | null;
      needs_work?: Highlight[] | null;
    } | null;

    // 老師還沒按批改 → RPC 回 NULL。那是「等待批改」，不是錯誤。
    let status: LatestWritingStatus = "WAITING";
    if (a) status = a.report_ready ? "COMPLETED" : "GRADING";

    setLatest({
      essayId: essay.id,
      title: essay.title,
      topic: essay.essay_topic,
      essayDate: essay.essay_date,
      status,
      overall: a?.report_ready ? (a.overall_evaluation ?? null) : null,
      firstStrength: a?.report_ready ? (a.strengths?.[0]?.text ?? null) : null,
      firstNeedsWork: a?.report_ready ? (a.needs_work?.[0]?.text ?? null) : null,
      hasTeacherFeedback: Boolean(feedback),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { latest, loading, error, refetch: load };
}
