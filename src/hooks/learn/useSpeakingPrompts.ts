import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SpeakingPrompt } from "@/lib/speaking/types";

/**
 * 某一個 Part 的選題清單。
 *
 * 🛑 一定要帶 part。題庫有 1,945 題——整份是 451 KB，單一個 Part 是 161 KB，
 *    而畫面本來就一次只看一個 Part。不帶 part 等於每次切分頁都重傳兩個
 *    學生根本沒在看的 Part。
 *
 * 換 part 會重新取一次。沒有快取是刻意的：題庫是老師在改的，學生換分頁時
 * 拿到最新的比省一次往返重要，而 161 KB 對一次點擊來說不算什麼。
 *
 * 沒被開放的學生呼叫會拿到 42501。那不是錯誤狀態，是「這一頁不該出現」，
 * 由 StudentFeatureGate 處理；這裡只要不把它顯示成紅色的失敗訊息就好。
 */
export function useSpeakingPrompts(part: 1 | 2 | 3) {
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("speaking_available_prompts", {
      p_part: part,
    });
    if (rpcError) {
      setError(rpcError.message);
      setPrompts([]);
    } else {
      setPrompts((data as unknown as SpeakingPrompt[]) ?? []);
    }
    setLoading(false);
  }, [part]);

  useEffect(() => {
    void load();
  }, [load]);

  return { prompts, loading, error, refetch: load };
}
