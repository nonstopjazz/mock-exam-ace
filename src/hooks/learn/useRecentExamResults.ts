import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

/**
 * 學生自己最近幾次的模擬考成績。
 *
 * 🛑 只回傳【已交卷】的 attempt。做到一半的不是成績。
 * 🛑 這裡刻意【不】把各題型分數換算成聽/說/讀/寫的能力值——
 *    exam section ≠ 六大能力，那樣的換算是憑空發明的資料。
 *    只呈現 exam_attempts 真的存下來的東西：考卷名稱、日期、總分。
 */
export interface RecentExamResult {
  id: string;
  examTitle: string;
  submittedAt: string;
  totalScore: number | null;
}

const LIMIT = 5;

export function useRecentExamResults() {
  const { user } = useAuth();
  const [results, setResults] = useState<RecentExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setResults([]);
      setLoading(false);
      return;
    }
    setError(null);

    /**
     * ⚠️ /exam 是保留領域，這裡【只讀不寫】，也不改它的 schema。
     * exam_attempts → exams 的外鍵在這個 repo 裡無法確認，PostgREST 的 embed
     * 需要外鍵才成立。所以先試帶考卷名稱的查詢，失敗就退回不帶 embed 的查詢，
     * 再另外抓標題——寧可少一個名稱，也不要讓「有成績」被誤顯示成「沒有紀錄」。
     */
    const base = () =>
      supabase
        .from("exam_attempts")
        .select("id, exam_id, submitted_at, total_score")
        .eq("user_id", user.id)
        .eq("status", "submitted")
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(LIMIT);

    type Row = {
      id: string;
      exam_id: string | null;
      submitted_at: string;
      total_score: number | string | null;
      exam?: { title: string } | { title: string }[] | null;
    };

    let rows: Row[] | null = null;

    const withEmbed = await supabase
      .from("exam_attempts")
      .select("id, exam_id, submitted_at, total_score, exam:exams ( title )")
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(LIMIT);

    let titles: Record<string, string> = {};

    if (!withEmbed.error) {
      rows = (withEmbed.data ?? []) as unknown as Row[];
    } else {
      const plain = await base();
      if (plain.error) {
        setError(plain.error.message);
        setResults([]);
        setLoading(false);
        return;
      }
      rows = (plain.data ?? []) as unknown as Row[];
      const ids = [...new Set(rows.map((r) => r.exam_id).filter((v): v is string => !!v))];
      if (ids.length > 0) {
        const { data: examRows } = await supabase.from("exams").select("id, title").in("id", ids);
        titles = Object.fromEntries(
          (examRows ?? []).map((e) => [(e as { id: string }).id, (e as { title: string }).title]),
        );
      }
    }

    setResults(
      rows.map((row) => {
        const embedded = Array.isArray(row.exam) ? row.exam[0] : row.exam;
        const score = row.total_score === null ? null : Number(row.total_score);
        return {
          id: row.id,
          examTitle:
            embedded?.title ?? (row.exam_id ? titles[row.exam_id] : undefined) ?? "模擬考",
          submittedAt: row.submitted_at,
          totalScore: Number.isFinite(score as number) ? (score as number) : null,
        };
      }),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { results, loading, error, reload: load };
}
