import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Eye, Pencil, Plus } from "lucide-react";
import {
  SKILL_LABEL, SKILL_ORDER, type SkillKey, type SkillRating, type Student,
} from "@/data/learn/teacherSessionMock";
import {
  WorkspaceSection, SegmentedPicker, StudentAvatar, RatingBadge,
} from "./shared";
import { ratingOptions } from "./pickerOptions";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

/** 六大能力 + 整體描述的完整輸入介面。一對一直接內嵌，小團班放在右側 drawer */
const PerformanceEditor = ({
  ws,
  student,
}: {
  ws: SessionWorkspace;
  student: Student;
}) => {
  const o = ws.state.observations[student.id] ?? { note: "", skills: {} };
  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor={`note-${student.id}`}
          className="text-sm font-medium text-foreground mb-1.5 block"
        >
          整體觀察
        </label>
        <Textarea
          id={`note-${student.id}`}
          value={o.note}
          placeholder="例如：今天閱讀理解不錯，但字彙量仍不足。"
          onChange={(e) => ws.setObservationNote(student.id, e.target.value)}
          className="min-h-[76px] resize-y"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-foreground">觀察到的能力</p>
          <p className="text-xs text-muted-foreground">不必每堂課都填六項</p>
        </div>
        <div className="divide-y divide-border">
          {SKILL_ORDER.map((skill) => (
            <div
              key={skill}
              className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="w-14 shrink-0 text-sm text-foreground">{SKILL_LABEL[skill]}</span>
              <SegmentedPicker
                options={ratingOptions}
                value={(o.skills[skill] ?? "not_observed") as SkillRating}
                onChange={(v) => ws.setSkillRating(student.id, skill, v)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** 小團班列表上的一行摘要：只顯示已觀察到的能力，沒有就是「未觀察」 */
const CompactRow = ({
  ws,
  student,
  onEdit,
}: {
  ws: SessionWorkspace;
  student: Student;
  onEdit: () => void;
}) => {
  const o = ws.state.observations[student.id] ?? { note: "", skills: {} };
  const rated = SKILL_ORDER.filter((k) => o.skills[k]) as SkillKey[];
  const hasAny = rated.length > 0 || o.note.trim().length > 0;

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <StudentAvatar student={student} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{student.name}</p>
        {rated.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {rated.map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{SKILL_LABEL[k]}</span>
                <RatingBadge rating={o.skills[k]!} />
              </span>
            ))}
          </div>
        ) : (
          // 🛑 未觀察不是負面評價
          <p className="text-xs text-muted-foreground mt-1">未觀察</p>
        )}
        {o.note.trim() && (
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">「{o.note}」</p>
        )}
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onEdit}>
        {hasAny ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {hasAny ? "編輯" : "新增"}
      </Button>
    </div>
  );
};

/**
 * Today's Performance —— 老師的主觀觀察，和 Assessments / Scores 分開。
 * 一對一直接展開；小團班用 compact list + 右側 drawer，
 * 不會一次把 6 位 × 6 項全部攤開。
 */
export const PerformanceSection = ({
  ws,
  openStudentId,
  onOpenStudent,
}: {
  ws: SessionWorkspace;
  openStudentId: string | null;
  onOpenStudent: (id: string | null) => void;
}) => {
  const { scenario } = ws;
  const isGroup = scenario.students.length > 1;
  const openStudent = scenario.students.find((s) => s.id === openStudentId) ?? null;

  const observedCount = scenario.students.filter((s) => {
    const o = ws.state.observations[s.id];
    return o && (o.note.trim() || Object.keys(o.skills).length);
  }).length;

  return (
    <>
      <WorkspaceSection
        id="section-performance"
        icon={Eye}
        title="今日表現"
        hint="老師的主觀觀察，與下方的評量成績分開記錄"
        action={
          isGroup && (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              已觀察 {observedCount}/{scenario.students.length}
            </Badge>
          )
        }
      >
        {isGroup ? (
          <div className="divide-y divide-border">
            {scenario.students.map((s) => (
              <CompactRow key={s.id} ws={ws} student={s} onEdit={() => onOpenStudent(s.id)} />
            ))}
          </div>
        ) : (
          <PerformanceEditor ws={ws} student={scenario.students[0]} />
        )}
      </WorkspaceSection>

      {/* 詳細編輯一律走右側 drawer */}
      <Sheet open={!!openStudent} onOpenChange={(o) => !o && onOpenStudent(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {openStudent && (
            <>
              <SheetHeader className="mb-5 text-left">
                <SheetTitle className="flex items-center gap-2.5">
                  <StudentAvatar student={openStudent} />
                  {openStudent.name}
                </SheetTitle>
                <SheetDescription>今日表現 · 老師觀察</SheetDescription>
              </SheetHeader>
              <PerformanceEditor ws={ws} student={openStudent} />
              <Button className="w-full mt-6" onClick={() => onOpenStudent(null)}>
                完成
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                內容已自動儲存，關閉不會遺失
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
