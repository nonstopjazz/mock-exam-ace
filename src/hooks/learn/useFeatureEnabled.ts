import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 這個使用者看不看得到某個功能。
 *
 * 唯一的判斷來源是 learn_feature_enabled()：管理員恆為 true，學生則要有
 * 個別授權、或屬於一個被授權的啟用中班級。
 *
 * 🛑 這個 hook 只負責【畫面要不要出現】。它不是把關——真正的把關在每一支
 *    資料 RPC 裡（speaking_available_prompts、speaking_start_practice 都會
 *    自己再檢查一次）。藏起來的頁面仍然打得到 RPC。
 *
 * 讀取中回 null，不是 false：那兩者在畫面上要長得不一樣，
 * 否則有權限的人會先看到一瞬間的「未開放」。
 */
export function useFeatureEnabled(feature: string) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("learn_feature_enabled", {
      p_feature: feature,
    });
    if (rpcError) {
      setError(rpcError.message);
      setEnabled(false);
      return;
    }
    setError(null);
    setEnabled(data === true);
  }, [feature]);

  useEffect(() => {
    void load();
  }, [load]);

  return { enabled, loading: enabled === null, error, refetch: load };
}
