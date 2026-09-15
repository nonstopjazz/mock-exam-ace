import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AdminSpeakingPrompt } from "@/lib/speaking/types";

export interface PromptDraft {
  id: string | null;
  part: 1 | 2 | 3;
  topic: string;
  question: string;
  title: string;
  cue: string;
  bullets: string[];
  is_active: boolean;
  sort_order: number;
}

/**
 * 管理端：題庫。
 *
 * 授權在資料庫層（learn_require_admin）。欄位的形狀也由資料庫的 CHECK 把關——
 * 前端只擋「明顯還沒填完」這一層，不重複實作同一組規則。兩邊各驗一次的結果
 * 通常是其中一邊悄悄放寬了。
 */
export function useAdminSpeakingPrompts() {
  const [prompts, setPrompts] = useState<AdminSpeakingPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("speaking_admin_prompts");
    if (rpcError) {
      setError(rpcError.message);
      setPrompts([]);
    } else {
      setPrompts((data as unknown as AdminSpeakingPrompt[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (draft: PromptDraft) => {
      const { error: rpcError } = await supabase.rpc("speaking_admin_upsert_prompt", {
        p_id: draft.id,
        p_part: draft.part,
        p_topic: draft.topic.trim() || null,
        p_question: draft.question.trim() || null,
        p_title: draft.title.trim() || null,
        p_cue: draft.cue.trim() || null,
        p_bullets: draft.bullets.map((b) => b.trim()).filter(Boolean),
        p_is_active: draft.is_active,
        p_sort_order: draft.sort_order,
      });
      if (rpcError) return { ok: false as const, error: rpcError.message };
      await load();
      return { ok: true as const };
    },
    [load],
  );

  /**
   * 停用／啟用。刻意沒有「刪除」——既有的練習紀錄還指著這一題，
   * 刪掉它學生就看不出自己當初回答的是什麼。
   */
  const setActive = useCallback(
    async (prompt: AdminSpeakingPrompt, active: boolean) => {
      const { error: rpcError } = await supabase.rpc("speaking_admin_upsert_prompt", {
        p_id: prompt.id,
        p_part: prompt.part,
        p_topic: prompt.topic,
        p_question: prompt.question,
        p_title: prompt.title,
        p_cue: prompt.cue,
        p_bullets: prompt.bullets,
        p_is_active: active,
        p_sort_order: prompt.sort_order,
      });
      if (rpcError) return { ok: false as const, error: rpcError.message };
      await load();
      return { ok: true as const };
    },
    [load],
  );

  return { prompts, loading, error, refetch: load, save, setActive };
}
