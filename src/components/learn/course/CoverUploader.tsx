import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { supabase } from "@/lib/supabase";
import {
  aspectWarning, COVER_MIME_TYPES, coverObjectName, formatBytes,
  isBucketObject, RECOMMENDED_HEIGHT, RECOMMENDED_WIDTH,
  resolutionWarning, validateCoverFile,
} from "@/lib/learn/course/coverFile";

/**
 * 課程封面的上傳。
 *
 * 原本這裡是一個要管理員自己打檔名的文字框——得開兩個分頁、手動對檔名，
 * 而且打錯一個字是安靜地沒有封面，不會報錯。
 *
 * 🛑 預覽用真的 16:9 框，而且跟卡片一樣 object-cover。
 *    卡片會【裁掉】超出的部分（不是變形），所以要讓人在上傳當下就看到
 *    哪裡會被切掉，而不是發布之後才發現講師的頭不見了。
 *
 * 🛑 這裡的限制要跟 create_course_cover_bucket.sql 一致。bucket 那層才是
 *    真的擋得住的；這裡擋只是為了讓訊息看得懂——不擋的話使用者會看到
 *    "new row violates row-level security policy"。
 *
 * 🛑 舊檔【不在這裡刪】。這個元件只回報新的路徑，刪除等課程真的存檔成功
 *    之後由外層做——不然存檔失敗時，舊封面已經沒了而新的沒存進去。
 */

const BUCKET = "course-covers";

interface CoverUploaderProps {
  /** 目前的 cover_path。可能是 bucket 檔名，也可能是外部網址 */
  value: string | null;
  onChange: (path: string | null) => void;
  /** 產生檔名用 */
  slug: string;
}

export function CoverUploader({ value, onChange, slug }: CoverUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // 換課程就把上一張的提醒清掉
  useEffect(() => { setWarnings([]); setError(null); }, [value]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const previewUrl = value
    ? (/^https?:\/\//i.test(value)
        ? value
        : supabase.storage.from(BUCKET)?.getPublicUrl?.(value)?.data?.publicUrl ?? null)
    : null;

  /** 讀出尺寸，給比例與解析度的提醒用。讀不到就算了，不擋上傳 */
  const measure = (file: File): Promise<{ width: number; height: number } | null> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        objectUrlRef.current = null;
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        objectUrlRef.current = null;
        resolve(null);
      };
      img.src = url;
    });

  const upload = useCallback(async (file: File) => {
    setError(null);
    setWarnings([]);

    const check = validateCoverFile(file);
    if (!check.ok) { setError(check.message); return; }

    const size = await measure(file);
    const notes = size
      ? [aspectWarning(size.width, size.height), resolutionWarning(size.width)]
        .filter((n): n is string => n !== null)
      : [];

    setUploading(true);
    const name = coverObjectName(slug, file.type);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(name, file, { cacheControl: "31536000", upsert: false });
    setUploading(false);

    if (uploadError) {
      // RLS 的原始訊息對管理員沒有意義，翻成看得懂的
      const raw = uploadError.message ?? "";
      setError(/row-level security|Unauthorized|403/i.test(raw)
        ? "沒有上傳權限。course-covers 這個 bucket 的政策還沒建立——請先執行 create_course_cover_bucket.sql。"
        : `上傳失敗：${raw}`);
      return;
    }

    setWarnings(notes);
    onChange(name);
  }, [slug, onChange]);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
        className={`overflow-hidden rounded-lg border-2 border-dashed transition-colors
          ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <AspectRatio ratio={16 / 9} className="bg-muted">
          {previewUrl ? (
            // 跟課程卡片同一套：object-cover，所以這個框就是學生會看到的取景
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImagePlus className="h-10 w-10 opacity-40" />
              <p className="text-sm">把圖片拖進來，或按下面的按鈕</p>
              <p className="text-xs">
                建議 {RECOMMENDED_WIDTH} × {RECOMMENDED_HEIGHT}（16:9）・最大 2 MB
              </p>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </AspectRatio>
      </div>

      {previewUrl && (
        <p className="text-xs text-muted-foreground">
          這個框就是學生看到的取景——超出 16:9 的部分會被裁掉，不會變形。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={COVER_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
        />
        <Button type="button" variant="outline" size="sm"
          onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Upload className="mr-2 h-4 w-4" />
          {value ? "換一張" : "選擇圖片"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm"
            onClick={() => { onChange(null); setWarnings([]); setError(null); }}
            disabled={uploading}>
            <Trash2 className="mr-2 h-4 w-4" />移除封面
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {warnings.map((w) => (
        <Alert key={w}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{w}</AlertDescription>
        </Alert>
      ))}

      {value && !isBucketObject(value) && (
        <p className="text-xs text-muted-foreground">
          目前用的是外部網址。換一張會改成上傳到 course-covers，外部那張不會被動到。
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        接受 JPG、PNG、WebP。{formatBytes(2 * 1024 * 1024)} 以內。
      </p>
    </div>
  );
}
