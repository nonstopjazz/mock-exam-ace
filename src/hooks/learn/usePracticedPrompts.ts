import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 我練過哪些題（prompt_id 的集合）。
 *
 * 在 1,945 題的題庫裡，「哪些練過了」不是裝飾——它是唯一找得到下一題的方法。
 * 沒有它，學生每次進來都會從最上面那幾題重新開始。
 *
 * 只選 prompt_id 一個欄位：這是一份幾百筆的清單，不需要把整列拉回來。
 * RLS（auth.uid() = student_id）保證只看得到自己的，這裡不必再加條件——
 * 加了反而會讓人以為那一條才是把關。
 */
export function usePracticedPrompts() {
  const [practiced, setPracticed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("speaking_recordings")
      .select("prompt_id")
      .not("prompt_id", "is", null);

    if (!error) {
      setPracticed(
        new Set((data ?? []).map((row) => (row as { prompt_id: string }).prompt_id)),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { practiced, loading, refetch: load };
}
