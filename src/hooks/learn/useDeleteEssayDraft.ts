import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 刪掉一篇還沒送出的作文。
 *
 * 走 /api/writing-draft-edit 而不是直接對資料表 delete()，因為圖片作文的
 * 那一列是 Storage 檔案的唯一索引 —— 必須先刪檔案再刪列，順序反了就會留下
 * 沒有人找得到的孤兒檔案。RLS 也因此【沒有】開放圖片草稿的 DELETE。
 *
 * 只刪得掉 DRAFT。已送出的作文由伺服器擋下（409），不是靠這裡藏按鈕。
 */
export function useDeleteEssayDraft() {
  const [deleting, setDeleting] = useState(false);

  const remove = useCallback(
    async (essayId: string): Promise<{ ok: boolean; error?: string }> => {
      setDeleting(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return { ok: false, error: "登入狀態已過期，請重新登入" };

        const res = await fetch("/api/writing-draft-edit", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ essayId, action: "delete" }),
        });

        const payload = (await res.json()) as { deleted?: boolean; error?: string };
        if (!res.ok) return { ok: false, error: payload.error ?? "刪除失敗" };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "刪除失敗" };
      } finally {
        setDeleting(false);
      }
    },
    [],
  );

  return { deleting, remove };
}
