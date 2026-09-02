import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type {
  EssayListItem,
  EssaySubmission,
  EssayText,
  SubmitTextEssayInput,
} from "@/types/writing";

/**
 * 作文資料存取（Phase 1）
 *
 * 權限一律由 RLS 執行，不由這裡的查詢條件負責 —— 就算某個查詢忘了加
 * student_id 條件，資料庫也只會回傳呼叫者自己的資料。
 */

/** 一篇作文可能有多筆 essay_text（append-only），最新的一筆才是目前的文字。 */
function latestText<T extends { created_at: string }>(rows: T[] | null | undefined): T | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export function useEssayList() {
  const { user } = useAuth();
  const [essays, setEssays] = useState<EssayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEssays = useCallback(async () => {
    if (!user) {
      setEssays([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("essay_submissions")
      .select("*, essay_text(char_count, created_at)")
      .order("essay_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (queryError) {
      console.error("[useEssayList] 讀取失敗:", queryError);
      setError("讀取作文列表失敗，請稍後再試");
      setEssays([]);
    } else {
      setEssays(
        (data ?? []).map((row) => {
          const { essay_text, ...essay } = row as EssaySubmission & {
            essay_text: { char_count: number; created_at: string }[] | null;
          };
          return { ...essay, charCount: latestText(essay_text)?.char_count ?? null };
        }),
      );
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchEssays();
  }, [fetchEssays]);

  return { essays, loading, error, refetch: fetchEssays };
}

export function useEssay(essayId: string | undefined) {
  const { user } = useAuth();
  const [essay, setEssay] = useState<EssaySubmission | null>(null);
  const [text, setText] = useState<EssayText | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchEssay = useCallback(async () => {
    if (!user || !essayId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotFound(false);

    const { data, error: queryError } = await supabase
      .from("essay_submissions")
      .select("*, essay_text(*)")
      .eq("id", essayId)
      .maybeSingle();

    if (queryError) {
      console.error("[useEssay] 讀取失敗:", queryError);
      setError("讀取作文失敗，請稍後再試");
    } else if (!data) {
      // RLS 下「別人的作文」與「不存在的作文」回傳結果相同，這是刻意的。
      setNotFound(true);
    } else {
      const { essay_text, ...submission } = data as EssaySubmission & {
        essay_text: EssayText[] | null;
      };
      setEssay(submission);
      setText(latestText(essay_text));
    }

    setLoading(false);
  }, [user, essayId]);

  useEffect(() => {
    void fetchEssay();
  }, [fetchEssay]);

  return { essay, text, loading, error, notFound, refetch: fetchEssay };
}

/**
 * 送出文字作文。
 *
 * 走 submit_text_essay() RPC，讓「建立草稿 → 寫入正規文字 → 標記送出」
 * 在單一交易內完成。拆成三次 client 呼叫的話，中途失敗會留下半完成的作文。
 */
export async function submitTextEssay(input: SubmitTextEssayInput): Promise<string> {
  const { data, error } = await supabase.rpc("submit_text_essay", {
    p_title: input.title,
    p_content: input.content,
    p_essay_topic: input.essayTopic ?? null,
    p_essay_date: input.essayDate ?? null,
    p_student_notes: input.studentNotes ?? null,
  });

  if (error) {
    console.error("[submitTextEssay] 送出失敗:", error);
    throw new Error(error.message || "送出失敗，請稍後再試");
  }

  return data as string;
}
