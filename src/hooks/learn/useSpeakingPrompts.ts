import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SpeakingPrompt } from "@/lib/speaking/types";

/**
 * 學生的選題清單。
 *
 * 只回傳啟用中的題目，而且不含 created_by / sort_order 這些管理端欄位——
 * 那個篩選在 speaking_available_prompts() 裡做，不在這裡。
 *
 * 沒被開放的學生呼叫會拿到 42501。那不是錯誤狀態，是「這一頁不該出現」，
 * 由 StudentFeatureGate 處理；這裡只要不把它顯示成紅色的失敗訊息就好。
 */
export function useSpeakingPrompts() {
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("speaking_available_prompts", {
      p_part: null,
    });
    if (rpcError) {
      setError(rpcError.message);
      setPrompts([]);
    } else {
      setPrompts((data as unknown as SpeakingPrompt[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { prompts, loading, error, refetch: load };
}
