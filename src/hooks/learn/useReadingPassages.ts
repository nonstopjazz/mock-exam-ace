import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ReadingPassageListItem } from "@/lib/reading/studentTypes";

/**
 * 學生看得到的文章清單。
 *
 * 🛑 直接查 reading_passages，不另外做 RPC——那張表的 RLS 已經寫死
 *    「status = 'PUBLISHED' 或 is_admin()」，多包一層 SECURITY DEFINER
 *    反而是把一道已經生效的鎖換成需要自己維護的檢查。
 *
 * 🛑 【不選 passage_text】。清單不需要全文，而一次抓 296 篇的內文
 *    是好幾 MB。少選一個欄位比之後做分頁有用得多。
 */

export interface PassageWithProgress extends ReadingPassageListItem {
  /** 沒練過是 null */
  sessionStatus: "IN_PROGRESS" | "SUBMITTED" | null;
}

export function useReadingPassages() {
  const [items, setItems] = useState<PassageWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: passages, error: passageError } = await supabase
      .from("reading_passages")
      .select("passage_id, title, cefr_level, content_family, subdomain")
      .order("passage_id");

    if (passageError) {
      setError(passageError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    // 自己的練習紀錄。RLS 只回自己的，不必也不該帶 student_id 參數。
    const { data: sessions } = await supabase
      .from("reading_sessions")
      .select("passage_id, status, started_at")
      .order("started_at", { ascending: false });

    const byPassage = new Map<string, "IN_PROGRESS" | "SUBMITTED">();
    for (const row of (sessions ?? []) as {
      passage_id: string; status: "IN_PROGRESS" | "SUBMITTED" | "ABANDONED";
    }[]) {
      if (row.status === "ABANDONED") continue;
      // 已經交過就是交過，別被後來又開的 IN_PROGRESS 蓋掉
      const current = byPassage.get(row.passage_id);
      if (current === "SUBMITTED") continue;
      byPassage.set(row.passage_id, row.status);
    }

    setItems(
      ((passages ?? []) as ReadingPassageListItem[]).map((p) => ({
        ...p,
        sessionStatus: byPassage.get(p.passage_id) ?? null,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { items, loading, error, reload: load };
}
