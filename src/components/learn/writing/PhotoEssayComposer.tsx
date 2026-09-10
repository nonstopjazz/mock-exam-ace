import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  Camera,
  ImagePlus,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { countWords } from "@/lib/writing/wordCount";
import { useImageEssayComposer } from "@/hooks/learn/useImageEssayComposer";
import {
  ACCEPTED_IMAGE_TYPES,
  ARCHIVE_BUCKET,
  MAX_PAGES,
  SIGNED_URL_TTL_SECONDS,
} from "@/config/writingImages";

/**
 * 拍照上傳作文
 *
 * 學生看到的只有四件事：選照片 → 上傳 → 辨識 → 確認文字後送出。
 * 壓縮、封存、保存期限這些都不出現在畫面上——那是系統該處理好的事，
 * 不是學生需要理解的概念。
 */

interface Picked {
  file: File;
  previewUrl: string;
}

/** 校對畫面右側的照片：讀 writing_images 的封存圖路徑，換成短效的 signed URL。 */
function useArchiveThumbnails(essayId: string | null, enabled: boolean) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!essayId || !enabled) return;
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
  }, [essayId, enabled]);

  return urls;
}

export function PhotoEssayComposer() {
  const navigate = useNavigate();
  const composer = useImageEssayComposer();

  const [title, setTitle] = useState("");
  const [essayTopic, setEssayTopic] = useState("");
  const [essayDate, setEssayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [studentNotes, setStudentNotes] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const thumbnails = useArchiveThumbnails(composer.essayId, composer.phase === "review");
  const wordCount = countWords(composer.text);

  // 預覽用的 object URL 要自己回收，否則整頁的記憶體會隨著重選照片一路長上去
  useEffect(() => {
    return () => picked.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }, [picked]);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_PAGES - picked.length;
    if (room <= 0) {
      toast.error(`最多 ${MAX_PAGES} 張照片`);
      return;
    }
    const next = Array.from(files)
      .slice(0, room)
      .map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPicked((prev) => [...prev, ...next]);
    if (files.length > room) toast.info(`只加了 ${room} 張，一篇作文最多 ${MAX_PAGES} 張`);
  };

  const removeAt = (index: number) => {
    setPicked((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleStart = () => {
    if (title.trim().length === 0) {
      toast.error("請先填標題");
      return;
    }
    void composer.start(
      picked.map((p) => p.file),
      {
        title,
        essayTopic: essayTopic.trim() || undefined,
        essayDate,
        studentNotes: studentNotes.trim() || undefined,
      },
    );
  };

  const handleSubmit = async () => {
    setConfirmOpen(false);
    const id = await composer.submit();
    if (id) {
      toast.success("作文已送出");
      navigate(`/learn/student/writing/${id}`, { replace: true });
    }
  };

  const busy = composer.phase === "uploading" || composer.phase === "processing";

  // ── 未完成的草稿 ────────────────────────────────────────────
  if (composer.resumable && composer.phase === "select" && !composer.essayId) {
    return (
      <Card className="p-6 border-primary/20 bg-gradient-to-b from-primary/[0.05] to-card">
        <h2 className="font-semibold text-foreground">你有一篇還沒完成的作文</h2>
        <p className="text-sm text-muted-foreground mt-2">
          「{composer.resumable.title}」，已經上傳 {composer.resumable.pageCount} 張照片。
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Button onClick={() => void composer.resume()}>繼續這一篇</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            重新開始一篇
          </Button>
        </div>
      </Card>
    );
  }

  // ── 上傳中 / 辨識中 ─────────────────────────────────────────
  if (busy) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          {composer.phase === "uploading" ? (
            <>
              <p className="text-sm text-foreground">
                正在上傳第 {composer.progress.current} / {composer.progress.total} 張
              </p>
              <p className="text-xs text-muted-foreground">照片比較大時會花一點時間，請不要關掉頁面</p>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground">正在讀取你的作文</p>
              <p className="text-xs text-muted-foreground">大約需要 20 秒</p>
            </>
          )}
        </div>
      </Card>
    );
  }

  // ── 校對 ───────────────────────────────────────────────────
  if (composer.phase === "review" || composer.phase === "submitting") {
    return (
      <>
        {composer.failedPages.length > 0 ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                {composer.failedPages.map((page) => (
                  <p key={page.pageNumber}>
                    第 {page.pageNumber} 張照片沒有處理成功，請重拍這一張。
                  </p>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void composer.retry()}
              >
                <RefreshCw className="h-4 w-4" />
                再試一次
              </Button>
            </AlertDescription>
          </Alert>
        ) : composer.error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{composer.error}</span>
              <Button variant="outline" size="sm" onClick={() => void composer.retry()}>
                <RefreshCw className="h-4 w-4" />
                再試一次
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <Label htmlFor="ocr-text" className="text-base">
                請確認辨識的內容
              </Label>
              <span className="text-sm text-muted-foreground shrink-0">{wordCount} 字</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              有讀錯的地方可以直接改。改完再送出，或直接送出。
            </p>
            <Textarea
              id="ocr-text"
              value={composer.text}
              onChange={(e) => composer.setText(e.target.value)}
              className="min-h-[360px] leading-relaxed"
              disabled={composer.phase === "submitting"}
            />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 mt-6">
              <p className="text-sm text-muted-foreground sm:mr-auto">送出後就不能再修改了</p>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!composer.canSubmit || composer.phase === "submitting"}
              >
                {composer.phase === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    送出中
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    確認並送出
                  </>
                )}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-3">你上傳的照片</h3>
            {thumbnails.length === 0 ? (
              <p className="text-sm text-muted-foreground">照片載入中⋯⋯</p>
            ) : (
              <div className="space-y-3">
                {thumbnails.map((url, i) => (
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
                <p className="text-xs text-muted-foreground">點照片可以放大對照</p>
              </div>
            )}
          </Card>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定要送出嗎？</AlertDialogTitle>
              <AlertDialogDescription>
                送出後這篇作文就不能再修改了。如果還有讀錯的地方，現在改還來得及。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>再看一下</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleSubmit()}>確定送出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ── 選照片 ─────────────────────────────────────────────────
  return (
    <>
      {composer.error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{composer.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="p-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="photo-title">
                標題 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="photo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：我最難忘的一次旅行"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo-date">寫作日期</Label>
              <Input
                id="photo-date"
                type="date"
                value={essayDate}
                onChange={(e) => setEssayDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="photo-topic">題目說明</Label>
            <Input
              id="photo-topic"
              value={essayTopic}
              onChange={(e) => setEssayTopic(e.target.value)}
              placeholder="老師出的題目或提示（可留空）"
              maxLength={500}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <Label>
                作文照片 <span className="text-destructive">*</span>
              </Label>
              <span className="text-sm text-muted-foreground">
                {picked.length} / {MAX_PAGES} 張
              </span>
            </div>

            <input
              ref={cameraInput}
              id="photo-camera-input"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              capture="environment"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={libraryInput}
              id="photo-library-input"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => cameraInput.current?.click()}
                disabled={picked.length >= MAX_PAGES}
              >
                <Camera className="h-4 w-4" />
                拍照
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => libraryInput.current?.click()}
                disabled={picked.length >= MAX_PAGES}
              >
                <ImagePlus className="h-4 w-4" />
                從相簿選
              </Button>
            </div>

            {picked.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
                <Camera className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>還沒有照片</p>
                <p className="text-sm mt-2">一張紙拍一張，最多 {MAX_PAGES} 張，依順序排好</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {picked.map((item, index) => (
                  <div
                    key={item.previewUrl}
                    className="relative rounded-lg overflow-hidden border border-border"
                  >
                    <img src={item.previewUrl} alt={`第 ${index + 1} 張`} className="w-full aspect-[3/4] object-cover" />
                    <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold text-foreground">
                      第 {index + 1} 張
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      aria-label={`移除第 ${index + 1} 張`}
                      className="absolute top-2 right-2 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="photo-notes">給老師的話</Label>
            <Textarea
              id="photo-notes"
              value={studentNotes}
              onChange={(e) => setStudentNotes(e.target.value)}
              placeholder="想特別說明的地方（可留空）"
              className="min-h-[80px]"
              maxLength={1000}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            {picked.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto text-muted-foreground"
                onClick={() => setPicked([])}
              >
                <Trash2 className="h-4 w-4" />
                全部清掉
              </Button>
            ) : null}
            <Button onClick={handleStart} disabled={picked.length === 0 || title.trim().length === 0}>
              上傳並辨識
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
