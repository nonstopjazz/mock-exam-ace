import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareQuote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTeacherFeedback } from "@/hooks/learn/useTeacherFeedback";

/**
 * 老師的講評輸入框（選填）。
 *
 * v1 刻意做到最小：一個 textarea、一個儲存鍵。
 * 沒有富文本、沒有行內註解、沒有審核流程、沒有必填欄位。
 *
 * ⚠️ 這【不是】發布關卡。AI 分析完成後學生就看得到報告，
 *    寫不寫講評、什麼時候寫，都不影響那件事。老師也可以完全不寫，
 *    改在課堂上口頭講。
 */
export const TeacherFeedbackEditor = ({ essayId }: { essayId: string }) => {
  const { feedback, loading, save } = useTeacherFeedback(essayId);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // 載入既有講評當草稿。老師可以隨時回來改。
  useEffect(() => {
    setDraft(feedback?.body ?? "");
  }, [feedback]);

  const dirty = draft.trim() !== (feedback?.body ?? "").trim();

  const onSave = async () => {
    setSaving(true);
    const result = await save(draft);
    setSaving(false);
    if (result.ok) {
      toast.success(draft.trim() ? "講評已儲存" : "講評已清除");
    } else {
      toast.error(result.error ?? "儲存失敗");
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquareQuote className="h-5 w-5 text-secondary shrink-0" />
        <h2 className="font-semibold text-foreground">老師講評</h2>
        <span className="text-xs text-muted-foreground">選填</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        寫下來的話會出現在學生的報告最上方，和 AI 分析分開標示。
        不寫也可以——AI 報告已經對學生公開，課堂上口頭講同樣有效。
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入現有講評
        </div>
      ) : (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：這次的結構比上次清楚很多，特別是第二段。下次注意時態要一致。"
            rows={5}
            className="resize-y"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void onSave()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {draft.trim() ? "儲存講評" : "清除講評"}
            </Button>
            {feedback ? (
              <span className="text-xs text-muted-foreground">
                上次更新：
                {new Date(feedback.updated_at).toLocaleString("zh-TW", {
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">尚未寫過講評</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
};
