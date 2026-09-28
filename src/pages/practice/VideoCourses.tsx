import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, CheckCircle, Clock, Filter, Loader2, Play, Search, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseCard } from "@/components/learn/course/CourseCard";
import { useCourses } from "@/hooks/learn/useCourses";
import { formatDurationLong, progressPercent, sortForStudent } from "@/lib/learn/course/format";
import type { CourseSummary } from "@/lib/learn/course/types";

/**
 * 課程清單。版面沿用原本的樣板（標題 + 四張統計卡 + 搜尋篩選 + 分頁 + 卡片格），
 * 但資料換成 learn_course_list()。
 *
 * 原本這頁的 6 門課是寫死在檔案裡的 mockCourses。
 */

const TABS = [
  { value: "all",         label: "全部課程" },
  { value: "in-progress", label: "進行中" },
  { value: "completed",   label: "已完成" },
  { value: "new",         label: "尚未開始" },
] as const;

export default function VideoCourses() {
  const navigate = useNavigate();
  const { courses, loading, error } = useCourses();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // 🛑 分類從資料來，不是寫死的清單。寫死的話，新增一個分類的課程
  //    會變成搜尋不到也篩不到，而且沒有任何錯誤。
  const categories = useMemo(() => {
    const set = new Set(courses.map((c) => c.category).filter((c) => c.trim().length > 0));
    return ["all", ...[...set].sort()];
  }, [courses]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortForStudent(courses.filter((c) => {
      const matchesSearch = q.length === 0
        || c.title.toLowerCase().includes(q)
        || c.description.toLowerCase().includes(q)
        || c.instructor.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === "all" || c.category === selectedCategory;
      return matchesSearch && matchesCategory;
    }));
  }, [courses, searchQuery, selectedCategory]);

  const stats = useMemo(() => {
    const pct = (c: CourseSummary) => progressPercent(c.completed_count, c.lesson_count);
    return {
      total: courses.length,
      inProgress: courses.filter((c) => pct(c) > 0 && pct(c) < 100).length,
      completed: courses.filter((c) => c.lesson_count > 0 && pct(c) === 100).length,
      seconds: courses.reduce((sum, c) => sum + c.duration_seconds, 0),
    };
  }, [courses]);

  const openCourse = (course: CourseSummary) => {
    navigate(course.type === "DRIP" ? `/drip-course/${course.id}` : `/course/${course.id}`);
  };

  const forTab = (tab: string) => {
    if (tab === "all") return filtered;
    const pct = (c: CourseSummary) => progressPercent(c.completed_count, c.lesson_count);
    if (tab === "in-progress") return filtered.filter((c) => pct(c) > 0 && pct(c) < 100);
    if (tab === "completed")   return filtered.filter((c) => c.lesson_count > 0 && pct(c) === 100);
    return filtered.filter((c) => pct(c) === 0);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-8 px-4 py-8">
        <div className="flex items-center gap-3">
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 md:p-3">
            <Play className="h-6 w-6 text-primary md:h-8 md:w-8" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-foreground md:text-4xl">影片課程</h1>
            <p className="hidden text-sm text-muted-foreground sm:block md:text-base">
              系統化的影音課程，照自己的步調上
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile icon={BookOpen}   tint="primary"   value={String(stats.total)}      label="總課程數" />
          <StatTile icon={TrendingUp} tint="warning"   value={String(stats.inProgress)} label="進行中" />
          <StatTile icon={CheckCircle} tint="success"  value={String(stats.completed)}  label="已完成" />
          {/* 原本這張用 bg-info/10 與 text-info——那兩個 token 沒有對應到
              tailwind.config.ts，所以一直是沒有底色的。換成 secondary。 */}
          <StatTile icon={Clock} tint="secondary"
            value={stats.seconds > 0 ? formatDurationLong(stats.seconds) : "—"} label="總時長" />
        </div>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜尋課程名稱、說明或講師…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              {categories.length > 1 && (
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <Button
                        key={category}
                        variant={selectedCategory === category ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedCategory(category)}
                      >
                        {category === "all" ? "全部" : category}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <Card className="border-border">
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : courses.length === 0 && !error ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-40" />
              <p>目前沒有開放給你的課程</p>
              <p className="mt-2 text-sm">課程開放之後會出現在這裡，可以先去做閱讀或單字練習</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="bg-muted">
              {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
            {TABS.map((t) => {
              const list = forTab(t.value);
              return (
                <TabsContent key={t.value} value={t.value} className="mt-6">
                  {list.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <p>這一類目前沒有課程</p>
                      {searchQuery.trim().length > 0 && (
                        <p className="mt-2 text-sm">試試清掉搜尋關鍵字</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {list.map((course) => (
                        <CourseCard key={course.id} course={course} onOpen={openCourse} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, tint, value, label }: {
  icon: typeof BookOpen; tint: "primary" | "warning" | "success" | "secondary";
  value: string; label: string;
}) {
  const tints = {
    primary:   "bg-primary/10 text-primary",
    warning:   "bg-warning/10 text-warning",
    success:   "bg-success/10 text-success",
    secondary: "bg-secondary/10 text-secondary",
  };
  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`shrink-0 rounded-lg p-2 ${tints[tint]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-2xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
