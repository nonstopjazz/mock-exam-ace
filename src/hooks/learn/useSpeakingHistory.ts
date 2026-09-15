import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BUCKET, SIGNED_URL_TTL_SECONDS } from "@/config/speaking";
import type { SpeakingRecording } from "@/lib/speaking/types";

/**
 * 我練過的。
 *
 * 直接查表，不經 RPC：speaking_recordings 對 authenticated 只有一條
 * SELECT 政策（auth.uid() = student_id），所以這一句查詢天生只看得到自己的。
 *
 * 播放網址是現取的 signed URL。bucket 是私有的，沒有固定網址可以存下來——
 * 這是刻意的，錄音是學生的聲音。
 */
export function useSpeakingHistory(limit = 20) {
  const [items, setItems] = useState<SpeakingRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: queryError } = await supabase
      .from("speaking_recordings")
      .select(
        "id, prompt_id, prompt_part, prompt_text, storage_path, mime_type, file_bytes, " +
          "duration_seconds, uploaded_at, file_deleted_at, status, error_detail, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (queryError) {
      setError(queryError.message);
      setItems([]);
    } else {
      setItems((data as unknown as SpeakingRecording[]) ?? []);
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
  const playbackUrl = useCallback(async (item: SpeakingRecording): Promise<string | null> => {
    if (!item.storage_path || item.file_deleted_at) return null;
    const { data, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(item.storage_path, SIGNED_URL_TTL_SECONDS);
    if (urlError) return null;
    return data?.signedUrl ?? null;
  }, []);

  return { items, loading, error, refetch: load, playbackUrl };
}
