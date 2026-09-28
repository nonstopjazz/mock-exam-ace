import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BookOpen, CheckCircle2, Clock, Loader2, Lock, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { LessonPlayer } from "@/components/learn/course/LessonPlayer";
import { useCourseDetail, useLessonPlayback } from "@/hooks/learn/useCourses";
import {
  countLessons, formatDuration, formatDurationLong, LEVEL_LABEL,
  nextLesson, progressPercent, sectionLabel,
} from "@/lib/learn/course/format";
import type { CourseLesson } from "@/lib/learn/course/types";

/**
 * 週次課的內頁。
 *
 * 版面沿用原本的樣板，但把播放器與大綱的欄寬對調：原本播放器在 1/3 的
 * 窄欄，那是因為它只是一個寫著「影片播放器」的灰方塊。現在它真的會播片，
 * 一個 16:9 的影片擠在 1/3 欄看不清楚。
 */

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { detail, loading, error, reload } = useCourseDetail(courseId);
  const playback = useLessonPlayback();
  const [currentId, setCurrentId] = useState<string | null>(null);

  // 🛑 useMemo，不是 `detail?.sections ?? []`。後者每次 render 都是一個新陣列，
  //    底下每一個以它為依賴的 useMemo 就全部失效了。
  const sections = useMemo(() => detail?.sections ?? [], [detail]);
  const counts = useMemo(() => countLessons(sections), [sections]);
  const pct = progressPercent(counts.done, counts.total);
  const totalSeconds = useMemo(
    () => sections.reduce((s, sec) => s + sec.lessons.reduce((t, l) => t + l.duration_seconds, 0), 0),
    [sections],
  );

  const currentLesson: CourseLesson | undefined = useMemo(() => {
    for (const s of sections) for (const l of s.lessons) if (l.id === currentId) return l;
    return undefined;
  }, [sections, currentId]);

  const openLesson = useCallback(async (lessonId: string) => {
    setCurrentId(lessonId);
    await playback.open(lessonId);
  }, [playback]);

  // 一進來就打開「第一支沒看完而且沒鎖住的」
  useEffect(() => {
    if (!detail || currentId) return;
    const next = nextLesson(detail.sections);
    const fallback = detail.sections.find((s) => !s.locked)?.lessons[0]?.id;
    const target = next?.lessonId ?? fallback;
    if (target) void openLesson(target);
  }, [detail, currentId, openLesson]);


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
            <ArrowLeft className="mr-2 h-4 w-4" />
            回課程列表
          </Button>
        </div>
      </div>
    );
  }

  const course = detail.course;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-6 px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/courses")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          回課程列表
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{LEVEL_LABEL[course.level]}</Badge>
              {course.access === "FREE" && (
                <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                  免費
                </Badge>
              )}
              {course.status === "DRAFT" && <Badge variant="outline">草稿（僅管理員看得到）</Badge>}
            </div>
            <h1 className="text-2xl font-bold text-foreground md:text-4xl">{course.title}</h1>
            {course.description && (
              <p className="mt-2 text-sm text-muted-foreground md:text-base">{course.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {course.instructor && <span>{course.instructor}</span>}
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" />{counts.total} 支影片
              </span>
              {totalSeconds > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />{formatDurationLong(totalSeconds)}
                </span>
              )}
            </div>
          </div>

          {counts.total > 0 && (
            <Card className="w-full border-primary/20 bg-gradient-to-br from-primary/10 to-accent/10 md:w-64">
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">學習進度</span>
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 播放器佔兩欄。影片是這一頁的主角。 */}
          <div className="lg:col-span-2">
            <Card className="border-border">
              <CardContent className="pt-6">
                <LessonPlayer
                  playback={playback.playback}
                  loading={playback.loading}
                  error={playback.error}
                  completed={currentLesson?.completed ?? false}

                  onCompleted={() => { void reload(); }}
                  onRefresh={() => { if (currentId) void playback.open(currentId); }}
                />
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg">課程大綱</CardTitle>
              </CardHeader>
              <CardContent>
                {sections.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <p>這門課還沒有上架影片</p>
                  </div>
                ) : (
                  <Accordion
                    type="multiple"
                    defaultValue={sections.filter((s) => !s.locked).map((s) => s.id)}
                  >
                    {sections.map((section) => (
                      <AccordionItem key={section.id} value={section.id}>
                        <AccordionTrigger className="text-left">
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {sectionLabel(course.type, section.position)}
                              </span>
                              {section.locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                            <div className="truncate font-semibold text-foreground">
                              {section.title}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-1">
                            {section.lessons.map((lesson) => {
                              const locked = section.locked && !lesson.is_preview;
                              const active = lesson.id === currentId;
                              return (
                                <button
                                  key={lesson.id}
                                  type="button"
                                  disabled={locked}
                                  onClick={() => void openLesson(lesson.id)}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors
                                    ${locked ? "cursor-not-allowed opacity-50" : "hover:bg-muted"}
                                    ${active ? "bg-muted font-medium" : ""}`}
                                >
                                  {locked ? (
                                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : lesson.completed ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                  ) : (
                                    <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-foreground">
                                    {lesson.title}
                                  </span>
                                  {lesson.is_preview && (
                                    <Badge variant="outline" className="shrink-0 text-xs">試看</Badge>
                                  )}
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {formatDuration(lesson.duration_seconds)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
