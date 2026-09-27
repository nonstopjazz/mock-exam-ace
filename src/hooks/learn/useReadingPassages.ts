import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ReadingPassageListItem } from "@/lib/reading/studentTypes";
import { progressByPassage, type SessionRow } from "@/lib/reading/nextPassage";

/**
 * 學生看得到的文章清單。
 *
 * 🛑 直接查 reading_passages，不另外做 RPC——那張表的 RLS 已經寫死
 *    「status = 'PUBLISHED' 或 is_admin()」，多包一層 SECURITY DEFINER
 *    反而是把一道已經生效的鎖換成需要自己維護的檢查。
 *
 * 🛑 【不選 passage_text】。清單不需要全文，而一次抓 296 篇的內文
 *    是好幾 MB。少選一個欄位比之後做分頁有用得多。
 *
 * 🛑 預設只留 PUBLISHED。RLS 對學生已經只回 PUBLISHED，但對 admin 回全部——
 *    而 admin 同時也是學生。DRAFT 的文章只有 1–5 題，放進「開始練習」
 *    就會讓那一篇拿不出六題。學生端要看見學生的世界。
 *
 *    管理端的瀏覽頁要看得到草稿，所以用 includeUnpublished 明講——
 *    預設值站在學生那邊，想看全部的人要自己說。
 */

export interface PassageWithProgress extends ReadingPassageListItem {
  /** 沒練過是 null */
  sessionStatus: "IN_PROGRESS" | "SUBMITTED" | null;
  /** 只有 IN_PROGRESS 時有意義：用來挑「最後做到一半的那一篇」 */
  startedAt: string | null;
  status: string;
}

export interface ReadingPassagesOptions {
  /** true 才會回 DRAFT／BLOCKED。只有管理端該傳 */
  includeUnpublished?: boolean;
}

export function useReadingPassages({ includeUnpublished = false }: ReadingPassagesOptions = {}) {
  const [items, setItems] = useState<PassageWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = supabase
      .from("reading_passages")
      .select("passage_id, title, cefr_level, content_family, subdomain, status")
      .order("passage_id");
    if (!includeUnpublished) query.eq("status", "PUBLISHED");

    const { data: passages, error: passageError } = await query;

    if (passageError) {
      setError(passageError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    // 自己的練習紀錄。RLS 只回自己的，不必也不該帶 student_id 參數。
    const { data: sessions } = await supabase
      .from("reading_sessions")
      .select("id, passage_id, status, started_at")
      .order("started_at", { ascending: false });

    // 🛑 還要知道「這個 session 有沒有真的答過題」。打開文章的當下就會建
    //    session，所以光看 status 會把「點進去看一眼」當成做到一半。
    const { data: attempts } = await supabase
      .from("reading_attempts")
      .select("session_id");

    const answered = new Set(
      ((attempts ?? []) as { session_id: string }[]).map((a) => a.session_id),
    );
    const byPassage = progressByPassage((sessions ?? []) as SessionRow[], answered);

    setItems(
      ((passages ?? []) as (ReadingPassageListItem & { status: string })[]).map((p) => {
        const progress = byPassage.get(p.passage_id);
        return {
          ...p,
          sessionStatus: progress?.status ?? null,
          startedAt: progress?.startedAt ?? null,
        };
      }),
    );
    setLoading(false);
  }, [includeUnpublished]);

  useEffect(() => { void load(); }, [load]);

  return { items, loading, error, reload: load };
}
