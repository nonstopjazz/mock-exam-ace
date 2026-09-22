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
import { Loader2 } from "lucide-react";

/**
 * 刪除草稿的確認框。
 *
 * 刪除是不可回復的，而且拍照作文連原始照片一起帶走 —— 所以這裡要把
 *【會一起消失的東西】說清楚，不能只問一句「確定嗎」。
 *
 * 只用於草稿。已送出的作文不提供刪除入口，伺服器也會擋（409）。
 */
export function DeleteDraftDialog({
  open,
  title,
  isPhoto,
  deleting,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** 拍照作文要額外說明照片也會被刪掉 */
  isPhoto: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>刪除「{title}」？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>這篇草稿會被刪除，沒辦法復原。</p>
              {isPhoto ? (
                <p>你上傳的照片也會一起刪掉，辨識出來的文字也不會留下。</p>
              ) : null}
              <p className="text-muted-foreground">
                已經送出的作文不會受影響 —— 這裡刪的只有這一篇還沒送出的草稿。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // 刪除是非同步的：讓框留著顯示進行中，不要按下去就關掉。
              e.preventDefault();
              onConfirm();
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            刪除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
