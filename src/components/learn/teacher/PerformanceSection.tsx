import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ChevronDown, Eye, Pencil, Plus } from "lucide-react";
import {
  RATING_LABEL, SKILL_LABEL, SKILL_ORDER,
  type SkillKey, type SkillRating, type Student,
} from "@/data/learn/teacherSessionMock";
import { WorkspaceSection, SegmentedPicker, StudentAvatar } from "./shared";
import { ratingOptions, RATING_TEXT } from "./pickerOptions";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

/**
 * 六大能力的輸入介面。一對一直接內嵌，小團班放在右側 drawer。
 * 每一列預設只顯示「能力 — 目前等級」，點下去才展開 rating selector，
 * 避免 30 顆 pill 永遠停在畫面上。
 */
const PerformanceEditor = ({ ws, student }: { ws: SessionWorkspace; student: Student }) => {
  const o = ws.state.observations[student.id] ?? { note: "", skills: {} };
  const [openSkill, setOpenSkill] = useState<SkillKey | null>(null);

  return (
    <div className="space-y-4">
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
          className="min-h-[64px] resize-y"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="text-sm font-medium text-foreground">觀察到的能力</p>
          <p className="text-xs text-muted-foreground">不必每堂課都填六項</p>
        </div>
        <div className="divide-y divide-border">
          {SKILL_ORDER.map((skill) => {
            const rating = (o.skills[skill] ?? "not_observed") as SkillRating;
            const open = openSkill === skill;
            return (
              <div key={skill} className="py-1.5">
                <button
                  type="button"
                  onClick={() => setOpenSkill(open ? null : skill)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2 py-1 rounded-md text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-14 shrink-0 text-sm text-foreground pl-1">
                    {SKILL_LABEL[skill]}
                  </span>
                  <span className={`text-sm ${RATING_TEXT[rating]}`}>{RATING_LABEL[rating]}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 ml-auto mr-1 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="pl-1 pt-2 pb-1">
                    <SegmentedPicker
                      options={ratingOptions}
                      value={rating}
                      onChange={(v) => {
                        ws.setSkillRating(student.id, skill, v);
                        setOpenSkill(null);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** 小團班列表：壓成單列。沒有 note 就不留空行，有 note 只顯示一行截斷 preview */
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
  const shown = rated.slice(0, 2);
  const hasAny = rated.length > 0 || o.note.trim().length > 0;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <StudentAvatar student={student} className="h-7 w-7" />
      <span className="w-16 shrink-0 text-sm font-medium text-foreground truncate">
        {student.name}
      </span>

      <span className="shrink-0 flex items-center gap-2 text-sm">
        {shown.length > 0 ? (
          <>
            {shown.map((k) => (
              <span key={k}>
                <span className="text-muted-foreground">{SKILL_LABEL[k]} · </span>
                <span className={RATING_TEXT[o.skills[k]!]}>{RATING_LABEL[o.skills[k]!]}</span>
              </span>
            ))}
            {rated.length > shown.length && (
              <span className="text-xs text-muted-foreground">+{rated.length - shown.length}</span>
            )}
          </>
        ) : (
          // 🛑 未觀察不是負面評價，只是今天沒有足夠觀察
          <span className="text-muted-foreground">未觀察</span>
        )}
      </span>

      {/* 有 note 才占空間，且只顯示一行；完整內容在 drawer 裡看 */}
      {o.note.trim() && (
        <span className="min-w-0 flex-1 text-sm text-muted-foreground truncate">
          「{o.note}」
        </span>
      )}

      <Button variant="ghost" size="sm" className="shrink-0 ml-auto h-7 px-2" onClick={onEdit}>
        {hasAny ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {hasAny ? "編輯" : "新增"}
      </Button>
    </div>
  );
};

/**
 * Today's Performance —— 老師的主觀觀察，和 Assessments / Scores 分開。
 * 一對一直接展開；小團班用 compact list + 右側 drawer。
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
        hint="老師的主觀觀察，與評量成績分開記錄"
        level="active"
        action={
          isGroup && (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              已觀察 {observedCount}/{scenario.students.length}
            </Badge>
          )
        }
      >
        {isGroup ? (
          <div className="divide-y divide-border/60">
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
