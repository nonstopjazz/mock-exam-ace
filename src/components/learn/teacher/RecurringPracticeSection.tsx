import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Pause, Pencil, Play, Plus, Repeat, X } from "lucide-react";
import { WorkspaceSection, StudentSelect, StudentAvatar } from "./shared";
import type { Routine } from "@/data/learn/teacherSessionMock";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

/**
 * 一條 routine 預設就是一列：名稱 / 頻率 / 例外數 / 編輯。
 * 🛑 沒有變動時，老師看一眼就可以略過 —— 0 click，沒有「保留」按鈕。
 */
const RoutineRow = ({ ws, routine }: { ws: SessionWorkspace; routine: Routine }) => {
  const { scenario, updateRoutine, upsertRoutineException, removeRoutineException } = ws;
  const isGroup = scenario.students.length > 1;
  const [open, setOpen] = useState(false);
  const [exStudent, setExStudent] = useState("");
  const [exText, setExText] = useState("");

  const addException = () => {
    if (!exStudent || !exText.trim()) return;
    upsertRoutineException(routine.id, exStudent, exText.trim());
    setExStudent("");
    setExText("");
  };

  return (
    <div className={routine.active ? "" : "opacity-60"}>
      <div className="flex items-center gap-3 py-1.5">
        <span className="text-sm font-medium text-foreground truncate">{routine.title}</span>
        <span className="text-sm text-muted-foreground truncate">
          {routine.cadence} · {routine.minutes} 分鐘
        </span>
        {!routine.active && <span className="text-xs text-muted-foreground">已停止</span>}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isGroup && (
            <span>
              {routine.exceptions.length > 0 ? `${routine.exceptions.length} 項例外` : "無例外"}
            </span>
          )}
          <Pencil className="h-3.5 w-3.5" />
          編輯
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-border bg-card p-3 mb-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={routine.title}
              onChange={(e) => updateRoutine(routine.id, { title: e.target.value })}
              className="h-8 w-44"
              aria-label="項目名稱"
            />
            <Input
              value={routine.cadence}
              onChange={(e) => updateRoutine(routine.id, { cadence: e.target.value })}
              className="h-8 w-28"
              aria-label="頻率"
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                value={routine.minutes}
                onChange={(e) => updateRoutine(routine.id, { minutes: Number(e.target.value) })}
                className="h-8 w-[68px]"
                aria-label="每次分鐘數"
              />
              <span className="text-sm text-muted-foreground">分鐘</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 ml-auto text-muted-foreground"
              onClick={() => updateRoutine(routine.id, { active: !routine.active })}
            >
              {routine.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {routine.active ? "停止" : "恢復"}
            </Button>
          </div>

          {isGroup && (
            <div className="pt-2 border-t border-border">
              {routine.exceptions.map((ex) => {
                const s = scenario.students.find((x) => x.id === ex.studentId);
                if (!s) return null;
                return (
                  <div key={ex.studentId} className="flex items-center gap-2 mb-2">
                    <StudentAvatar student={s} className="h-6 w-6" />
                    <span className="text-sm text-foreground w-14 shrink-0 truncate">{s.name}</span>
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
              <div className="flex flex-wrap items-center gap-2">
                <StudentSelect
                  students={scenario.students}
                  value={exStudent}
                  onChange={setExStudent}
                  exclude={routine.exceptions.map((e) => e.studentId)}
                  className="h-8 w-[120px]"
                />
                <Input
                  value={exText}
                  placeholder="例如：每天 · 20 分鐘 / 暫停一週"
                  onChange={(e) => setExText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addException()}
                  className="h-8 flex-1 min-w-[150px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={addException}
                  disabled={!exStudent || !exText.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  例外
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** 常態練習 —— maintenance 層級，整頁最輕的一區 */
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
      hint="沒有變動就不用做任何事，會自動延續"
      level="maintenance"
      action={
        !adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            新增
          </Button>
        )
      }
    >
      {adding && (
        <div className="rounded-lg border border-border bg-card p-3 mb-2 flex flex-wrap items-end gap-2.5">
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
          <div className="w-28">
            <label htmlFor="rt-cadence" className="text-xs text-muted-foreground mb-1 block">頻率</label>
            <Input id="rt-cadence" value={cadence} onChange={(e) => setCadence(e.target.value)} className="h-9" />
          </div>
          <div className="w-20">
            <label htmlFor="rt-min" className="text-xs text-muted-foreground mb-1 block">分鐘</label>
            <Input id="rt-min" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="h-9" />
          </div>
          <Button onClick={add} disabled={!title.trim()}>加入</Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>取消</Button>
        </div>
      )}

      {ws.state.recurring.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">目前沒有常態練習。</p>
      ) : (
        <div className="divide-y divide-border/60">
          {ws.state.recurring.map((r) => (
            <RoutineRow key={r.id} ws={ws} routine={r} />
          ))}
        </div>
      )}
    </WorkspaceSection>
  );
};
