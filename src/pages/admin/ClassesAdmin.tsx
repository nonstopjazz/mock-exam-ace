import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, ChevronRight, GraduationCap, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { useAdminClasses } from "@/hooks/learn/useAdminClasses";
import { formatDate } from "@/lib/learn/tasks";

/**
 * /admin/classes —— 老師端的主入口。
 *
 * 一張卡就是一個班：人數、下次上課、待檢查的作業數。
 * 「待檢查」是這一頁唯一的待辦訊號，其他數字都是背景資訊。
 */
const ClassesAdmin = () => {
  const { classes, loading, error, createClass } = useAdminClasses(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("請輸入班級名稱");
      return;
    }
    setSaving(true);
    const r = await createClass(name.trim(), date || null);
    setSaving(false);
    if (!r.ok) {
      toast.error(`建立失敗：${r.error}`);
      return;
    }
    toast.success("班級已建立");
    setOpen(false);
    setName("");
    setDate("");
  };

  const active = classes.filter((c) => c.status === "ACTIVE");
  const archived = classes.filter((c) => c.status === "ARCHIVED");

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
              <GraduationCap className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">班級管理</h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                建立班級、管理名冊、指派作業與常態練習
              </p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">新增班級</span>
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-5 w-32 mb-3" />
                <Skeleton className="h-4 w-full" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>無法載入班級：{error}</AlertDescription>
          </Alert>
        ) : classes.length === 0 ? (
          <Card className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <p>尚未建立任何班級</p>
              <p className="text-sm mt-2">點擊「新增班級」開始，加入學生之後就能指派作業</p>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {active.map((c) => (
                <Link key={c.id} to={`/admin/classes/${c.id}`} className="group">
                  <Card className="p-6 h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h2 className="font-semibold text-foreground text-lg min-w-0 truncate">
                        {c.name}
                      </h2>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform group-hover:translate-x-1" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 shrink-0" />
                        {c.member_count} 位學生
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        {c.next_class_date ? formatDate(c.next_class_date) : "未排定上課日"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <Badge variant="outline" className="font-normal">
                        作業 {c.homework_count}
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        常態練習 {c.recurring_count}
                      </Badge>
                      {c.unchecked_count > 0 ? (
                        <Badge className="bg-warning/15 text-foreground border-warning/30 font-normal hover:bg-warning/15">
                          {c.unchecked_count} 項待檢查
                        </Badge>
                      ) : null}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>

            {archived.length > 0 ? (
              <section>
                <h2 className="font-semibold text-foreground mb-3">已封存</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {archived.map((c) => (
                    <Link key={c.id} to={`/admin/classes/${c.id}`}>
                      <Card className="p-6 h-full bg-muted/30">
                        <p className="font-medium text-muted-foreground truncate">{c.name}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {c.member_count} 位學生 · 已封存
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增班級</DialogTitle>
            <DialogDescription>
              一對一家教也是一個班，直接用學生的名字命名即可。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="class-name">班級名稱</Label>
              <Input
                id="class-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：週六 A 班 / Amy Chen 一對一"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class-date">下次上課日期（選填）</Label>
              <Input
                id="class-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                之後可以隨時修改。設定為「下次上課前」的作業會跟著這個日期走。
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "建立中…" : "建立班級"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassesAdmin;
