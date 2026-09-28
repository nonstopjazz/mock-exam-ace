import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, Lock, Pencil, Plus, Video,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { saveCourse, useAdminCourses, useCourseConfig } from "@/hooks/learn/useCourseAdmin";
import { formatDurationLong, LEVEL_LABEL } from "@/lib/learn/course/format";

/**
 * 影片課程管理。
 *
 * 原本這一頁的課程是寫死在 useState 裡的假資料，而且三顆「編輯」按鈕都
 * 導向一條被 Navigate to="/" 攔掉的路徑——在 dev 按下去會被踢回首頁，
 * 在 production 這一頁根本不存在。
 */

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT:     { label: "草稿",   className: "bg-muted text-muted-foreground" },
  PUBLISHED: { label: "已發布", className: "bg-success/10 text-success border-success/20" },
  ARCHIVED:  { label: "已下架", className: "bg-muted text-muted-foreground line-through" },
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);

export default function CourseManagement() {
  const navigate = useNavigate();
  const { courses, loading, error, reload } = useAdminCourses();
  const { config } = useCourseConfig();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: "", slug: "", type: "STANDARD", access: "ENROLLED" });

  // 🛑 有 Bunny 影片但金鑰沒設 = 那些影片現在一播就報錯。
  //    這件事只有管理員看得到，所以一定要講在這裡。
  const bunnyBroken = useMemo(
    () => (config?.bunny_lesson_count ?? 0) > 0
      && (!config?.bunny_library_id || (config.bunny_token_required && !config.vault_key_present)),
    [config],
  );

  const create = async () => {
    const slug = draft.slug.trim() || slugify(draft.title);
    if (!draft.title.trim()) { toast.error("課名不能空白"); return; }
    if (!slug) { toast.error("代號產不出來，請自己填一個"); return; }

    setSaving(true);
    const result = await saveCourse({
      title: draft.title.trim(), slug,
      type: draft.type, access: draft.access, status: "DRAFT",
    });
    setSaving(false);

    if (!result.ok) { toast.error(result.message); return; }
    toast.success("建好了，接著加影片");
    setCreating(false);
    setDraft({ title: "", slug: "", type: "STANDARD", access: "ENROLLED" });
    navigate(`/admin/courses/${result.course.id}/edit`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg bg-primary/10 p-2 md:p-3">
              <Video className="h-6 w-6 text-primary md:h-8 md:w-8" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground md:text-4xl">影片課程管理</h1>
              <p className="hidden text-sm text-muted-foreground sm:block">
                建立課程、編排影片、決定開放給誰
              </p>
            </div>
          </div>
          <Button onClick={() => setCreating(true)} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />新增課程
          </Button>
        </div>

        {bunnyBroken && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              有 {config?.bunny_lesson_count} 支 Bunny 影片，但
              {!config?.bunny_library_id ? "Library ID 還沒設定" : "Vault 裡的 BUNNY_TOKEN_AUTH_KEY 讀不到"}
              —— 這些影片現在一播就會報錯。設定在下面。
            </AlertDescription>
          </Alert>
        )}

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {loading ? (
          <Card><CardContent className="flex justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </CardContent></Card>
        ) : courses.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Video className="mx-auto mb-3 h-12 w-12 opacity-40" />
            <p>還沒有任何課程</p>
            <p className="mt-2 text-sm">按右上角「新增課程」開始</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => {
              const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.DRAFT;
              return (
                <Card key={c.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-foreground">{c.title}</span>
                        <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                        {c.access === "FREE" && (
                          <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                            免費
                          </Badge>
                        )}
                        {c.type === "DRIP" && (
                          <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />循序解鎖</Badge>
                        )}
                        <Badge variant="outline">{LEVEL_LABEL[c.level]}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <code className="text-xs">{c.slug}</code>
                        <span>{c.lesson_count} 支影片</span>
                        {c.duration_seconds > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDurationLong(c.duration_seconds)}
                          </span>
                        )}
                        {c.lesson_count === 0 && (
                          <span className="text-warning">尚無影片，學生按不下去</span>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" className="shrink-0"
                      onClick={() => navigate(`/admin/courses/${c.id}/edit`)}>
                      <Pencil className="mr-2 h-4 w-4" />編輯
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <BunnyConfigCard />
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增課程</DialogTitle>
            <DialogDescription>
              先建起來再加影片。新課一律是草稿，學生看不到。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-title">課名</Label>
              <Input id="c-title" value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="例：英文文法完全攻略" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-slug">代號（網址用）</Label>
              <Input id="c-slug" value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder={slugify(draft.title) || "grammar-complete"} />
              <p className="text-xs text-muted-foreground">
                留空會從課名自動產生。只能用小寫英數與連字號。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>型態</Label>
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">週次課（全部開著）</SelectItem>
                    <SelectItem value="DRIP">循序解鎖</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>開放方式</Label>
                <Select value={draft.access} onValueChange={(v) => setDraft({ ...draft, access: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ENROLLED">要選課</SelectItem>
                    <SelectItem value="FREE">免費（不必選課）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              🛑「免費」不等於公開——沒有「影片課程」這個功能的人一樣看不到。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>取消</Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BunnyConfigCard() {
  const { config, error, save } = useCourseConfig();
  const [libraryId, setLibraryId] = useState("");
  const [saving, setSaving] = useState(false);

  if (!config) return null;

  const submit = async () => {
    setSaving(true);
    const ok = await save(libraryId.trim() || null, null, null);
    setSaving(false);
    toast[ok ? "success" : "error"](ok ? "設定已更新" : "更新失敗");
    if (ok) setLibraryId("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bunny 設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Video Library ID</span>
          {config.bunny_library_id ? (
            <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
              <CheckCircle2 className="mr-1 h-3 w-3" />{config.bunny_library_id}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-warning/10 text-warning">尚未設定</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Vault 的 BUNNY_TOKEN_AUTH_KEY</span>
          {config.vault_key_present ? (
            <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
              <CheckCircle2 className="mr-1 h-3 w-3" />讀得到
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-warning/10 text-warning">讀不到</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Label htmlFor="lib">改 Library ID</Label>
            <Input id="lib" value={libraryId} onChange={(e) => setLibraryId(e.target.value)}
              placeholder={config.bunny_library_id ?? "例：123456"} />
          </div>
          <Button variant="outline" onClick={submit} disabled={saving || !libraryId.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}儲存
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          🛑 金鑰不在這裡改，也不會顯示在這一頁。它在 Supabase 的 Vault，名稱
          <code className="mx-1">BUNNY_TOKEN_AUTH_KEY</code>。
          金鑰讀不到時 Bunny 的影片會【報錯】，不會退回沒有保護的播放。
        </p>
      </CardContent>
    </Card>
  );
}
