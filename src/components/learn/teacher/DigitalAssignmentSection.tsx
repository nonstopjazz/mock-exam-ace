import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Ban, Laptop, Library, Plus, Trash2, X } from "lucide-react";
import { PLATFORM_ACTIVITIES, type DigitalAssignment } from "@/data/learn/teacherSessionMock";
import { WorkspaceSection, DueSelect, StudentSelect, StudentAvatar } from "./shared";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

const AssignmentCard = ({ ws, item }: { ws: SessionWorkspace; item: DigitalAssignment }) => {
  const { scenario, updateDigital, removeDigital, upsertDigitalException, removeDigitalException } = ws;
  const isGroup = scenario.students.length > 1;
  const [exStudent, setExStudent] = useState("");
  const [exMode, setExMode] = useState<"override" | "excluded">("override");
  const [exTitle, setExTitle] = useState("");

  const addException = () => {
    if (!exStudent) return;
    if (exMode === "override" && !exTitle.trim()) return;
    upsertDigitalException(item.id, {
      studentId: exStudent,
      mode: exMode,
      title: exMode === "override" ? exTitle.trim() : undefined,
    });
    setExStudent("");
    setExTitle("");
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground">{item.title}</p>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              {item.kindLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isGroup ? "指派給全班" : `指派給 ${scenario.students[0].name}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DueSelect
            mode={item.dueMode}
            customDue={item.customDue}
            onModeChange={(m) => updateDigital(item.id, { dueMode: m })}
            onCustomChange={(v) => updateDigital(item.id, { customDue: v })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={`移除 ${item.title}`}
            onClick={() => removeDigital(item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isGroup && (
        <div className="mt-3 pt-3 border-t border-border">
          {item.exceptions.length > 0 && (
            <div className="space-y-2 mb-2">
              {item.exceptions.map((ex) => {
                const s = scenario.students.find((x) => x.id === ex.studentId);
                if (!s) return null;
                return (
                  <div key={ex.studentId} className="flex items-center gap-2.5">
                    <StudentAvatar student={s} className="h-7 w-7" />
                    <span className="text-sm text-foreground w-16 shrink-0 truncate">{s.name}</span>
                    {ex.mode === "excluded" ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Ban className="h-3.5 w-3.5" />
                        不指派
                      </span>
                    ) : (
                      <span className="text-sm text-foreground min-w-0 truncate">改為：{ex.title}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground ml-auto"
                      aria-label={`移除 ${s.name} 的例外`}
                      onClick={() => removeDigitalException(item.id, ex.studentId)}
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
              exclude={item.exceptions.map((e) => e.studentId)}
              className="h-8 w-[130px]"
            />
            <Select value={exMode} onValueChange={(v) => setExMode(v as "override" | "excluded")}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="override" className="text-xs">換一份</SelectItem>
                <SelectItem value="excluded" className="text-xs">不指派</SelectItem>
              </SelectContent>
            </Select>
            {exMode === "override" && (
              <Input
                value={exTitle}
                placeholder="例如：Reading Quiz #13B"
                onChange={(e) => setExTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addException()}
                className="h-8 flex-1 min-w-[170px]"
              />
            )}
            <Button variant="ghost" size="sm" onClick={addException} disabled={!exStudent}>
              <Plus className="h-4 w-4" />
              例外
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 線上任務 —— 兩個入口：從平台既有活動挑選，或直接自建一個簡單任務。
 * 🛑 Content Library 還沒建好時，老師仍然可以工作。
 */
export const DigitalAssignmentSection = ({ ws }: { ws: SessionWorkspace }) => {
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [simpleTitle, setSimpleTitle] = useState("");

  const createSimple = () => {
    if (!simpleTitle.trim()) return;
    ws.addDigital({ title: simpleTitle.trim(), origin: "simple", kindLabel: "自建任務" });
    setSimpleTitle("");
    setCreating(false);
  };

  return (
    <>
      <WorkspaceSection
        id="section-digital"
        icon={Laptop}
        title="線上任務"
        hint="預設繳交時間為次堂課，可個別修改"
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => setPicker(true)}>
              <Library className="h-4 w-4" />
              從平台挑選
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreating((v) => !v)}>
              <Plus className="h-4 w-4" />
              自建簡單任務
            </Button>
          </>
        }
      >
        {creating && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="simple-task" className="text-xs text-muted-foreground mb-1 block">
                任務名稱
              </label>
              <Input
                id="simple-task"
                autoFocus
                value={simpleTitle}
                placeholder="例如：錄一段 60 秒自我介紹"
                onChange={(e) => setSimpleTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSimple()}
                className="h-9"
              />
            </div>
            <Button onClick={createSimple} disabled={!simpleTitle.trim()}>建立</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>取消</Button>
          </div>
        )}

        {ws.state.digital.length === 0 && !creating ? (
          <div className="text-center py-10 text-muted-foreground">
            <p>這堂課還沒有指派線上任務</p>
            <p className="text-sm mt-2">可以從平台既有活動挑選，或自建一個簡單任務</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ws.state.digital.map((d) => (
              <AssignmentCard key={d.id} ws={ws} item={d} />
            ))}
          </div>
        )}
      </WorkspaceSection>

      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>從平台挑選</DialogTitle>
            <DialogDescription>選一項既有活動指派給{ws.scenario.students.length > 1 ? "全班" : "學生"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[340px] overflow-y-auto">
            {PLATFORM_ACTIVITIES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  ws.addDigital({ title: a.title, origin: "platform", kindLabel: a.kindLabel });
                  setPicker(false);
                }}
                className="w-full text-left rounded-lg border border-border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="font-medium text-foreground">{a.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.kindLabel}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
