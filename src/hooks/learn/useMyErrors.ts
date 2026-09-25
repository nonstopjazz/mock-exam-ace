import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  EMPTY_OVERVIEW,
  type MyErrorFindings,
  type MyErrorOverview,
} from "@/lib/writing/myErrors";

/**
 * 我常犯的錯 —— 總覽。
 *
 * 權限由 RPC 內的 auth.uid() 決定，這裡沒有、也不需要任何過濾條件。
 * 那兩支 RPC 根本沒有 student_id 參數，所以前端也沒有「傳錯人」這種可能。
 *
 * 🛑 supabase.rpc() 不會 throw —— postgrest 是把錯誤放在 { error } 裡回來。
 *    所以一定要檢查 rpcError，不能只包 try/catch。
 */
export function useMyErrorOverview() {
  const [overview, setOverview] = useState<MyErrorOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setOverview(EMPTY_OVERVIEW);
      setLoading(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("writing_my_error_overview", {
      p_limit: 20,
    });

    if (rpcError) {
      console.error("[useMyErrorOverview] 讀取失敗:", rpcError);
      setError("讀取錯誤統計失敗，請稍後再試");
      setOverview(EMPTY_OVERVIEW);
    } else {
      setOverview((data ?? EMPTY_OVERVIEW) as unknown as MyErrorOverview);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, loading, error, refetch: load };
}

/**
 * 某一個錯誤的完整歷史。展開時才載入 —— 一次全撈會把 20 個 code 的
 * 所有 findings 都拉下來，而學生一次只會看一項。
 */
export function useMyErrorFindings() {
  const [byCode, setByCode] = useState<Record<string, MyErrorFindings>>({});
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const load = useCallback(
    async (code: string) => {
      // 已經載過就不重載。學生會反覆開合同一項。
      if (byCode[code]) return;

      setLoadingCode(code);
      setErrorCode(null);

      const { data, error: rpcError } = await supabase.rpc("writing_my_error_findings", {
        p_error_code: code,
        p_limit: 50,
      });

      if (rpcError) {
        console.error("[useMyErrorFindings] 讀取失敗:", rpcError);
        setErrorCode(code);
      } else {
        setByCode((prev) => ({ ...prev, [code]: data as unknown as MyErrorFindings }));
      }
      setLoadingCode(null);
    },
    [byCode],
  );

  return { byCode, loadingCode, errorCode, load };
}
