import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CourseOutlineEditor } from "@/components/learn/course/CourseOutlineEditor";
import {
  saveCourse, saveOutline, useAdminCourse, useCourseAccess,
  type AdminCourse, type AdminSection,
} from "@/hooks/learn/useCourseAdmin";
import type { CourseType } from "@/lib/learn/course/types";

/**
 * 課程編輯。
 *
 * 原本這一頁有 543 行、完全是假資料，而且【沒有任何路由指向它】——
 * 是死碼。現在它是真的編輯器。
 */

export default function CourseEdit() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { course, sections, setSections, loading, error, reload } = useAdminCourse(courseId);
  const [form, setForm] = useState<AdminCourse | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingOutline, setSavingOutline] = useState(false);
  const [outlineError, setOutlineError] = useState<string | null>(null);

  useEffect(() => { setForm(course); }, [course]);

  const patch = (next: Partial<AdminCourse>) =>
    setForm((f) => (f ? { ...f, ...next } : f));

  const submitMeta = async () => {
    if (!form) return;
    setSavingMeta(true);
    const result = await saveCourse(form);
    setSavingMeta(false);
    if (!result.ok) { toast.error(result.message); return; }
    toast.success("已儲存");
    await reload();
  };

  const submitOutline = async () => {
    if (!courseId) return;
    setSavingOutline(true);
    setOutlineError(null);
    const result = await saveOutline(courseId, sections);
    setSavingOutline(false);
    if (!result.ok) {
      // 🛑 後端的訊息原封不動顯示——它說明了是哪一支影片、影響幾個人
      setOutlineError(result.message);
      toast.error("大綱沒有存檔");
      return;
    }
    toast.success("大綱已儲存");
    await reload();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>{error ?? "找不到這門課"}</AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/courses")}>
            <ArrowLeft className="mr-2 h-4 w-4" />回課程管理
          </Button>
        </div>
      </div>
    );
  }

  const studentPath = form.type === "DRIP" ? `/drip-course/${form.id}` : `/course/${form.id}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/courses")}>
            <ArrowLeft className="mr-2 h-4 w-4" />回課程管理
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(studentPath)}>
            <ExternalLink className="mr-2 h-4 w-4" />用學生的畫面看
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">{form.title}</h1>
          <Badge variant="outline">{form.status === "PUBLISHED" ? "已發布" :
            form.status === "ARCHIVED" ? "已下架" : "草稿"}</Badge>
        </div>

        <Tabs defaultValue="outline">
          <TabsList className="bg-muted">
            <TabsTrigger value="outline">大綱</TabsTrigger>
            <TabsTrigger value="meta">課程資訊</TabsTrigger>
            <TabsTrigger value="access">開放給誰</TabsTrigger>
          </TabsList>

          <TabsContent value="outline" className="mt-6 space-y-4">
            {outlineError && (
              <Alert variant="destructive"><AlertDescription>{outlineError}</AlertDescription></Alert>
            )}
            <CourseOutlineEditor
              courseType={form.type as CourseType}
              sections={sections}
              onChange={(s: AdminSection[]) => { setSections(s); setOutlineError(null); }}
            />
            <div className="sticky bottom-4 flex justify-end">
              <Button onClick={submitOutline} disabled={savingOutline} size="lg" className="shadow-lg">
                {savingOutline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Save className="mr-2 h-4 w-4" />}
                儲存大綱
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="meta" className="mt-6">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">課名</Label>
                    <Input id="title" value={form.title}
                      onChange={(e) => patch({ title: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">代號</Label>
                    <Input id="slug" value={form.slug}
                      onChange={(e) => patch({ slug: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desc">說明</Label>
                  <Textarea id="desc" rows={3} value={form.description}
                    onChange={(e) => patch({ description: e.target.value })} />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="instructor">講師</Label>
                    <Input id="instructor" value={form.instructor}
                      onChange={(e) => patch({ instructor: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">分類</Label>
                    <Input id="category" value={form.category}
                      onChange={(e) => patch({ category: e.target.value })}
                      placeholder="例：文法" />
                  </div>
                  <div className="space-y-2">
                    <Label>難度</Label>
                    <Select value={form.level} onValueChange={(v) => patch({ level: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BEGINNER">初級</SelectItem>
                        <SelectItem value="INTERMEDIATE">中級</SelectItem>
                        <SelectItem value="ADVANCED">高級</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>型態</Label>
                    <Select value={form.type} onValueChange={(v) => patch({ type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD">週次課</SelectItem>
                        <SelectItem value="DRIP">循序解鎖</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>開放方式</Label>
                    <Select value={form.access} onValueChange={(v) => patch({ access: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ENROLLED">要選課</SelectItem>
                        <SelectItem value="FREE">免費</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cover">封面（storage path）</Label>
                    <Input id="cover" value={form.cover_path ?? ""}
                      onChange={(e) => patch({ cover_path: e.target.value || null })}
                      placeholder="course-covers 裡的檔名" />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div className="pr-4">
                    <p className="font-semibold text-foreground">必須看完才算完成</p>
                    <p className="text-sm text-muted-foreground">
                      打開之後學生看不到「標記為完成」，只有實際看到 90% 才算。
                      循序課要「真的看完才解鎖」就開這個。
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      🛑 進度是學生的瀏覽器回報的。它擋得住懶得看的人，
                      擋不住決心要繞過的人——不要當成考試監控。
                    </p>
                  </div>
                  <Switch
                    checked={form.require_watch}
                    onCheckedChange={(v) => patch({ require_watch: v })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-semibold text-foreground">對學生發布</p>
                    <p className="text-sm text-muted-foreground">
                      關掉是草稿，只有管理員看得到。建議每支影片都點過一遍再打開。
                    </p>
                  </div>
                  <Switch
                    checked={form.status === "PUBLISHED"}
                    onCheckedChange={(v) => patch({ status: v ? "PUBLISHED" : "DRAFT" })}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={submitMeta} disabled={savingMeta}>
                    {savingMeta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Save className="mr-2 h-4 w-4" />}
                    儲存
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access" className="mt-6">
            <AccessPanel courseId={courseId} courseAccess={form.access} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AccessPanel({ courseId, courseAccess }: { courseId?: string; courseAccess: string }) {
  const { state, error, set } = useCourseAccess(courseId);

  if (!state) {
    return <Card><CardContent className="flex justify-center py-10">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">開放給誰</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {courseAccess === "FREE" ? (
          <Alert>
            <AlertDescription>
              這門課設成「免費」，所以<strong>有「影片課程」功能的人都看得到</strong>，
              底下的選課設定不影響他們。改回「要選課」才會用到。
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">選了這門課的人：</span>
            <span className="font-semibold text-foreground">{state.reach}</span>
          </div>
        )}

        {/* 🛑 這一行不能省。兩道閘都要過，只開一邊學生還是看不到，
            而後台會顯示「已開放」——那是最難查的那種問題。 */}
        <Alert>
          <AlertDescription className="text-sm">
            🛑 選課只是第二道閘。學生還要被開放「影片課程」這個功能才看得到，
            兩道都要過。
            <Button variant="link" className="h-auto p-0 pl-1 text-sm" asChild>
              <Link to="/admin/feature-access">設定開放對象</Link>
            </Button>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <p className="font-semibold text-foreground">班級</p>
          {state.classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">目前沒有啟用中的班級</p>
          ) : state.classes.map((c) => (
            <div key={c.class_id}
              className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.member_count} 人在籍</p>
              </div>
              <Switch
                checked={!!c.granted}
                onCheckedChange={(v) => void set({ classId: c.class_id }, v)}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-foreground">個別開放</p>
          {state.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              目前沒有個別開放的學生。插班或試用的人可以從這裡加，
              不過現在還要從資料庫加——這一版先只做得到收回。
            </p>
          ) : state.students.map((s) => (
            <div key={s.student_id}
              className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="truncate font-medium text-foreground">{s.name}</p>
              <Button variant="outline" size="sm"
                onClick={() => void set({ studentId: s.student_id }, false)}>
                收回
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
