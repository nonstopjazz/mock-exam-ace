import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, BookOpen, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useLearningPackList } from "@/hooks/learn/useLearningPacks";
import {
  STATUS_LABEL, type LearningPack, type PackListRow, type PackStatus,
} from "@/lib/learn/learningPacks";

/**
 * 主題學習包（管理端）清單。
 *
 * 🛑 發布就緒的問題【在清單就講】，不是等按下發布才說。
 *    老師通常是一次做好幾包，等到要發布的那一刻才被擋下來，
 *    就得逐包回頭想「這個是缺什麼」。
 */

const STATUS_STYLE: Record<PackStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-secondary/10 text-secondary border-secondary/20",
  ARCHIVED: "bg-muted text-muted-foreground line-through",
};

/** slug 的規則與資料表的 CHECK 一致，先在前端講清楚 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

function PackRow({ pack }: { pack: PackListRow }) {
  return (
    <Link
      to={`/admin/learning-packs/${pack.id}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground truncate">{pack.title}</p>
            <Badge variant="outline" className={`text-[10px] font-normal ${STATUS_STYLE[pack.status]}`}>
              {STATUS_LABEL[pack.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            {pack.summary || "（還沒有簡介）"}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {pack.unit_count} 個單元
            {pack.grade ? ` · ${pack.grade}` : ""}
            {pack.textbook_version ? ` · ${pack.textbook_version}` : " · 共通能力練習"}
            {` · /${pack.slug}`}
          </p>
        </div>
      </div>

      {/* 還不能發布的原因。已發布的包不顯示 —— 它已經過了檢查 */}
      {pack.status !== "PUBLISHED" && pack.problems.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t pt-3">
          {pack.problems.map((p, i) => (
            <li key={`${p.code}-${p.unit_id ?? i}`} className="text-xs text-muted-foreground flex gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px text-accent" aria-hidden="true" />
              <span>{p.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  );
}

export default function LearningPacksAdmin() {
  const navigate = useNavigate();
  const { packs, loading, error, reload } = useLearningPackList();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const slugValid = SLUG_RE.test(slug);

  const onCreate = async () => {
    setCreating(true);
    setCreateError(null);
    const { data, error: rpcError } = await supabase.rpc("learning_pack_admin_upsert", {
      p_title: title.trim(),
      p_slug: slug.trim(),
    });
    setCreating(false);
    if (rpcError) { setCreateError(rpcError.message); return; }
    const created = data as unknown as LearningPack;
    toast.success(`已建立「${created.title}」`);
    setOpen(false);
    setTitle("");
    setSlug("");
    void reload();
    navigate(`/admin/learning-packs/${created.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminPageHeader
          icon={BookOpen}
          title="主題學習包"
          subtitle="把閱讀與單字組成一條有順序的學習路徑"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              新增學習包
            </Button>
          }
        />

        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>讀取學習包失敗：{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading && !packs ? (
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">載入學習包</p>
            </div>
          </Card>
        ) : !packs || packs.length === 0 ? (
          <Card className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>還沒有學習包</p>
              <p className="text-sm mt-2">
                學習包是把現有的
                <Link to="/admin/reading" className="px-1 underline underline-offset-4 hover:text-foreground">
                  閱讀文章
                </Link>
                與
                <Link to="/admin/packs" className="px-1 underline underline-offset-4 hover:text-foreground">
                  單字集
                </Link>
                排成一條路徑，不會另外複製一份教材。
              </p>
              <Button className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                建立第一個學習包
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {packs.map((p) => <PackRow key={p.id} pack={p} />)}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增學習包</DialogTitle>
            <DialogDescription>
              先取個名字就好，其他的進去再填。建立出來是草稿，學生看不到。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pack-title">名稱</Label>
              <Input
                id="pack-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：高一上 第一次段考 複習包"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-slug">網址代號</Label>
              <Input
                id="pack-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="g1-midterm-1"
                aria-describedby="pack-slug-help"
              />
              <p id="pack-slug-help" className="text-xs text-muted-foreground">
                只能用小寫英文、數字與連字號，2–63 個字，之後會出現在網址上。
                {slug && !slugValid ? (
                  <span className="text-destructive"> 目前這個不符合規則。</span>
                ) : null}
              </p>
            </div>

            {createError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button onClick={onCreate} disabled={creating || !title.trim() || !slugValid}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
