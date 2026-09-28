import { Award, BookOpen, Clock, Lock, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { supabase } from "@/lib/supabase";
import {
  formatDurationLong, LEVEL_BADGE, LEVEL_LABEL, progressPercent,
} from "@/lib/learn/course/format";
import type { CourseSummary } from "@/lib/learn/course/types";

/**
 * 課程卡。原本這段 markup 在 VideoCourses 的四個分頁裡各抄了一份，
 * 改一個 badge 要改四個地方——而且它們已經漂開了（「已完成」那份
 * 沒有講師也沒有時長）。抽出來之後四個分頁看起來才真的是同一種東西。
 */

/** 🛑 這個 bucket 要自己在 Supabase 建，而且要設成 public。沒建的話
 *     封面就是不顯示——不會壞掉，只會退回底下那張漸層底圖。 */
const COVER_BUCKET = "course-covers";

function coverUrl(path: string | null): string | null {
  if (!path) return null;
  // 已經是完整網址就直接用（方便先用外部圖片試版）
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl ?? null;
}

interface CourseCardProps {
  course: CourseSummary;
  onOpen: (course: CourseSummary) => void;
}

export function CourseCard({ course, onOpen }: CourseCardProps) {
  const pct = progressPercent(course.completed_count, course.lesson_count);
  const cover = coverUrl(course.cover_path);
  const done = pct === 100;
  const empty = course.lesson_count === 0;

  return (
    <Card className="group overflow-hidden border-border transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <AspectRatio ratio={16 / 9} className="bg-muted">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          // 沒有封面時的底圖。用站上既有的 /10 色調，不是灰方塊。
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
            <BookOpen className="h-10 w-10 text-primary/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        <div className="absolute right-3 top-3 flex gap-2">
          {course.status === "DRAFT" && (
            <Badge variant="outline" className="bg-background/90">草稿</Badge>
          )}
          {course.access === "FREE" && (
            <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
              免費
            </Badge>
          )}
          <Badge className={LEVEL_BADGE[course.level]}>{LEVEL_LABEL[course.level]}</Badge>
        </div>

        {done && (
          <div className="absolute left-3 top-3 rounded-full bg-success p-2">
            <Award className="h-4 w-4 text-success-foreground" />
          </div>
        )}

        {course.duration_seconds > 0 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-sm text-white">
            <Clock className="h-4 w-4" />
            <span>{formatDurationLong(course.duration_seconds)}</span>
          </div>
        )}

        {course.type === "DRIP" && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-sm text-white">
            <Lock className="h-3.5 w-3.5" />
            <span>循序解鎖</span>
          </div>
        )}
      </AspectRatio>

      <CardHeader>
        <CardTitle className="line-clamp-2 text-lg text-foreground">{course.title}</CardTitle>
        {course.description && (
          <CardDescription className="line-clamp-2">{course.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="min-w-0 truncate">{course.instructor || "—"}</span>
          <span className="shrink-0">
            {empty ? "尚無影片" : `${course.completed_count} / ${course.lesson_count} 支`}
          </span>
        </div>

        {/* 🛑 一支影片都沒有就不畫進度條。0/0 沒有意義，
            而畫一條空的會讓人以為是「還沒開始」。 */}
        {!empty && pct > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">進度</span>
              <span className="font-medium text-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        )}

        <Button
          className="w-full"
          variant={done ? "outline" : "default"}
          disabled={empty}
          onClick={() => onOpen(course)}
        >
          <Play className="mr-2 h-4 w-4" />
          {empty ? "尚未上架影片" : done ? "重新觀看" : pct > 0 ? "繼續學習" : "開始學習"}
        </Button>
      </CardContent>
    </Card>
  );
}
