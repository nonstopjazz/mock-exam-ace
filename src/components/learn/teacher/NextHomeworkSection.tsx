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
 * 老師只要打一行就完成，Due 預設「次堂課」，其他欄位收在「更多選項」裡。
 * 小團班採 class default → individual override，不會產生 N 份作業。
 */
export const NextHomeworkSection = ({ ws }: { ws: SessionWorkspace }) => {
  const { scenario, state, updateNextHomework, upsertHomeworkException, removeHomeworkException } = ws;
  const hw = state.nextHomework;
  const isGroup = scenario.students.length > 1;

  const [more, setMore] = useState(false);
  const [exStudent, setExStudent] = useState("");
  const [exText, setExText] = useState("");

  const addException = () => {
    if (!exStudent || !exText.trim()) return;
    upsertHomeworkException(exStudent, exText.trim());
    setExStudent("");
    setExText("");
  };

  return (
    <WorkspaceSection
      id="section-homework"
      icon={BookOpen}
      title="次堂作業"
      hint={`預設繳交時間：次堂課 · ${scenario.nextClassLabel}`}
    >
      <div>
        <label htmlFor="next-hw" className="text-sm font-medium text-foreground mb-1.5 block">
          {isGroup ? "班級預設" : "作業內容"}
        </label>
        <Input
          id="next-hw"
          value={hw.classDefault}
          placeholder="例如：講義 P.26–30"
          onChange={(e) => updateNextHomework({ classDefault: e.target.value })}
          className="h-10"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          打一行就完成，不需要再設定日期。
        </p>
      </div>

      <Collapsible open={more} onOpenChange={setMore} className="mt-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2">
            <ChevronDown className={`h-4 w-4 transition-transform ${more ? "rotate-180" : ""}`} />
            更多選項
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-1.5">繳交時間</p>
            <DueSelect
              mode={hw.dueMode}
              customDue={hw.customDue}
              onModeChange={(m) => updateNextHomework({ dueMode: m })}
              onCustomChange={(v) => updateNextHomework({ customDue: v })}
            />
          </div>
          <div>
            <label htmlFor="hw-note" className="text-sm font-medium text-foreground mb-1.5 block">
              給學生的說明
            </label>
            <Textarea
              id="hw-note"
              value={hw.teacherNote}
              placeholder="選填"
              onChange={(e) => updateNextHomework({ teacherNote: e.target.value })}
              className="min-h-[64px] resize-y"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground mb-1.5">附件</p>
            {hw.attachmentName ? (
              <div className="flex items-center gap-2">
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
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateNextHomework({ attachmentName: "講義_Unit5.pdf" })}
              >
                <Paperclip className="h-4 w-4" />
                加入附件
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">原型階段：點一下會加入一個示範檔名。</p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {isGroup && (
        <div className="mt-5 pt-5 border-t border-border">
          <p className="text-sm font-medium text-foreground mb-3">個別例外</p>

          {hw.exceptions.length > 0 && (
            <div className="space-y-2 mb-3">
              {hw.exceptions.map((ex) => {
                const s = scenario.students.find((x) => x.id === ex.studentId);
                if (!s) return null;
                return (
                  <div key={ex.studentId} className="flex items-center gap-2.5">
                    <StudentAvatar student={s} className="h-7 w-7" />
                    <span className="text-sm text-foreground w-16 shrink-0 truncate">{s.name}</span>
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

          <div className="flex flex-wrap items-center gap-2">
            <StudentSelect
              students={scenario.students}
              value={exStudent}
              onChange={setExStudent}
              exclude={hw.exceptions.map((e) => e.studentId)}
            />
            <Input
              value={exText}
              placeholder="例如：P.26–28"
              onChange={(e) => setExText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addException()}
              className="h-9 flex-1 min-w-[160px]"
            />
            <Button variant="outline" size="sm" onClick={addException} disabled={!exStudent || !exText.trim()}>
              <Plus className="h-4 w-4" />
              加入例外
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            全班共用同一份作業，只有例外的學生會被覆寫。
          </p>
        </div>
      )}
    </WorkspaceSection>
  );
};
