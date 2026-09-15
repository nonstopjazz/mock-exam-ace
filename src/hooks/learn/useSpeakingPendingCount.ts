import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 待批改的口說則數，給管理中心的徽章用。
 *
 * 「待批改」的定義只有一個地方說了算：speaking_grading_summary() 的
 * ungraded（有錄音檔、還沒有批改結果）。這裡不自己算，免得徽章的數字
 * 與收件匣對不起來。
 *
 * 非管理員呼叫會被資料庫擋下來，這時安靜地回傳 null——管理中心本來就只有
 * 管理員進得來，不需要為此顯示錯誤。
 */
export function useSpeakingPendingCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("speaking_grading_summary");
      if (cancelled || error) return;
      const total = (data as { ungraded?: number } | null)?.ungraded;
      if (typeof total === "number") setCount(total);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
