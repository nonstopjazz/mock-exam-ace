import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  ChevronDown, ChevronUp, ClipboardCheck, MessageSquarePlus, Plus, Trash2, X,
} from "lucide-react";
import {
  SCORE_STATE_LABEL, type Assessment, type ScoreState, type Student,
} from "@/data/learn/teacherSessionMock";
import { WorkspaceSection, SourceBadge, StudentAvatar } from "./shared";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

const MANUAL_STATES: ScoreState[] = ["scored", "absent", "not_taken", "excused"];

const summarise = (a: Assessment, students: Student[]) => {
  const values = students
    .map((s) => a.scores[s.id])
    .filter((e) => e?.state === "scored" && typeof e.value === "number")
    .map((e) => e!.value!);
  return {
    completed: values.length,
    total: students.length,
    average: values.length ? Math.round(values.reduce((x, y) => x + y, 0) / values.length) : null,
  };
};

/** 一列成績。系統產生的唯讀，老師建立的可直接輸入（batch score entry） */
const ScoreRow = ({
  ws,
  assessment,
  student,
  onOpenDetail,
}: {
  ws: SessionWorkspace;
  assessment: Assessment;
  student: Student;
  onOpenDetail: () => void;
}) => {
  const e = assessment.scores[student.id] ?? { state: "not_taken" as ScoreState };
  const readOnly = assessment.systemGenerated;
  const [noteOpen, setNoteOpen] = useState(!!e.note);

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2.5 w-36 min-w-0">
          <StudentAvatar student={student} className="h-7 w-7" />
          <span className="text-sm text-foreground truncate">{student.name}</span>
        </div>

        {readOnly ? (
          <span className="text-sm tabular-nums w-24">
            {e.state === "scored" ? (
              <span className="font-semibold text-foreground">
                {e.value}
                <span className="text-muted-foreground font-normal"> / {assessment.totalScore}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{SCORE_STATE_LABEL[e.state]}</span>
            )}
          </span>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={assessment.totalScore}
                value={e.state === "scored" && e.value !== undefined ? e.value : ""}
                placeholder="—"
                onChange={(ev) => ws.setScore(assessment.id, student.id, ev.target.value)}
                className="h-8 w-20 tabular-nums"
                aria-label={`${student.name} 分數`}
              />
              <span className="text-sm text-muted-foreground tabular-nums">
                / {assessment.totalScore}
              </span>
            </div>
            <Select
              value={e.state}
              onValueChange={(v) => ws.setScoreState(assessment.id, student.id, v as ScoreState)}
            >
              <SelectTrigger className="h-8 w-[104px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_STATES.map((st) => (
                  <SelectItem key={st} value={st} className="text-xs">
                    {SCORE_STATE_LABEL[st]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {!noteOpen && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setNoteOpen(true)}
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="hidden lg:inline">加註記</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onOpenDetail}>
            更多
          </Button>
        </div>
      </div>

      {/* Quick note：直接在 row 上補一句判讀 */}
      {noteOpen && (
        <div className="flex items-center gap-2 mt-2 ml-9">
          <Input
            value={e.note ?? ""}
            placeholder="例如：主要錯在 vocabulary。"
            onChange={(ev) => ws.setScoreNote(assessment.id, student.id, ev.target.value)}
            className="h-8"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            aria-label="收起註記"
            onClick={() => {
              if (!e.note?.trim()) setNoteOpen(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

const AssessmentBlock = ({
  ws,
  assessment,
  onOpenDetail,
}: {
  ws: SessionWorkspace;
  assessment: Assessment;
  onOpenDetail: (studentId: string) => void;
}) => {
  const students = ws.scenario.students;
  const { completed, total, average } = summarise(assessment, students);
  // AUTO / AI 預設只顯示 summary；老師建立的紙筆評量要直接能輸入
  const [open, setOpen] = useState(!assessment.systemGenerated);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground">{assessment.title}</p>
            <SourceBadge source={assessment.source} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            {completed} / {total} 已完成
            {average !== null && ` · 平均 ${average}`}
            {assessment.totalScore !== 100 && ` · 滿分 ${assessment.totalScore}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!assessment.systemGenerated && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label="移除這份評量"
              onClick={() => ws.removeAssessment(assessment.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {open ? "收合" : "查看成績"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-border divide-y divide-border">
          {students.map((s) => (
            <ScoreRow
              key={s.id}
              ws={ws}
              assessment={assessment}
              student={s}
              onOpenDetail={() => onOpenDetail(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Assessments / Scores —— 客觀成績，與「今日表現」的主觀觀察分開。
 * TEACHER / AUTO / AI / IMPORTED 可以並存；source 用低調的小 badge 標示。
 */
export const AssessmentsSection = ({ ws }: { ws: SessionWorkspace }) => {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("20");
  const [detail, setDetail] = useState<{ assessmentId: string; studentId: string } | null>(null);

  const detailAssessment = ws.state.assessments.find((a) => a.id === detail?.assessmentId);
  const detailStudent = ws.scenario.students.find((s) => s.id === detail?.studentId);
  const detailEntry = detailAssessment && detail ? detailAssessment.scores[detail.studentId] : undefined;

  const create = () => {
    const t = title.trim() || "紙筆測驗";
    ws.addManualAssessment(t, Math.max(1, Number(total) || 100));
    setTitle("");
    setTotal("20");
    setCreating(false);
  };

  return (
    <>
      <WorkspaceSection
        id="section-assessments"
        icon={ClipboardCheck}
        title="評量與成績"
        hint="紙筆成績由老師輸入；系統已產生的成績不需要重新確認"
        action={
          !creating && (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              新增紙筆評量
            </Button>
          )
        }
      >
        {creating && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
            <p className="text-sm font-medium text-foreground mb-3">
              建立一份評量，全班共用同一份（不會產生 {ws.scenario.students.length} 份）
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="new-assess-title" className="text-xs text-muted-foreground mb-1 block">
                  名稱
                </label>
                <Input
                  id="new-assess-title"
                  autoFocus
                  value={title}
                  placeholder="例如：Vocabulary Quiz（紙筆）"
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  className="h-9"
                />
              </div>
              <div className="w-28">
                <label htmlFor="new-assess-total" className="text-xs text-muted-foreground mb-1 block">
                  滿分
                </label>
                <Input
                  id="new-assess-total"
                  type="number"
                  min={1}
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button onClick={create}>建立</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>取消</Button>
            </div>
          </div>
        )}

        {ws.state.assessments.length === 0 && !creating ? (
          <div className="text-center py-10 text-muted-foreground">
            <p>這堂課還沒有任何評量</p>
            <p className="text-sm mt-2">若今天有做紙筆測驗，點右上角「新增紙筆評量」</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ws.state.assessments.map((a) => (
              <AssessmentBlock
                key={a.id}
                ws={ws}
                assessment={a}
                onOpenDetail={(studentId) => setDetail({ assessmentId: a.id, studentId })}
              />
            ))}
          </div>
        )}
      </WorkspaceSection>

      {/* 詳細判讀：與「今日表現」的整體觀察分開，不會混在一起 */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailAssessment && detailStudent && (
            <>
              <SheetHeader className="mb-5 text-left">
                <SheetTitle className="flex items-center gap-2.5">
                  <StudentAvatar student={detailStudent} />
                  {detailStudent.name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  {detailAssessment.title}
                  <SourceBadge source={detailAssessment.source} />
                </SheetDescription>
              </SheetHeader>

              <div className="rounded-lg bg-muted/40 p-4 mb-5">
                <p className="text-xs text-muted-foreground mb-1">本次成績</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {detailEntry?.state === "scored" && detailEntry.value !== undefined ? (
                    <>
                      {detailEntry.value}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}/ {detailAssessment.totalScore}
                      </span>
                    </>
                  ) : (
                    <span className="text-base font-normal text-muted-foreground">
                      {SCORE_STATE_LABEL[detailEntry?.state ?? "not_taken"]}
                    </span>
                  )}
                </p>
              </div>

              <label htmlFor="assess-note" className="text-sm font-medium text-foreground mb-1.5 block">
                這一筆成績的判讀
              </label>
              <Textarea
                id="assess-note"
                value={detailEntry?.note ?? ""}
                placeholder="例如：主要錯在 vocabulary。"
                onChange={(e) => ws.setScoreNote(detailAssessment.id, detailStudent.id, e.target.value)}
                className="min-h-[110px] resize-y"
              />
              <p className="text-xs text-muted-foreground mt-2">
                這則註記屬於這份評量，不會併入「今日表現」的整體觀察。
              </p>
              <Button className="w-full mt-6" onClick={() => setDetail(null)}>完成</Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
