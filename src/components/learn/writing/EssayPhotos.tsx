import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { ARCHIVE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/config/writingImages";

/**
 * 已送出的拍照作文：原始照片
 *
 * 照片有保存期限（送出後 60 天）。過期之後這個區塊【整個不出現】——
 * 不放「照片已過期」之類的說明：沒有入口就是沒有入口，作文與批改本來就
 * 完全不依賴圖片。多一段解釋只會讓學生以為自己弄丟了什麼。
 *
 * 一律用 signed URL；bucket 是私有的，沒有公開網址可用。
 */
export function EssayPhotos({ essayId }: { essayId: string }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data } = await supabase
        .from("writing_images")
        .select("page_number, archive_path, archive_deleted_at")
        .eq("essay_id", essayId)
        .order("page_number");

      const paths = (data ?? [])
        .filter((row) => row.archive_path && !row.archive_deleted_at)
        .map((row) => row.archive_path as string);

      if (paths.length === 0 || cancelled) return;

      const { data: signed } = await supabase.storage
        .from(ARCHIVE_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      if (!cancelled) {
        setUrls((signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [essayId]);

  if (urls.length === 0) return null;

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3">原始照片</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {urls.map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
          >
            <img src={url} alt={`第 ${i + 1} 張`} className="w-full" loading="lazy" />
          </a>
        ))}
      </div>
    </Card>
  );
}
