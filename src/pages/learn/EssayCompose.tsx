import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { countWords } from "@/lib/writing/wordCount";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ArrowLeft, Camera, Loader2, Send, Type } from "lucide-react";
import { submitTextEssay } from "@/hooks/useEssays";
import { WritingPageHeader } from "@/components/learn/writing/writingShared";
import { PhotoEssayComposer } from "@/components/learn/writing/PhotoEssayComposer";
import { isFeatureEnabled } from "@/config/features";

/**
 * 寫一篇作文
 *
 * 兩種提交方式共用同一頁：打字輸入與拍照上傳。
 *
 * 拍照上傳（Phase 2）由 writing_images 這個旗標控制。它不是裝飾用的開關——
 * 資料表、Storage bucket 與辨識端點沒到位之前把它打開，學生按下去只會失敗。
 * 旗標關掉時那張卡仍然看得到，但標示「即將推出」，維持 Phase 1 的樣子。
 */
const EssayCompose = () => {
  const navigate = useNavigate();
  const photoEnabled = isFeatureEnabled("writing_images");
  const [mode, setMode] = useState<"text" | "photo">("text");

  const [title, setTitle] = useState("");
  const [essayTopic, setEssayTopic] = useState("");
  const [essayDate, setEssayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [content, setContent] = useState("");
  const [studentNotes, setStudentNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 「字數」= 單字數，與資料庫的 writing_texts.word_count 同一個定義
  const wordCount = countWords(content);
  const charCount = content.length;
  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const essayId = await submitTextEssay({
        title,
        content,
        essayTopic: essayTopic.trim() || undefined,
        essayDate,
        studentNotes: studentNotes.trim() || undefined,
      });
      toast.success("作文已送出");
      navigate(`/learn/student/writing/${essayId}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "送出失敗，請稍後再試");
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
            <Link to="/learn/student/writing">
              <ArrowLeft className="h-4 w-4" />
              我的作文
            </Link>
          </Button>

          <WritingPageHeader title="寫一篇作文" subtitle="寫完送出後就不能修改了，可以先想清楚再送" />

          {/* 提交方式 */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              type="button"
              onClick={() => setMode("text")}
              disabled={submitting}
              className="text-left"
            >
              <Card
                className={`p-6 h-full transition-colors ${
                  mode === "text"
                    ? "border-primary/40 bg-primary/5"
                    : "hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Type
                    className={`h-5 w-5 shrink-0 ${
                      mode === "text" ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span className="font-semibold text-foreground">打字輸入</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">直接把作文打在下面</p>
              </Card>
            </button>

            <button
              type="button"
              onClick={() => photoEnabled && setMode("photo")}
              disabled={!photoEnabled || submitting}
              className="text-left"
            >
              <Card
                className={`p-6 h-full transition-colors ${
                  !photoEnabled
                    ? "opacity-60"
                    : mode === "photo"
                      ? "border-primary/40 bg-primary/5"
                      : "hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Camera
                    className={`h-5 w-5 shrink-0 ${
                      photoEnabled && mode === "photo" ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`font-semibold ${
                      photoEnabled ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    拍照上傳
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {photoEnabled ? "拍下作文，系統會讀出文字讓你確認" : "即將推出"}
                </p>
              </Card>
            </button>
          </div>

          {mode === "photo" ? <PhotoEssayComposer /> : (
          <Card className="p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="essay-title">
                    標題 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="essay-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：我最難忘的一次旅行"
                    maxLength={120}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="essay-date">寫作日期</Label>
                  <Input
                    id="essay-date"
                    type="date"
                    value={essayDate}
                    onChange={(e) => setEssayDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="essay-topic">題目說明</Label>
                <Input
                  id="essay-topic"
                  value={essayTopic}
                  onChange={(e) => setEssayTopic(e.target.value)}
                  placeholder="老師出的題目或提示（可留空）"
                  maxLength={500}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="essay-content">
                    作文內容 <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-sm text-muted-foreground shrink-0">
                    {wordCount} 字
                    <span className="text-muted-foreground/70"> · {charCount} 字元</span>
                  </span>
                </div>
                <Textarea
                  id="essay-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="把作文寫在這裡⋯⋯"
                  className="min-h-[320px] leading-relaxed"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="essay-notes">給老師的話</Label>
                <Textarea
                  id="essay-notes"
                  value={studentNotes}
                  onChange={(e) => setStudentNotes(e.target.value)}
                  placeholder="想特別說明的地方（可留空）"
                  className="min-h-[80px]"
                  maxLength={1000}
                  disabled={submitting}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                <p className="text-sm text-muted-foreground sm:mr-auto">送出後就不能再修改了</p>
                <Button onClick={() => setConfirmOpen(true)} disabled={!canSubmit}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      送出中
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      送出作文
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要送出嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              送出後這篇作文就不能再修改了。如果之後想改，要重新寫一篇新的。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>再想一下</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSubmit()}>確定送出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default EssayCompose;
