import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDuration, sectionLabel } from "@/lib/learn/course/format";
import type { AdminLesson, AdminSection } from "@/hooks/learn/useCourseAdmin";
import type { CourseType, VideoProvider } from "@/lib/learn/course/types";

/**
 * 大綱編輯器。章節與影片的順序就是畫面上的順序，存檔時後端照陣列重排。
 *
 * 🛑 已經有人看完的影片，「移除」是停用的，不是按下去才失敗。
 *    learn_lesson_progress 是 ON DELETE CASCADE——刪掉它會一起刪掉那些人的
 *    完成紀錄，而循序課的下一個單元會在他們眼前重新鎖上。後端會擋，
 *    但讓管理員按得下去再跳錯誤，是把一個已知的結果做成意外。
 *
 * 沒有拖曳排序。上下箭頭夠用，而且不用為了它多裝一個套件。
 */

const emptyLesson = (): AdminLesson => ({
  title: "", description: "", provider: "YOUTUBE",
  video_id: "", duration_seconds: 0, is_preview: false,
});

interface Props {
  courseType: CourseType;
  sections: AdminSection[];
  onChange: (sections: AdminSection[]) => void;
}

export function CourseOutlineEditor({ courseType, sections, onChange }: Props) {
  const patch = (i: number, next: Partial<AdminSection>) =>
    onChange(sections.map((s, idx) => (idx === i ? { ...s, ...next } : s)));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  const patchLesson = (si: number, li: number, next: Partial<AdminLesson>) =>
    patch(si, {
      lessons: sections[si].lessons.map((l, idx) => (idx === li ? { ...l, ...next } : l)),
    });

  const moveLesson = (si: number, from: number, to: number) => {
    const ls = sections[si].lessons;
    if (to < 0 || to >= ls.length) return;
    const next = [...ls];
    [next[from], next[to]] = [next[to], next[from]];
    patch(si, { lessons: next });
  };

  return (
    <div className="space-y-4">
      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground">
          <p>還沒有章節</p>
          <p className="mt-1 text-sm">先加一個章節，再往裡面放影片</p>
        </div>
      )}

      {sections.map((section, si) => (
        <Card key={section.id ?? `new-${si}`} className="border-border">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1 space-y-2">
                <Label>{sectionLabel(courseType, si + 1)}</Label>
                <Input
                  value={section.title}
                  onChange={(e) => patch(si, { title: e.target.value })}
                  placeholder="章節標題"
                />
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" onClick={() => move(si, si - 1)}
                  disabled={si === 0} aria-label="往上移">
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => move(si, si + 1)}
                  disabled={si === sections.length - 1} aria-label="往下移">
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="icon" aria-label="刪除章節"
                  disabled={section.lessons.some((l) => (l.completed_by ?? 0) > 0)}
                  onClick={() => onChange(sections.filter((_, idx) => idx !== si))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Input
              value={section.description}
              onChange={(e) => patch(si, { description: e.target.value })}
              placeholder="章節說明（可留空）"
            />

            <div className="space-y-3">
              {section.lessons.map((lesson, li) => {
                const watched = lesson.completed_by ?? 0;
                return (
                  <div key={lesson.id ?? `new-${li}`}
                    className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shrink-0 text-sm text-muted-foreground">{li + 1}.</span>
                      <Input
                        className="min-w-[10rem] flex-1"
                        value={lesson.title}
                        onChange={(e) => patchLesson(si, li, { title: e.target.value })}
                        placeholder="影片標題"
                      />
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => moveLesson(si, li, li - 1)}
                          disabled={li === 0} aria-label="往上移">
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => moveLesson(si, li, li + 1)}
                          disabled={li === section.lessons.length - 1} aria-label="往下移">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" aria-label="移除影片"
                          disabled={watched > 0}
                          onClick={() => patch(si, {
                            lessons: section.lessons.filter((_, idx) => idx !== li),
                          })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_7rem]">
                      <Select
                        value={lesson.provider}
                        onValueChange={(v) => patchLesson(si, li, { provider: v as VideoProvider })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="YOUTUBE">YouTube</SelectItem>
                          <SelectItem value="BUNNY">Bunny</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={lesson.video_id}
                        onChange={(e) => patchLesson(si, li, { video_id: e.target.value })}
                        placeholder={lesson.provider === "BUNNY"
                          ? "Bunny 的 Video GUID"
                          : "YouTube 的 11 碼影片 ID"}
                      />
                      <Input
                        type="number" min={0}
                        value={lesson.duration_seconds || ""}
                        onChange={(e) => patchLesson(si, li, {
                          duration_seconds: Math.max(0, Number(e.target.value) || 0),
                        })}
                        placeholder="秒數"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`preview-${si}-${li}`}
                          checked={lesson.is_preview}
                          onCheckedChange={(v) => patchLesson(si, li, { is_preview: v })}
                        />
                        <Label htmlFor={`preview-${si}-${li}`} className="text-sm font-normal">
                          試看（沒選課也能播）
                        </Label>
                      </div>
                      {lesson.duration_seconds > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          = {formatDuration(lesson.duration_seconds)}
                        </span>
                      ) : (
                        // 🛑 長度是 0 的話，觀看門檻（長度 × 90%）也是 0——
                        //    那支影片永遠不會被判定完成。要看得出來。
                        <Badge variant="outline" className="gap-1 bg-warning/10 text-warning">
                          <AlertTriangle className="h-3 w-3" />長度未填
                        </Badge>
                      )}
                      {watched > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Users className="h-3 w-3" />{watched} 人已看完
                        </Badge>
                      )}
                    </div>

                    {watched > 0 && (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        已經有人看完，所以不能移除 —— 刪掉會一起刪掉他們的完成紀錄，
                        循序課的下一個單元也會在他們眼前重新鎖上。
                      </p>
                    )}
                  </div>
                );
              })}

              <Button variant="outline" size="sm"
                onClick={() => patch(si, { lessons: [...section.lessons, emptyLesson()] })}>
                <Plus className="mr-2 h-4 w-4" />加一支影片
              </Button>

              {section.lessons.some((l) => l.duration_seconds === 0) && (
                <p className="text-xs text-muted-foreground">
                  秒數留空也沒關係——用「用學生的畫面看」把那幾支點開，
                  播放器會把真正的長度讀回來自動填上。
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline"
        onClick={() => onChange([...sections, { title: "", description: "", lessons: [] }])}>
        <Plus className="mr-2 h-4 w-4" />
        加一個{courseType === "DRIP" ? "單元" : "章節"}
      </Button>
    </div>
  );
}
