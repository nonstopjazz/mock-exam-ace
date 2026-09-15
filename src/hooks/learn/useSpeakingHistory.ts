import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BUCKET, SIGNED_URL_TTL_SECONDS } from "@/config/speaking";
import type { SpeakingPractice } from "@/lib/speaking/types";

/**
 * 我練過的，以及每一則的批改結果。
 *
 * 走 speaking_my_practices() 而不是直接查表：批改結果在 speaking_analyses，
 * 那張表對所有角色零 grant。理由是欄位——學生該看到分數與回饋，不該看到
 * error_detail、telemetry、租約。RLS 是列層級的，遮不掉欄位，所以入口是
 * 一支明確列出可給欄位的函式。
 *
 * 播放網址是現取的 signed URL。bucket 是私有的，沒有固定網址可以存下來——
 * 這是刻意的，錄音是學生的聲音。
 */
export function useSpeakingHistory(limit = 30) {
  const [items, setItems] = useState<SpeakingPractice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("speaking_my_practices", {
      p_limit: limit,
    });
    if (rpcError) {
      setError(rpcError.message);
      setItems([]);
    } else {
      setItems((data as unknown as SpeakingPractice[]) ?? []);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 取得播放網址。檔案已過保存期就回 null——
   * 這時畫面要說「錄音檔已超過保存期限」，不是顯示一個播不出來的播放器。
   */
  const playbackUrl = useCallback(async (item: SpeakingPractice): Promise<string | null> => {
    if (!item.storage_path || item.file_deleted_at) return null;
    const { data, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(item.storage_path, SIGNED_URL_TTL_SECONDS);
    if (urlError) return null;
    return data?.signedUrl ?? null;
  }, []);

  return { items, loading, error, refetch: load, playbackUrl };
}
