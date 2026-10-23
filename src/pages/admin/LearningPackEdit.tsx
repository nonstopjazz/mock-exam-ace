import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle, ArrowDown, ArrowUp, BookOpen, Loader2, Pencil, Plus,
  Trash2, Type,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { LearningPackUnitDialog } from "@/components/admin/LearningPackUnitDialog";
import { useLearningPack, useLearningPackSources } from "@/hooks/learn/useLearningPacks";
import {
  isGenericPractice, STATUS_LABEL, STUDENT_SIDE_NOT_LIVE,
  TASK_KIND_LABEL, VOCAB_MODE_LABEL,
  type LearningPack, type PackUnit,
} from "@/lib/learn/learningPacks";

/**
 * 學習包編輯（管理端）。
 *
 * 🛑 儲存時只送【改過的欄位】。整包寫回去的話，兩個分頁同時編輯會互相覆蓋，
 *    而且後蓋前的那一方不會知道自己蓋掉了什麼。
 *
 * 🛑 清空要靠 p_clear 點名。RPC 用「NULL = 不改」的語意，
 *    所以送 NULL 清不掉預計時間與開放時間（文字欄位送空字串還有救，數字沒有）。
 */

/** 可以被清空的欄位 → 資料庫欄名。不在這裡的欄位清不掉，也不該讓它變成空的。 */
const CLEARABLE = {
  grade: "grade",
  textbook_version: "textbook_version",
  textbook_volume: "textbook_volume",
  textbook_lessons: "textbook_lessons",
  scope_note: "scope_note",
  estimated_minutes: "estimated_minutes",
  open_at: "open_at",
  close_at: "close_at",
} as const;

type FormState = {
  title: string; slug: string; summary: string; grade: string;
  textbook_version: string; textbook_volume: string; textbook_lessons: string;
  scope_note: string; goals: string; estimated_minutes: string;
  open_at: string; close_at: string;
};

/** ISO → datetime-local 吃得下的字串（本地時區） */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromForm(pack: LearningPack): FormState {
  return {
    title: pack.title,
    slug: pack.slug,
    summary: pack.summary ?? "",
    grade: pack.grade ?? "",
    textbook_version: pack.textbook_version ?? "",
    textbook_volume: pack.textbook_volume ?? "",
    textbook_lessons: pack.textbook_lessons ?? "",
    scope_note: pack.scope_note ?? "",
    goals: (pack.goals ?? []).join("\n"),
    estimated_minutes: pack.estimated_minutes != null ? String(pack.estimated_minutes) : "",
    open_at: toLocalInput(pack.open_at),
    close_at: toLocalInput(pack.close_at),
  };
}

/** 單元的一句話描述。學生要做什麼，用老師看得懂的話講 */
function unitSummary(u: PackUnit): string {
  if (u.activity_type === "reading") {
    return `閱讀「${u.source_title ?? u.reading_passage_id}」· ${u.source_available} 題`;
  }
  const scope = u.target_count != null ? `${u.target_count} 個` : `全部 ${u.source_available} 個`;
  return `${u.source_title ?? "（找不到單字集）"} · ${VOCAB_MODE_LABEL[u.vocab_mode ?? "quick_quiz"]} · ${scope}`;
}

function UnitRow({
  unit, index, total, busy, onMove, onEdit, onDelete,
}: {
  unit: PackUnit; index: number; total: number; busy: boolean;
  onMove: (from: number, to: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // 🛑 來源沒了或設定做不完的單元，在列表上就要看得出來
  const broken = unit.source_available === 0;
  const tooMany = unit.target_count != null && unit.target_count > unit.source_available;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1 shrink-0">
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          aria-label={`把「${unit.title}」往上移`}
          disabled={busy || index === 0}
          onClick={() => onMove(index, index - 1)}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          aria-label={`把「${unit.title}」往下移`}
          disabled={busy || index === total - 1}
          onClick={() => onMove(index, index + 1)}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
          {unit.activity_type === "reading" ? (
            <BookOpen className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          ) : (
            <Type className="h-4 w-4 text-secondary shrink-0" aria-hidden="true" />
          )}
          <p className="font-medium text-foreground truncate">{unit.title}</p>
          <Badge variant="outline" className="text-[10px] font-normal">
            {TASK_KIND_LABEL[unit.task_kind]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 truncate">{unitSummary(unit)}</p>

        {broken ? (
          <p className="text-xs text-destructive mt-1.5">
            來源目前沒有內容，這個單元出不了題，發布會被擋下來。
          </p>
        ) : tooMany ? (
          <p className="text-xs text-destructive mt-1.5">
            要完成 {unit.target_count} 個，但來源只有 {unit.source_available} 個 —— 學生做不完。
          </p>
        ) : null}
      </div>

      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="編輯單元" onClick={onEdit} disabled={busy}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="刪除單元" onClick={onDelete} disabled={busy}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function LearningPackEdit() {
  const { packId } = useParams<{ packId: string }>();
  const {
    pack, loading, error, saving, setError,
    savePack, saveUnit, deleteUnit, reorder, setStatus,
  } = useLearningPack(packId ?? null);
  const { sources } = useLearningPackSources(true);

  const [form, setForm] = useState<FormState | null>(null);
  /**
   * 🛑 表單的比對基準是【載入時的那一份】，不是 pack 的當下值。
   *
   *    每一個單元操作（新增、排序、刪除、發布）都會回傳整包並更新 pack。
   *    如果表單跟著 pack 重設，老師在右欄打到一半的簡介會在他按下
   *    「新增單元」的那一刻無聲消失 —— 而且他不會知道是什麼弄掉的。
   *
   *    拿它當 diff 的基準也比較安全：沒碰過的欄位永遠不會被送出去，
   *    即使另一個分頁同時改了同一個包。
   */
  const [base, setBase] = useState<FormState | null>(null);
  const [unitOpen, setUnitOpen] = useState(false);
  const [editing, setEditing] = useState<PackUnit | null>(null);
  const [deleting, setDeleting] = useState<PackUnit | null>(null);

  // 只在第一次拿到這個包的時候鋪上表單。之後由存檔自己重設基準。
  useEffect(() => {
    if (!pack) return;
    setForm((f) => (f === null ? fromForm(pack) : f));
    setBase((b) => (b === null ? fromForm(pack) : b));
  }, [pack]);

  // 換包（例如從清單點進另一個）時要清掉，否則會沿用上一個包的表單
  useEffect(() => {
    setForm(null);
    setBase(null);
  }, [packId]);

  const dirty = useMemo(() => {
    if (!base || !form) return false;
    return JSON.stringify(form) !== JSON.stringify(base);
  }, [base, form]);

  const set = (k: keyof FormState, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const onSave = async () => {
    if (!pack || !form || !base) return;
    const fields: Record<string, unknown> = {};
    const clear: string[] = [];

    // 必填的兩個欄位：空的就不送，而不是送出去讓資料庫丟錯
    if (form.title.trim() && form.title !== base.title) fields.p_title = form.title.trim();
    if (form.slug.trim() && form.slug !== base.slug) fields.p_slug = form.slug.trim();
    // summary 是 NOT NULL，清空＝空字串，不走 p_clear
    if (form.summary !== base.summary) fields.p_summary = form.summary;
    if (form.goals !== base.goals) {
      fields.p_goals = form.goals.split("\n").map((g) => g.trim()).filter(Boolean);
    }

    const textish = ["grade", "textbook_version", "textbook_volume", "textbook_lessons", "scope_note"] as const;
    for (const k of textish) {
      if (form[k] === base[k]) continue;
      if (form[k].trim() === "") clear.push(CLEARABLE[k]);
      else fields[`p_${k}`] = form[k].trim();
    }

    if (form.estimated_minutes !== base.estimated_minutes) {
      if (form.estimated_minutes.trim() === "") clear.push(CLEARABLE.estimated_minutes);
      else fields.p_estimated_minutes = Number(form.estimated_minutes);
    }
    for (const k of ["open_at", "close_at"] as const) {
      if (form[k] === base[k]) continue;
      if (form[k] === "") clear.push(CLEARABLE[k]);
      else fields[`p_${k}`] = new Date(form[k]).toISOString();
    }

    if (clear.length > 0) fields.p_clear = clear;
    if (Object.keys(fields).length === 0) return;

    const next = await savePack(fields);
    if (next) {
      // 伺服器可能做了正規化（btrim、slug 重複等），所以基準與表單都照它回的值重鋪
      const applied = fromForm(next);
      setForm(applied);
      setBase(applied);
      toast.success("已儲存");
    }
  };

  const onMove = async (from: number, to: number) => {
    if (!pack) return;
    const ids = pack.units.map((u) => u.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    await reorder(ids);
  };

  const onUnitSave = async (fields: Record<string, unknown>) => {
    const next = await saveUnit(fields);
    if (next) toast.success(editing ? "已更新單元" : "已加入單元");
    return next !== null;
  };

  const onPublish = async () => {
    const next = await setStatus("PUBLISHED");
    // 🛑 不可以說「學生看得到了」—— 第二期之前那是假話
    if (next) toast.success("已標記為發布（學生端第二期才會上線）");
  };
  const onUnpublish = async () => {
    const next = await setStatus("DRAFT");
    if (next) toast.success("已退回草稿");
  };

  if (loading && !pack) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">載入學習包</p>
          </div>
        </div>
      </div>
    );
  }

  if (!pack || !form) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <AdminPageHeader
            title="找不到這個學習包"
            trail={[{ label: "主題學習包", to: "/admin/learning-packs" }]}
          />
          <Card className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>{error ?? "這個學習包不存在，或已經被刪掉了。"}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/admin/learning-packs">回學習包清單</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const blocked = pack.problems.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminPageHeader
          icon={BookOpen}
          title={pack.title}
          subtitle={`/${pack.slug}`}
          trail={[{ label: "主題學習包", to: "/admin/learning-packs" }]}
          action={
            <div className="flex items-center gap-2">
              <Badge variant="outline">{STATUS_LABEL[pack.status]}</Badge>
              {pack.status === "PUBLISHED" ? (
                <Button variant="outline" onClick={onUnpublish} disabled={saving}>
                  退回草稿
                </Button>
              ) : (
                <Button onClick={onPublish} disabled={saving || blocked}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  發布
                </Button>
              )}
            </div>
          }
        />

        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>知道了</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* 🛑 發布之後學生看不到 —— 在按下發布的那一頁講，不是只寫在清單頁 */}
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{STUDENT_SIDE_NOT_LIVE}</AlertDescription>
        </Alert>

        {/* 🛑 為什麼還不能發布，列在最上面而不是等按下去才說 */}
        {blocked && pack.status !== "PUBLISHED" ? (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium text-foreground mb-1">還不能發布：</p>
              <ul className="space-y-1">
                {pack.problems.map((p, i) => (
                  <li key={`${p.code}-${p.unit_id ?? i}`}>・{p.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── 單元 ───────────────────────────── */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">學習路徑</h2>
              <Button
                size="sm"
                onClick={() => { setEditing(null); setUnitOpen(true); }}
                disabled={saving}
              >
                <Plus className="h-4 w-4 mr-2" />
                新增單元
              </Button>
            </div>

            {pack.units.length === 0 ? (
              <Card className="p-6">
                <div className="text-center py-10 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>還沒有單元</p>
                  <p className="text-sm mt-2">
                    加入文章與單字練習，依照你排的順序，學生會一個接一個做下去。
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => { setEditing(null); setUnitOpen(true); }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    加入第一個單元
                  </Button>
                </div>
              </Card>
            ) : (
              pack.units.map((u, i) => (
                <UnitRow
                  key={u.id}
                  unit={u}
                  index={i}
                  total={pack.units.length}
                  busy={saving}
                  onMove={onMove}
                  onEdit={() => { setEditing(u); setUnitOpen(true); }}
                  onDelete={() => setDeleting(u)}
                />
              ))
            )}
          </div>

          {/* ── 基本資料 ───────────────────────── */}
          <div className="lg:col-span-2">
            <Card className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground">基本資料</h2>

              <div className="space-y-2">
                <Label htmlFor="f-title">名稱</Label>
                <Input id="f-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-slug">網址代號</Label>
                <Input id="f-slug" value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-summary">簡介</Label>
                <Textarea
                  id="f-summary" rows={3} value={form.summary}
                  onChange={(e) => set("summary", e.target.value)}
                  placeholder="學生在列表上看到的一兩句話"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-goals">學習目標</Label>
                <Textarea
                  id="f-goals" rows={3} value={form.goals}
                  onChange={(e) => set("goals", e.target.value)}
                  placeholder="一行一個"
                  aria-describedby="f-goals-help"
                />
                <p id="f-goals-help" className="text-xs text-muted-foreground">一行一個目標。</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="f-grade">年級</Label>
                  <Input id="f-grade" value={form.grade} onChange={(e) => set("grade", e.target.value)} placeholder="高一" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-minutes">預計分鐘</Label>
                  <Input
                    id="f-minutes" type="number" min={1} inputMode="numeric"
                    value={form.estimated_minutes}
                    onChange={(e) => set("estimated_minutes", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="f-version">教材版本</Label>
                <Input
                  id="f-version" value={form.textbook_version}
                  onChange={(e) => set("textbook_version", e.target.value)}
                  placeholder="龍騰、三民…"
                  aria-describedby="f-version-help"
                />
                {/* 🛑 「高一上第一次段考」各校範圍不同。沒填版本就不可以讓學生以為對得上。 */}
                <p id="f-version-help" className="text-xs text-muted-foreground">
                  {isGenericPractice({ textbook_version: form.textbook_version || null })
                    ? "沒填版本時，學生端會標示為「共通能力練習」，不會宣稱對應某校範圍。"
                    : "學生端會顯示這個版本，並提醒各校範圍仍可能不同。"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="f-volume">冊別</Label>
                  <Input id="f-volume" value={form.textbook_volume} onChange={(e) => set("textbook_volume", e.target.value)} placeholder="第一冊" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-lessons">課次</Label>
                  <Input id="f-lessons" value={form.textbook_lessons} onChange={(e) => set("textbook_lessons", e.target.value)} placeholder="L1–L3" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="f-scope">範圍說明</Label>
                <Textarea
                  id="f-scope" rows={2} value={form.scope_note}
                  onChange={(e) => set("scope_note", e.target.value)}
                  placeholder="例如：各校進度不同，請以老師公布的範圍為準"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="f-open">開放時間</Label>
                  <Input id="f-open" type="datetime-local" value={form.open_at} onChange={(e) => set("open_at", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-close">關閉時間</Label>
                  <Input id="f-close" type="datetime-local" value={form.close_at} onChange={(e) => set("close_at", e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">兩個都留空代表發布之後就一直開著。</p>
              </div>

              <Button onClick={onSave} disabled={saving || !dirty} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {dirty ? "儲存變更" : "沒有未儲存的變更"}
              </Button>
            </Card>
          </div>
        </div>
      </div>

      <LearningPackUnitDialog
        open={unitOpen}
        onOpenChange={setUnitOpen}
        unit={editing}
        sources={sources}
        saving={saving}
        onSave={onUnitSave}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{deleting?.title}」？</AlertDialogTitle>
            {/* 老師最常擔心的是「會不會把文章也刪掉」，所以直接回答 */}
            <AlertDialogDescription>
              只會從這個學習包移除這個單元，原本的文章或單字集不受影響。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                const next = await deleteUnit(deleting.id);
                setDeleting(null);
                if (next) toast.success("已移除單元");
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
