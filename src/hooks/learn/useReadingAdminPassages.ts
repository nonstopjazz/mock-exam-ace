import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** reading_admin_passage_list 的一列 */
export interface AdminPassageRow {
  passage_id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  cefr_level: string | null;
  content_family: string | null;
  subdomain: string | null;
  question_count: number;
  /** 🛑 已經有學生作答過。下架前要看一眼這個數字 */
  attempt_count: number;
  ready: boolean;
  missing: string[];
}

export interface SetStatusResult {
  updated: number;
  failed: number;
  results: { passage_id: string; ok: boolean; reason: string | null }[];
}

/**
 * 後台的文章清單與上下架。
 *
 * 🛑 「能不能上架」【不在前端判斷】。ready 是後端算的（呼叫
 *    reading_publish_readiness，跟 trigger 同一份定義），前端只是把它畫出來。
 *    前端自己數「有沒有六題」會快一點，但那一刻起就有兩個定義。
 */
export function useReadingAdminPassages() {
  const [rows, setRows] = useState<AdminPassageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("reading_admin_passage_list");
    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as AdminPassageRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = useCallback(
    async (passageIds: string[], status: AdminPassageRow["status"]) => {
      setWorking(true);
      const { data, error: rpcError } = await supabase.rpc("reading_admin_set_status", {
        p_passage_ids: passageIds,
        p_status: status,
      });
      setWorking(false);
      if (rpcError) return { ok: false as const, error: rpcError.message };
      // 🛑 改完一定重讀。前端自己把那幾列改掉會比較快，但畫面就成了
      //    「我以為發生的事」而不是「資料庫裡的事」——而這兩者不一致
      //    正是上架最不能出錯的地方。
      await load();
      return { ok: true as const, result: data as unknown as SetStatusResult };
    },
    [load],
  );

  return { rows, loading, error, working, reload: load, setStatus };
}
