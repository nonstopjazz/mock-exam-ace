import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, CalendarDays, ClipboardList, Repeat, UserMinus, UserPlus, Users, Plus, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminClassDetail } from "@/hooks/learn/useAdminClassDetail";
import { AddStudentsDialog } from "@/components/admin/classes/AddStudentsDialog";
import { TaskEditorDialog } from "@/components/admin/classes/TaskEditorDialog";
import {
  TEACHER_STATUS_LABEL, formatDate,
  type AdminTask, type TaskType, type TeacherStatus,
} from "@/lib/learn/tasks";

/* ---------- 一位學生在一個任務上的狀態列 ---------- */

const AssigneeRow = ({
  task,
  assignee,
  onCheck,
}: {
  task: AdminTask;
  assignee: AdminTask["assignees"][number];
  onCheck: (status: TeacherStatus | null) => void;
}) => {
  const recurring = task.type === "RECURRING";

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-border/60 last:border-0">
      <span className="text-sm font-medium text-foreground min-w-0 flex-1 truncate">
        {assignee.display_name}
      </span>

      {recurring ? (
        <span className="text-sm text-muted-foreground tabular-nums shrink-0">
          當期 {assignee.period_count} / {task.target_per_period}
        </span>
      ) : (
        <>
          {assignee.student_reported && !assignee.teacher_status ? (
            <Badge
              variant="outline"
              className="text-xs font-normal shrink-0 border-secondary/40 text-secondary"
            >
              學生已標記
            </Badge>
          ) : null}

          <div className="flex items-center gap-1 shrink-0">
            {(["DONE", "PARTIAL", "NOT_DONE"] as TeacherStatus[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={assignee.teacher_status === s ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onCheck(assignee.teacher_status === s ? null : s)}
              >
                {TEACHER_STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ---------- 頁面 ---------- */

const ClassDetail = () => {
  const { classId } = useParams<{ classId: string }>();
  const api = useAdminClassDetail(classId);
  const { detail } = api;

  const [addOpen, setAddOpen] = useState(false);
  const [editorType, setEditorType] = useState<TaskType>("HOMEWORK");
  const [editing, setEditing] = useState<AdminTask | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [dateDraft, setDateDraft] = useState<string | null>(null);

  if (api.loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-10 w-56 mb-8" />
          <Card className="p-6">
            <Skeleton className="h-5 w-32 mb-3" />
            <Skeleton className="h-4 w-full" />
          </Card>
        </div>
      </div>
    );
  }

  if (api.error || !detail) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>{api.error ?? "找不到這個班級"}</AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/admin/classes">
              <ArrowLeft className="h-4 w-4 mr-2" />
              回到班級列表
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const homework = detail.tasks.filter((t) => t.type === "HOMEWORK");
  const recurring = detail.tasks.filter((t) => t.type === "RECURRING");
  const editingDate = dateDraft !== null;

  const saveDate = async () => {
    const r = await api.setNextClassDate(dateDraft || null);
    setDateDraft(null);
    if (!r.ok) {
      toast.error(`更新失敗：${r.error}`);
      return;
    }
    toast.success(
      r.affected > 0
        ? `已更新，${r.affected} 筆「下次上課前」的作業一起移動`
        : "已更新下次上課日期",
    );
  };

  const openEditor = (type: TaskType, task: AdminTask | null) => {
    setEditorType(type);
    setEditing(task);
    setEditorOpen(true);
  };

  const renderTaskCard = (t: AdminTask) => (
    <Card key={t.task_id} className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{t.title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t.type === "HOMEWORK"
              ? t.due_type === "NEXT_CLASS"
                ? `下次上課前${t.resolved_due_date ? ` · ${formatDate(t.resolved_due_date)}` : "（未排定）"}`
                : t.due_type === "CUSTOM_DATE"
                  ? formatDate(t.due_date)
                  : "沒有截止日"
              : `${t.recurrence === "DAILY" ? "每天" : "每週"} ${t.target_per_period} 次`}
            {" · "}
            {t.assignees.length} 位學生
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => openEditor(t.type, t)}>
            編輯
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="封存這個任務"
            onClick={async () => {
              const r = await api.archiveTask(t.task_id);
              if (!r.ok) toast.error("封存失敗");
              else toast.success("已封存");
            }}
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {t.instruction ? (
        <p className="text-sm text-foreground/85 leading-relaxed mb-3">{t.instruction}</p>
      ) : null}

      {t.type === "HOMEWORK" && t.assignees.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground">全班一次標記：</span>
          {(["DONE", "NOT_DONE"] as TeacherStatus[]).map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={async () => {
                const r = await api.checkTaskBulk(t.task_id, s);
                if (!r.ok) toast.error("標記失敗");
                else toast.success(`全班已標記為「${TEACHER_STATUS_LABEL[s]}」`);
              }}
            >
              {TEACHER_STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      ) : null}

      {t.assignees.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">尚未指派給任何學生</p>
      ) : (
        t.assignees.map((a) => (
          <AssigneeRow
            key={a.student_id}
            task={t}
            assignee={a}
            onCheck={async (status) => {
              const r = await api.checkTask(t.task_id, a.student_id, status);
              if (!r.ok) toast.error("標記失敗");
            }}
          />
        ))
      )}
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/admin/classes">
            <ArrowLeft className="h-4 w-4 mr-2" />
            班級列表
          </Link>
        </Button>

        {/* 頁首 */}
        <div className="mb-8">
          <div className="flex items-center gap-3 min-w-0 mb-3">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
              <Users className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                {detail.class.name}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                {detail.members.length} 位學生
                {detail.class.status === "ARCHIVED" ? " · 已封存" : ""}
              </p>
            </div>
          </div>

          {/* 下次上課日期 —— 改一次會移動全班的 NEXT_CLASS 作業，所以獨立成一個動作 */}
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <CalendarDays className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">下次上課</p>
                  <p className="text-sm text-muted-foreground">
                    設定為「下次上課前」的作業都跟著這個日期
                  </p>
                </div>
              </div>

              {editingDate ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="date"
                    value={dateDraft ?? ""}
                    onChange={(e) => setDateDraft(e.target.value)}
                    className="w-auto"
                  />
                  <Button size="sm" onClick={saveDate}>
                    儲存
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDateDraft(null)}>
                    取消
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-bold text-foreground">
                    {detail.class.next_class_date
                      ? formatDate(detail.class.next_class_date)
                      : "尚未排定"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDateDraft(detail.class.next_class_date ?? "")}
                  >
                    修改
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 名冊 */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-foreground">名冊</h2>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              加入學生
            </Button>
          </div>

          <Card className="p-6">
            {detail.members.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>這個班還沒有學生</p>
                <p className="text-sm mt-2">點擊「加入學生」搜尋既有帳號並加入名冊</p>
              </div>
            ) : (
              detail.members.map((m) => (
                <div
                  key={m.student_id}
                  className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{m.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.email}
                      {m.grade ? ` · ${m.grade}` : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={`把 ${m.display_name} 移出名冊`}
                    onClick={() => setRemoving({ id: m.student_id, name: m.display_name })}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </Card>
        </section>

        {/* 作業 */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground shrink-0" />
              <h2 className="text-lg font-semibold text-foreground">作業</h2>
            </div>
            <Button size="sm" variant="outline" onClick={() => openEditor("HOMEWORK", null)}>
              <Plus className="h-4 w-4 mr-2" />
              新增作業
            </Button>
          </div>

          {homework.length === 0 ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <p>目前沒有進行中的作業</p>
                <p className="text-sm mt-2">新增之後可以指派給全班或選定的學生</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">{homework.map(renderTaskCard)}</div>
          )}
        </section>

        {/* 常態練習 */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-muted-foreground shrink-0" />
              <h2 className="text-lg font-semibold text-foreground">常態練習</h2>
            </div>
            <Button size="sm" variant="outline" onClick={() => openEditor("RECURRING", null)}>
              <Plus className="h-4 w-4 mr-2" />
              新增練習
            </Button>
          </div>

          {recurring.length === 0 ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <p>目前沒有常態練習</p>
                <p className="text-sm mt-2">例如「每天複習單字 1 次」「每週閱讀 3 次」</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">{recurring.map(renderTaskCard)}</div>
          )}
        </section>
      </div>

      <AddStudentsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        search={api.searchStudents}
        onAdd={api.addMembers}
      />

      <TaskEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        type={editorType}
        editing={editing}
        members={detail.members}
        nextClassDate={detail.class.next_class_date}
        onSave={api.saveTask}
      />

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>把 {removing?.name} 移出名冊？</AlertDialogTitle>
            <AlertDialogDescription>
              他已經完成的作業與打卡紀錄都會保留，只是不會再收到這個班的新任務。
              之後可以重新加入。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!removing) return;
                const r = await api.removeMember(removing.id);
                setRemoving(null);
                if (!r.ok) toast.error("移除失敗");
                else toast.success("已移出名冊");
              }}
            >
              移出名冊
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClassDetail;
