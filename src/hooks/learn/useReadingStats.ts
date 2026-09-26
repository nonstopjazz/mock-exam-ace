import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ConstructStat, SkillStat } from "@/lib/reading/statsShaping";

export interface ReadingRecentSession {
  session_id: string;
  passage_id: string;
  title: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  answered: number;
  correct: number;
  total_seconds: number | null;
}

export interface ReadingStats {
  overall: {
    sessions: number;
    passages: number;
    answered: number;
    correct: number;
    min_questions_for_skill: number;
  };
  by_construct: ConstructStat[];
  by_skill: SkillStat[];
  recent: ReadingRecentSession[];
}

/**
 * 自己的閱讀統計。
 *
 * 🛑 全部由 reading_my_stats() 算好。前端不自己從作答紀錄統計——
 *    micro-skill 需要 reading_question_skills，而那張表對學生完全沒有權限
 *    （而且不該有：它等於「每一題在考什麼」的提示表）。
 */
export function useReadingStats() {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("reading_my_stats");
    if (rpcError) {
      setError(rpcError.message);
      setStats(null);
    } else {
      setStats(data as unknown as ReadingStats);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { stats, loading, error, reload: load };
}
