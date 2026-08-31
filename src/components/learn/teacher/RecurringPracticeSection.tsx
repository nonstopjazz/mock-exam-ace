import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pause, Pencil, Play, Plus, Repeat, X } from "lucide-react";
import { WorkspaceSection, StudentSelect, StudentAvatar } from "./shared";
import type { Routine } from "@/data/learn/teacherSessionMock";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

const RoutineRow = ({ ws, routine }: { ws: SessionWorkspace; routine: Routine }) => {
  const { scenario, updateRoutine, upsertRoutineException, removeRoutineException } = ws;
  const isGroup = scenario.students.length > 1;
  const [editing, setEditing] = useState(false);
  const [exStudent, setExStudent] = useState("");
  const [exText, setExText] = useState("");

  const addException = () => {
    if (!exStudent || !exText.trim()) return;
    upsertRoutineException(routine.id, exStudent, exText.trim());
    setExStudent("");
    setExText("");
  };

  return (
    <div className={`rounded-lg border border-border p-4 ${routine.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={routine.title}
                onChange={(e) => updateRoutine(routine.id, { title: e.target.value })}
                className="h-8 w-48"
                aria-label="項目名稱"
              />
              <Input
                value={routine.cadence}
                onChange={(e) => updateRoutine(routine.id, { cadence: e.target.value })}
                className="h-8 w-32"
                aria-label="頻率"
              />
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  value={routine.minutes}
                  onChange={(e) => updateRoutine(routine.id, { minutes: Number(e.target.value) })}
                  className="h-8 w-20"
                  aria-label="每次分鐘數"
                />
                <span className="text-sm text-muted-foreground">分鐘</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-foreground">{routine.title}</p>
                {!routine.active && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    已停止
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {routine.cadence} · {routine.minutes} 分鐘
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <Button size="sm" onClick={() => setEditing(false)}>完成</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                編輯
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => updateRoutine(routine.id, { active: !routine.active })}
              >
                {routine.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {routine.active ? "停止" : "恢復"}
              </Button>
            </>
          )}
        </div>
      </div>

      {isGroup && (
        <div className="mt-3 pt-3 border-t border-border">
          {routine.exceptions.length > 0 && (
            <div className="space-y-2 mb-2">
              {routine.exceptions.map((ex) => {
                const s = scenario.students.find((x) => x.id === ex.studentId);
                if (!s) return null;
                return (
                  <div key={ex.studentId} className="flex items-center gap-2.5">
                    <StudentAvatar student={s} className="h-7 w-7" />
                    <span className="text-sm text-foreground w-16 shrink-0 truncate">{s.name}</span>
                    <Input
                      value={ex.text}
                      onChange={(e) => upsertRoutineException(routine.id, ex.studentId, e.target.value)}
                      className="h-8"
                      aria-label={`${s.name} 的例外設定`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      aria-label={`移除 ${s.name} 的例外`}
                      onClick={() => removeRoutineException(routine.id, ex.studentId)}
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
              exclude={routine.exceptions.map((e) => e.studentId)}
              className="h-8 w-[130px]"
            />
            <Input
              value={exText}
              placeholder="例如：每天 · 20 分鐘 / 暫停一週"
              onChange={(e) => setExText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addException()}
              className="h-8 flex-1 min-w-[160px]"
            />
            <Button variant="ghost" size="sm" onClick={addException} disabled={!exStudent || !exText.trim()}>
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
 * 常態練習 —— 已存在的 routine 直接顯示。
 * 🛑 如果老師今天不修改，需要 0 次點擊，不要求每堂課按「保留」。
 */
export const RecurringPracticeSection = ({ ws }: { ws: SessionWorkspace }) => {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState("每天");
  const [minutes, setMinutes] = useState("15");

  const add = () => {
    if (!title.trim()) return;
    ws.addRoutine(title.trim(), cadence.trim() || "每天", Math.max(1, Number(minutes) || 15));
    setTitle("");
    setCadence("每天");
    setMinutes("15");
    setAdding(false);
  };

  return (
    <WorkspaceSection
      icon={Repeat}
      title="常態練習"
      hint="已設定的項目會自動延續，沒有變動就不用做任何事"
      action={
        !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            新增常態練習
          </Button>
        )
      }
    >
      {adding && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 mb-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="rt-title" className="text-xs text-muted-foreground mb-1 block">項目</label>
            <Input
              id="rt-title"
              autoFocus
              value={title}
              placeholder="例如：Listening Practice"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="h-9"
            />
          </div>
          <div className="w-32">
            <label htmlFor="rt-cadence" className="text-xs text-muted-foreground mb-1 block">頻率</label>
            <Input
              id="rt-cadence"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-24">
            <label htmlFor="rt-min" className="text-xs text-muted-foreground mb-1 block">分鐘</label>
            <Input
              id="rt-min"
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="h-9"
            />
          </div>
          <Button onClick={add} disabled={!title.trim()}>加入</Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>取消</Button>
        </div>
      )}

      {ws.state.recurring.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p>目前沒有常態練習</p>
          <p className="text-sm mt-2">點右上角「新增常態練習」建立每天或每週固定的練習</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ws.state.recurring.map((r) => (
            <RoutineRow key={r.id} ws={ws} routine={r} />
          ))}
        </div>
      )}
    </WorkspaceSection>
  );
};
