import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 某一篇作文的老師講評（選填）。
 *
 * 讀寫都走 SECURITY DEFINER RPC——writing_teacher_feedback 這張表對所有角色
 * 都沒有 grant，函式是唯一入口。權限在資料庫層判斷，不是靠前端藏按鈕：
 *   • 讀：管理員可讀任何一篇，學生只能讀自己的；其餘一律 NULL
 *   • 寫：僅限管理員
 *
 * 沒有講評時 feedback 為 null——學生端據此把整個區塊隱藏，而不是顯示空白區塊。
 */
export interface TeacherFeedback {
  essay_id: string;
  body: string;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

export function useTeacherFeedback(essayId: string | undefined) {
  const [feedback, setFeedback] = useState<TeacherFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!essayId) {
      setFeedback(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("writing_teacher_feedback_for", {
      p_essay_id: essayId,
    });
    if (rpcError) {
      setError(rpcError.message);
      setFeedback(null);
    } else {
      setFeedback((data as unknown as TeacherFeedback | null) ?? null);
    }
    setLoading(false);
  }, [essayId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 僅限管理員。body 傳空字串代表清除講評（資料庫會刪掉那一列）。 */
  const save = useCallback(
    async (body: string): Promise<{ ok: boolean; error?: string }> => {
      if (!essayId) return { ok: false, error: "缺少作文 ID" };
      const { error: rpcError } = await supabase.rpc("writing_upsert_teacher_feedback", {
        p_essay_id: essayId,
        p_body: body,
      });
      if (rpcError) return { ok: false, error: rpcError.message };
      await load();
      return { ok: true };
    },
    [essayId, load],
  );

  return { feedback, loading, error, refetch: load, save };
}
