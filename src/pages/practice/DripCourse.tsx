import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Award, CheckCircle2, Clock, Loader2, Lock, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { LessonPlayer } from "@/components/learn/course/LessonPlayer";
import { reportLessonProgress, useCourseDetail, useLessonPlayback } from "@/hooks/learn/useCourses";
import {
  countLessons, formatDuration, nextLesson, progressPercent, sectionLabel,
} from "@/lib/learn/course/format";
import type { CourseLesson, CourseSection } from "@/lib/learn/course/types";

/**
 * 循序解鎖課：前一個單元全部看完，下一個才開。
 *
 * 🛑 locked 一律用後端給的，前端不自己算。播放那支 RPC 用同一套規則
 *    再驗一次，所以只要這裡自作聰明，畫面和實際行為就會對不起來。
 */

export default function DripCourse() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { detail, loading, error, reload } = useCourseDetail(courseId);
  const playback = useLessonPlayback();
  const [unitIndex, setUnitIndex] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // 🛑 useMemo，不是 `detail?.sections ?? []`。後者每次 render 都是一個新陣列，
  //    底下每一個以它為依賴的 useMemo 就全部失效了。
  const sections = useMemo(() => detail?.sections ?? [], [detail]);
  const counts = useMemo(() => countLessons(sections), [sections]);
  const pct = progressPercent(counts.done, counts.total);
  const unit: CourseSection | undefined = sections[unitIndex];

  const currentLesson: CourseLesson | undefined = useMemo(
    () => unit?.lessons.find((l) => l.id === currentId),
    [unit, currentId],
  );

  const openLesson = useCallback(async (lessonId: string) => {
    setCurrentId(lessonId);
    await playback.open(lessonId);
  }, [playback]);

  // 開頁時停在「該上的那一個單元」，不是永遠第一個
  useEffect(() => {
    if (!detail) return;
    const next = nextLesson(detail.sections);
    if (!next) return;
    const idx = detail.sections.findIndex((s) => s.id === next.sectionId);
    if (idx >= 0) setUnitIndex(idx);
  }, [detail]);

  // 換單元就自動選該單元第一支可播的
  useEffect(() => {
    if (!unit || unit.locked) { setCurrentId(null); playback.close(); return; }
    if (currentId && unit.lessons.some((l) => l.id === currentId)) return;
    const first = unit.lessons.find((l) => !l.completed) ?? unit.lessons[0];
    if (first) void openLesson(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id, unit?.locked]);

  const markComplete = async () => {
    if (!currentId) return;
    setCompleting(true);
    const ok = await reportLessonProgress(currentId, null, true);
    setCompleting(false);
    if (!ok) { toast.error("標記失敗，請再試一次"); return; }
    toast.success("已標記為完成");
    // 解鎖是後端算的，所以一定要重新取大綱
    await reload();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>{error ?? "找不到這門課"}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => navigate("/courses")} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />回課程列表
          </Button>
        </div>
      </div>
    );
  }

  const course = detail.course;
  const unitDone = unit ? unit.lessons.every((l) => l.completed) && unit.lessons.length > 0 : false;
  const nextUnlocked = sections[unitIndex + 1] && !sections[unitIndex + 1].locked;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-6 px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/courses")}>
          <ArrowLeft className="mr-2 h-4 w-4" />回課程列表
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Badge variant="outline" className="mb-2">
              <Lock className="mr-1 h-3 w-3" />循序解鎖
            </Badge>
            <h1 className="text-2xl font-bold text-foreground md:text-4xl">{course.title}</h1>
            {course.description && (
              <p className="mt-2 text-sm text-muted-foreground md:text-base">{course.description}</p>
            )}
          </div>
          {counts.total > 0 && (
            <Card className="w-full border-secondary/20 bg-gradient-to-br from-secondary/10 to-explorer/10 md:w-64">
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">整體進度</span>
                  <span className="text-2xl font-bold text-foreground">{pct}%</span>
                </div>
                <Progress value={pct} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {counts.done} / {counts.total} 支已完成
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {sections.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>這門課還沒有上架影片</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 單元列。鎖住的按不下去，而且看得出來為什麼。 */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {sections.map((s, i) => {
                const done = s.lessons.length > 0 && s.lessons.every((l) => l.completed);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={s.locked}
                    onClick={() => setUnitIndex(i)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-all
                      ${i === unitIndex ? "border-primary bg-primary/10 font-semibold" : "border-border"}
                      ${s.locked ? "cursor-not-allowed opacity-50" : "hover:shadow-sm"}`}
                  >
                    {s.locked ? <Lock className="h-4 w-4" />
                      : done ? <CheckCircle2 className="h-4 w-4 text-success" />
                      : <Play className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-foreground">{sectionLabel("DRIP", s.position)}</span>
                  </button>
                );
              })}
            </div>

            {unit?.locked ? (
              <Card className="border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Lock className="mx-auto mb-3 h-12 w-12 opacity-40" />
                  <p>這個單元還沒解鎖</p>
                  <p className="mt-2 text-sm">把前面單元的影片都看完，這裡就會自動開啟</p>
                </CardContent>
              </Card>
            ) : unit ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Card className="border-border">
                    <CardContent className="pt-6">
                      <LessonPlayer
                        playback={playback.playback}
                        loading={playback.loading}
                        error={playback.error}
                        completed={currentLesson?.completed ?? false}
                        completing={completing}
                        onComplete={markComplete}
                        onRefresh={() => { if (currentId) void playback.open(currentId); }}
                      />
                    </CardContent>
                  </Card>

                  {unitDone && (
                    <Card className="mt-4 border-success/20 bg-success/10">
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                        <div className="flex items-center gap-2">
                          <Award className="h-5 w-5 text-success" />
                          <span className="font-semibold text-foreground">
                            {sectionLabel("DRIP", unit.position)} 完成
                          </span>
                        </div>
                        {nextUnlocked ? (
                          <Button onClick={() => setUnitIndex(unitIndex + 1)}>
                            下一個單元<ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            這是最後一個單元，整門課都完成了
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-lg">{unit.title}</CardTitle>
                    {unit.description && (
                      <p className="text-sm text-muted-foreground">{unit.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {unit.lessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => void openLesson(lesson.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted
                          ${lesson.id === currentId ? "bg-muted font-medium" : ""}`}
                      >
                        {lesson.completed
                          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                          : <Play className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate text-foreground">{lesson.title}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(lesson.duration_seconds)}
                        </span>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
