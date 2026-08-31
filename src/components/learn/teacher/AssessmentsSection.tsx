import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  ChevronUp, ClipboardCheck, MessageSquarePlus, Plus, Trash2, X,
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
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 w-32 min-w-0">
          <StudentAvatar student={student} className="h-6 w-6" />
          <span className="text-sm text-foreground truncate">{student.name}</span>
        </div>

        {readOnly ? (
          <span className="text-sm tabular-nums">
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
                className="h-8 w-[68px] tabular-nums"
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
              <SelectTrigger className="h-8 w-[96px] text-xs">
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

        {/* 註記控制項只在展開時才出現，collapsed summary 不會顯示 */}
        <div className="flex items-center gap-1 ml-auto">
          {!noteOpen && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => setNoteOpen(true)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">加註記</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={onOpenDetail}
          >
            更多
          </Button>
        </div>
      </div>

      {/* Quick note：直接在 row 上補一句判讀 */}
      {noteOpen && (
        <div className="flex items-center gap-2 mt-1.5 ml-8">
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
            onClick={() => { if (!e.note?.trim()) setNoteOpen(false); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

/**
 * 一份評量 = 一列 summary。
 * 🛑 預設全部 collapsed，包含尚未輸入成績的：不顯示 6 行空表格。
 */
const AssessmentRow = ({
  ws,
  assessment,
  expanded,
  onToggle,
  onOpenDetail,
}: {
  ws: SessionWorkspace;
  assessment: Assessment;
  expanded: boolean;
  onToggle: () => void;
  onOpenDetail: (studentId: string) => void;
}) => {
  const students = ws.scenario.students;
  const { completed, total, average } = summarise(assessment, students);
  const hasScores = completed > 0;
  const perfect = assessment.totalScore === 100;

  const summaryText = !hasScores
    ? "尚未輸入成績"
    : `${completed} / ${total} 已完成 · 平均 ${average}${perfect ? "" : ` / ${assessment.totalScore}`}`;

  const actionLabel = assessment.systemGenerated ? "查看" : hasScores ? "編輯" : "輸入分數";

  return (
    <div className={expanded ? "rounded-lg border border-border bg-muted/20 my-1.5" : ""}>
      <div className={`flex items-center gap-3 py-2 ${expanded ? "px-3" : ""}`}>
        <p className="font-medium text-foreground truncate">{assessment.title}</p>
        <SourceBadge source={assessment.source} />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums text-right shrink-0">
          {summaryText}
        </span>
        {!assessment.systemGenerated && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            aria-label={`移除 ${assessment.title}`}
            onClick={() => ws.removeAssessment(assessment.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={onToggle}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : null}
          {expanded ? "收合" : actionLabel}
        </Button>
      </div>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="divide-y divide-border/60 border-t border-border pt-1">
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
          {/* 輸入完就收回 summary，不讓整張 6 人表格一直攤在畫面上 */}
          {!assessment.systemGenerated && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onToggle}>
              完成輸入
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Assessments / Scores —— summary-first。
 * TEACHER / AUTO / AI 並存；一次只展開一份，避免整頁被成績表拉長。
 */
export const AssessmentsSection = ({ ws }: { ws: SessionWorkspace }) => {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("20");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ assessmentId: string; studentId: string } | null>(null);

  const detailAssessment = ws.state.assessments.find((a) => a.id === detail?.assessmentId);
  const detailStudent = ws.scenario.students.find((s) => s.id === detail?.studentId);
  const detailEntry = detailAssessment && detail ? detailAssessment.scores[detail.studentId] : undefined;

  const create = () => {
    const id = ws.addManualAssessment(title.trim() || "紙筆測驗", Math.max(1, Number(total) || 100));
    setTitle("");
    setTotal("20");
    setCreating(false);
    setExpandedId(id); // 剛建立就是要輸入分數
  };

  return (
    <>
      <WorkspaceSection
        id="section-assessments"
        icon={ClipboardCheck}
        title="評量與成績"
        hint="系統已產生的成績不需要重新確認"
        level="review"
        action={
          !creating && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              新增紙筆評量
            </Button>
          )
        }
      >
        {creating && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3 flex flex-wrap items-end gap-2.5">
            <div className="min-w-0 flex-1">
              <label htmlFor="new-assess-title" className="text-xs text-muted-foreground mb-1 block">
                名稱（全班共用一份）
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
            <div className="w-24">
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
        )}

        {ws.state.assessments.length === 0 && !creating ? (
          <p className="text-sm text-muted-foreground py-1">
            這堂課還沒有任何評量。若今天有做紙筆測驗，點右上角「新增紙筆評量」。
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {ws.state.assessments.map((a) => (
              <AssessmentRow
                key={a.id}
                ws={ws}
                assessment={a}
                expanded={expandedId === a.id}
                onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
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
