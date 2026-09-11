import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 待老師處理的作文篇數，給管理中心的徽章用。
 *
 * 「待處理」的定義只有一個地方說了算：writing_queue_summary()（已送出 +
 * 有正規文字 + 沒有檢閱紀錄）。這裡不自己算，免得徽章的數字與收件匣、
 * 與之後的每日提醒對不起來。
 *
 * 非管理員呼叫會被資料庫擋下來，這時安靜地回傳 null——管理中心本來就只有
 * 管理員進得來，不需要為此顯示錯誤。
 */
export function useWritingPendingCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("writing_queue_summary");
      if (cancelled || error) return;
      const total = (data as { pending_total?: number } | null)?.pending_total;
      if (typeof total === "number") setCount(total);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
