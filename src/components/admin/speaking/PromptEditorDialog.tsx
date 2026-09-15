import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import type { PromptDraft } from "@/hooks/learn/useAdminSpeakingPrompts";
import type { AdminSpeakingPrompt } from "@/lib/speaking/types";

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = 新增 */
  editing: AdminSpeakingPrompt | null;
  onSave: (draft: PromptDraft) => Promise<{ ok: boolean; error?: string }>;
}

const emptyDraft = (): PromptDraft => ({
  id: null,
  part: 1,
  topic: "",
  question: "",
  title: "",
  cue: "",
  bullets: [],
  is_active: true,
  sort_order: 0,
});

const draftOf = (prompt: AdminSpeakingPrompt): PromptDraft => ({
  id: prompt.id,
  part: prompt.part,
  topic: prompt.topic ?? "",
  question: prompt.question ?? "",
  title: prompt.title ?? "",
  cue: prompt.cue ?? "",
  bullets: prompt.bullets ?? [],
  is_active: prompt.is_active,
  sort_order: prompt.sort_order,
});

/**
 * 新增／編輯一題。
 *
 * Part 1/3 與 Part 2 的欄位不同，所以表單跟著 part 換——
 * 一次把六個欄位全攤開，老師會不知道哪幾個該填。
 * 真正的把關是表上的 speaking_prompts_part_shape，這裡只擋空白。
 */
export function PromptEditorDialog({
  open,
  onOpenChange,
  editing,
  onSave,
}: PromptEditorDialogProps) {
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(editing ? draftOf(editing) : emptyDraft());
      setError(null);
    }
  }, [open, editing]);

  const isPart2 = draft.part === 2;
  const incomplete = isPart2
    ? !draft.title.trim() || !draft.cue.trim()
    : !draft.question.trim();

  const handleSave = async () => {
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    if (result.ok) onOpenChange(false);
    else setError(result.error ?? "存檔失敗");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "編輯題目" : "新增題目"}</DialogTitle>
          <DialogDescription>
            Part 1／3 是簡答與追問，Part 2 是一張卡片（準備 1 分鐘、講 2 分鐘）。
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Part</Label>
            <Tabs
              value={String(draft.part)}
              onValueChange={(value) =>
                setDraft((d) => ({ ...d, part: Number(value) as 1 | 2 | 3 }))
              }
            >
              <TabsList className="w-full">
                <TabsTrigger value="1" className="flex-1">
                  Part 1
                </TabsTrigger>
                <TabsTrigger value="2" className="flex-1">
                  Part 2
                </TabsTrigger>
                <TabsTrigger value="3" className="flex-1">
                  Part 3
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isPart2 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="prompt-title">卡片標題</Label>
                <Input
                  id="prompt-title"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Describe a place you would like to live in"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-cue">提示語</Label>
                <Textarea
                  id="prompt-cue"
                  rows={2}
                  value={draft.cue}
                  onChange={(e) => setDraft((d) => ({ ...d, cue: e.target.value }))}
                  placeholder="You should say:"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-bullets">要點（一行一個）</Label>
                <Textarea
                  id="prompt-bullets"
                  rows={4}
                  value={draft.bullets.join("\n")}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, bullets: e.target.value.split("\n") }))
                  }
                  placeholder={"where it is\nwhat it looks like\nwhy you would like to live there"}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="prompt-topic">主題（選填）</Label>
                <Input
                  id="prompt-topic"
                  value={draft.topic}
                  onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))}
                  placeholder="Hometown"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-question">問題</Label>
                <Textarea
                  id="prompt-question"
                  rows={3}
                  value={draft.question}
                  onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
                  placeholder="Where is your hometown?"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-order">排序</Label>
              <Input
                id="prompt-order"
                type="number"
                value={draft.sort_order}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-active">開放給學生</Label>
              <div className="flex h-10 items-center">
                <Switch
                  id="prompt-active"
                  checked={draft.is_active}
                  onCheckedChange={(checked) => setDraft((d) => ({ ...d, is_active: checked }))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || incomplete}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
