import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { TaskDraft } from "@/hooks/learn/useAdminClassDetail";
import type { AdminMember, AdminTask, DueType, Recurrence, TaskType } from "@/lib/learn/tasks";
import { formatDate } from "@/lib/learn/tasks";

const blank = (type: TaskType): TaskDraft => ({
  taskId: null,
  type,
  title: "",
  instruction: "",
  dueType: "NEXT_CLASS",
  dueDate: null,
  recurrence: "DAILY",
  targetPerPeriod: 1,
  studentIds: null,
});

const fromTask = (t: AdminTask): TaskDraft => ({
  taskId: t.task_id,
  type: t.type,
  title: t.title,
  instruction: t.instruction ?? "",
  dueType: (t.due_type ?? "NEXT_CLASS") as DueType,
  dueDate: t.due_date,
  recurrence: (t.recurrence ?? "DAILY") as Recurrence,
  targetPerPeriod: t.target_per_period ?? 1,
  studentIds: t.assignees.map((a) => a.student_id),
});

/**
 * 新增／編輯任務。
 *
 * 🛑 一份內容只有一列。指派給誰只影響指派名單，不會複製出多份任務。
 *    如果某位學生需要不同的內容，那是【另一個任務】，只指派給他。
 */
export const TaskEditorDialog = ({
  open,
  onOpenChange,
  type,
  editing,
  members,
  nextClassDate,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: TaskType;
  editing: AdminTask | null;
  members: AdminMember[];
  nextClassDate: string | null;
  onSave: (draft: TaskDraft) => Promise<{ ok: true; retained?: string[] } | { ok: false; error: string }>;
}) => {
  const [draft, setDraft] = useState<TaskDraft>(() => blank(type));
  const [whole, setWhole] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const d = fromTask(editing);
      setDraft(d);
      // 指派名單剛好等於全班時，維持「指派給全班」的語意，之後加人會自動涵蓋
      setWhole((d.studentIds?.length ?? 0) === members.length);
    } else {
      setDraft(blank(type));
      setWhole(true);
    }
  }, [open, editing, type, members.length]);

  const patch = (p: Partial<TaskDraft>) => setDraft((prev) => ({ ...prev, ...p }));

  const toggleStudent = (id: string) => {
    setDraft((prev) => {
      const cur = new Set(prev.studentIds ?? members.map((m) => m.student_id));
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...prev, studentIds: [...cur] };
    });
  };

  const selected = new Set(draft.studentIds ?? members.map((m) => m.student_id));

  const submit = async () => {
    if (!draft.title.trim()) {
      toast.error("請輸入任務名稱");
      return;
    }
    if (draft.type === "HOMEWORK" && draft.dueType === "CUSTOM_DATE" && !draft.dueDate) {
      toast.error("請選擇截止日期");
      return;
    }
    const ids = whole ? null : [...selected];
    if (ids !== null && ids.length === 0) {
      toast.error("請至少選一位學生");
      return;
    }
    setSaving(true);
    const r = await onSave({ ...draft, title: draft.title.trim(), studentIds: ids });
    setSaving(false);
    if (!r.ok) {
      toast.error(`儲存失敗：${r.error}`);
      return;
    }
    if (r.retained && r.retained.length > 0) {
      // 有紀錄的人不會被靜靜刪掉——明確告訴老師
      toast.warning(`${r.retained.join("、")} 已經有紀錄，仍保留在這個任務裡`);
    } else {
      toast.success(editing ? "已更新" : "已指派");
    }
    onOpenChange(false);
  };

  const isHw = draft.type === "HOMEWORK";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "編輯" : "新增"}
            {isHw ? "作業" : "常態練習"}
          </DialogTitle>
          <DialogDescription>
            {isHw
              ? "一次性的作業，有截止日。"
              : "會重複的練習，學生每次做完自己打卡。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">名稱</Label>
            <Input
              id="task-title"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={isHw ? "例如：講義 P.20–25" : "例如：複習單字"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-instruction">給學生的說明（選填）</Label>
            <Textarea
              id="task-instruction"
              value={draft.instruction}
              onChange={(e) => patch({ instruction: e.target.value })}
              rows={2}
              placeholder="寫完記得對答案"
            />
          </div>

          {isHw ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>截止</Label>
                <Select
                  value={draft.dueType}
                  onValueChange={(v) => patch({ dueType: v as DueType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEXT_CLASS">下次上課前</SelectItem>
                    <SelectItem value="CUSTOM_DATE">指定日期</SelectItem>
                    <SelectItem value="NONE">沒有截止日</SelectItem>
                  </SelectContent>
                </Select>
                {draft.dueType === "NEXT_CLASS" ? (
                  <p className="text-sm text-muted-foreground">
                    {nextClassDate
                      ? `目前是 ${formatDate(nextClassDate)}，改班級日期時會一起移動`
                      : "尚未排定上課日，學生看到的是「下次上課前」"}
                  </p>
                ) : null}
              </div>
              {draft.dueType === "CUSTOM_DATE" ? (
                <div className="space-y-2">
                  <Label htmlFor="task-due">日期</Label>
                  <Input
                    id="task-due"
                    type="date"
                    value={draft.dueDate ?? ""}
                    onChange={(e) => patch({ dueDate: e.target.value || null })}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>頻率</Label>
                <Select
                  value={draft.recurrence}
                  onValueChange={(v) => patch({ recurrence: v as Recurrence })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">每天</SelectItem>
                    <SelectItem value="WEEKLY">每週</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-target">目標次數</Label>
                <Input
                  id="task-target"
                  type="number"
                  min={1}
                  max={50}
                  value={draft.targetPerPeriod}
                  onChange={(e) =>
                    patch({ targetPerPeriod: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {draft.recurrence === "DAILY" ? "每天" : "每週"} {draft.targetPerPeriod} 次
                </p>
              </div>
            </div>
          )}

          {/* 指派對象 */}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label>指派給</Label>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                這個班還沒有學生，請先加入名冊再指派。
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Checkbox checked={whole} onCheckedChange={(v) => setWhole(!!v)} />
                  <span className="text-sm">全班（{members.length} 位）</span>
                </label>
                {!whole ? (
                  <div className="max-h-44 overflow-y-auto rounded-md border border-border p-2">
                    {members.map((m) => (
                      <label
                        key={m.student_id}
                        className="flex items-center gap-2 py-1.5 cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.has(m.student_id)}
                          onCheckedChange={() => toggleStudent(m.student_id)}
                        />
                        <span className="text-sm truncate">{m.display_name}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  同一份內容只會存一次，不會依學生複製。內容不同的話請另外開一個任務。
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving || members.length === 0}>
            {saving ? "儲存中…" : editing ? "儲存" : "指派"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
