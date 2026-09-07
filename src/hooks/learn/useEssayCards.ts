import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EssayCard } from "@/types/writing";

/**
 * 「我的作文」卡片列表。
 *
 * 為什麼不沿用 useEssayList()：那支查的是 writing_submissions，拿得到標題與字數，
 * 但拿不到批改狀態 —— writing_analyses 的 RLS 只開放 admin 讀，學生看得到的
 * 批改結果一律要經過策展函式。卡片要在列表上就顯示「等待批改 / 批改中 /
 * 已完成 + 等第」，所以改走 writing_student_essay_cards() 一次取完，
 * 而不是對每一篇各打一次 writing_student_analysis()。
 *
 * 權限由 RPC 內的 auth.uid() 決定，這裡沒有、也不需要任何過濾條件。
 */
export function useEssayCards() {
  const [cards, setCards] = useState<EssayCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setCards([]);
      setLoading(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("writing_student_essay_cards");

    if (rpcError) {
      console.error("[useEssayCards] 讀取失敗:", rpcError);
      setError("讀取作文列表失敗，請稍後再試");
      setCards([]);
    } else {
      setCards((data ?? []) as unknown as EssayCard[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { cards, loading, error, refetch: load };
}
