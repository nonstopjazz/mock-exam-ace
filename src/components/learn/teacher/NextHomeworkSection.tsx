import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BookOpen, ChevronDown, Paperclip, Plus, X } from "lucide-react";
import { WorkspaceSection, DueSelect, StudentSelect, StudentAvatar } from "./shared";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

/**
 * 次堂作業 —— Quick Add first。
 * 小團班刻意把「一份 class default + 少數 override」的語意寫在畫面上，
 * 讓老師不會以為系統要建立 N 份作業。
 */
export const NextHomeworkSection = ({ ws }: { ws: SessionWorkspace }) => {
  const { scenario, state, updateNextHomework, upsertHomeworkException, removeHomeworkException } = ws;
  const hw = state.nextHomework;
  const isGroup = scenario.students.length > 1;

  const [more, setMore] = useState(false);
  const [addingEx, setAddingEx] = useState(false);
  const [exStudent, setExStudent] = useState("");
  const [exText, setExText] = useState("");

  const dueLabel =
    hw.dueMode === "next_class"
      ? `次堂課 · ${scenario.nextClassLabel}`
      : hw.dueMode === "custom"
        ? (hw.customDue || "自訂日期")
        : "不設期限";

  const addException = () => {
    if (!exStudent || !exText.trim()) return;
    upsertHomeworkException(exStudent, exText.trim());
    setExStudent("");
    setExText("");
    setAddingEx(false);
  };

  return (
    <WorkspaceSection id="section-homework" icon={BookOpen} title="次堂作業" level="active">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground mb-1.5">
          {isGroup ? "班級預設 · 全班共用一份" : "作業內容"}
        </p>
        <Input
          id="next-hw"
          value={hw.classDefault}
          placeholder="例如：講義 P.26–30"
          onChange={(e) => updateNextHomework({ classDefault: e.target.value })}
          className="h-9 bg-card"
          aria-label="次堂作業內容"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs text-muted-foreground">繳交：{dueLabel}</span>
          <Collapsible open={more} onOpenChange={setMore} className="ml-auto">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} />
                更多選項
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>

        <Collapsible open={more} onOpenChange={setMore}>
          <CollapsibleContent className="pt-3 space-y-3 border-t border-border mt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">繳交時間</p>
              <DueSelect
                mode={hw.dueMode}
                customDue={hw.customDue}
                onModeChange={(m) => updateNextHomework({ dueMode: m })}
                onCustomChange={(v) => updateNextHomework({ customDue: v })}
              />
            </div>
            <div>
              <label htmlFor="hw-note" className="text-xs text-muted-foreground mb-1.5 block">
                給學生的說明（選填）
              </label>
              <Textarea
                id="hw-note"
                value={hw.teacherNote}
                onChange={(e) => updateNextHomework({ teacherNote: e.target.value })}
                className="min-h-[56px] resize-y bg-card"
              />
            </div>
            <div className="flex items-center gap-2">
              {hw.attachmentName ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    {hw.attachmentName}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    aria-label="移除附件"
                    onClick={() => updateNextHomework({ attachmentName: "" })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => updateNextHomework({ attachmentName: "講義_Unit5.pdf" })}
                >
                  <Paperclip className="h-4 w-4" />
                  加入附件
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {isGroup && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {hw.exceptions.length > 0
                ? `例外（${hw.exceptions.length}）`
                : `全部 ${scenario.students.length} 位學生使用同一份`}
            </p>
            {!addingEx && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 ml-auto text-muted-foreground"
                onClick={() => setAddingEx(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                新增例外
              </Button>
            )}
          </div>

          {hw.exceptions.length > 0 && (
            <div className="mt-1.5 divide-y divide-border/60">
              {hw.exceptions.map((ex) => {
                const s = scenario.students.find((x) => x.id === ex.studentId);
                if (!s) return null;
                return (
                  <div key={ex.studentId} className="flex items-center gap-2 py-1.5">
                    <StudentAvatar student={s} className="h-6 w-6" />
                    <span className="text-sm text-foreground w-14 shrink-0 truncate">{s.name}</span>
                    <span className="text-muted-foreground text-sm shrink-0">→</span>
                    <Input
                      value={ex.text}
                      onChange={(e) => upsertHomeworkException(ex.studentId, e.target.value)}
                      className="h-8"
                      aria-label={`${s.name} 的作業例外`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      aria-label={`移除 ${s.name} 的例外`}
                      onClick={() => removeHomeworkException(ex.studentId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {addingEx && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StudentSelect
                students={scenario.students}
                value={exStudent}
                onChange={setExStudent}
                exclude={hw.exceptions.map((e) => e.studentId)}
                className="h-8 w-[120px]"
              />
              <Input
                value={exText}
                placeholder="例如：P.26–28"
                onChange={(e) => setExText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addException()}
                className="h-8 flex-1 min-w-[150px]"
              />
              <Button variant="outline" size="sm" className="h-8" onClick={addException} disabled={!exStudent || !exText.trim()}>
                加入
              </Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setAddingEx(false)}>
                取消
              </Button>
            </div>
          )}
        </div>
      )}
    </WorkspaceSection>
  );
};
