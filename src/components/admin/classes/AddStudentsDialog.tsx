import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { StudentSearchResult } from "@/lib/learn/tasks";

/**
 * 把既有帳號加進班級名冊。
 *
 * 🛑 刻意【沒有】「列出全部使用者」這個選項。這個系統沒有 role 欄位，
 *    auth.users 裡混著考試 / 單字 / 試用帳號，整包列出來既沒有意義，
 *    也是不必要的資料暴露。必須先搜尋（至少 2 個字元）。
 *
 * 「學生」的定義就是「在某個班的名冊上」——名冊本身就是那個標記。
 */
export const AddStudentsDialog = ({
  open,
  onOpenChange,
  search,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  search: (q: string) => Promise<StudentSearchResult[]>;
  onAdd: (ids: string[]) => Promise<{ ok: boolean } | { ok: false; error: string }>;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setPicked(new Set());
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      setResults(await search(q));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (picked.size === 0) return;
    setSaving(true);
    const r = await onAdd([...picked]);
    setSaving(false);
    if (!r.ok) {
      toast.error(`加入失敗：${"error" in r ? r.error : ""}`);
      return;
    }
    toast.success(`已加入 ${picked.size} 位學生`);
    onOpenChange(false);
  };

  const q = query.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>加入學生</DialogTitle>
          <DialogDescription>
            用 email 或姓名搜尋既有帳號。學生必須先註冊過才能加入班級。
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="輸入 email 或姓名（至少 2 個字）"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-72 overflow-y-auto -mx-1 px-1">
          {q.length < 2 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p className="text-sm">請先輸入至少 2 個字</p>
              <p className="text-xs mt-2">為了保護使用者資料，這裡不提供完整的帳號清單</p>
            </div>
          ) : searching ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p className="text-sm">找不到符合的帳號</p>
              <p className="text-xs mt-2">確認學生已經註冊，並用註冊的 email 搜尋</p>
            </div>
          ) : (
            results.map((s) => (
              <label
                key={s.student_id}
                className={`flex items-center gap-3 py-2.5 px-1 rounded-md border-b border-border/60 last:border-0 ${
                  s.already_member ? "opacity-50" : "cursor-pointer hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  checked={picked.has(s.student_id)}
                  disabled={s.already_member}
                  onCheckedChange={() => toggle(s.student_id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{s.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.email}
                    {s.grade ? ` · ${s.grade}` : ""}
                  </p>
                </div>
                {s.already_member ? (
                  <Badge variant="outline" className="text-xs shrink-0 font-normal">
                    已在班上
                  </Badge>
                ) : null}
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving || picked.size === 0}>
            {saving ? "加入中…" : `加入 ${picked.size > 0 ? picked.size + " 位" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
