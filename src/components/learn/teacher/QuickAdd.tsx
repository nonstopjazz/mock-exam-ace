import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookOpen, ClipboardCheck, Eye, Laptop, Zap, ChevronLeft } from "lucide-react";
import {
  PLATFORM_ACTIVITIES, RATING_LABEL, RATING_ORDER, SKILL_LABEL, SKILL_ORDER,
  type SkillKey, type SkillRating,
} from "@/data/learn/teacherSessionMock";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

type Mode = "menu" | "observation" | "assessment" | "homework" | "digital";

const scrollTo = (id: string) =>
  requestAnimationFrame(() =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );

/**
 * Quick Add —— 上課途中用的入口，放在永遠看得到的 sticky bar 上。
 * 每一種都控制在 3 個欄位以內。
 */
export const QuickAdd = ({ ws }: { ws: SessionWorkspace }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const students = ws.scenario.students;
  const single = students.length === 1;

  // observation
  const [obsStudent, setObsStudent] = useState(single ? students[0].id : "");
  const [obsSkill, setObsSkill] = useState<SkillKey | "">("");
  const [obsRating, setObsRating] = useState<SkillRating | "">("");
  // assessment
  const [asTitle, setAsTitle] = useState("");
  const [asTotal, setAsTotal] = useState("20");
  // homework
  const [hwText, setHwText] = useState("");
  // digital
  const [digId, setDigId] = useState("");

  const reset = () => {
    setMode("menu");
    setObsStudent(single ? students[0].id : "");
    setObsSkill("");
    setObsRating("");
    setAsTitle("");
    setAsTotal("20");
    setHwText("");
    setDigId("");
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const submitObservation = () => {
    if (!obsStudent || !obsSkill || !obsRating) return;
    ws.setSkillRating(obsStudent, obsSkill, obsRating);
    const name = students.find((s) => s.id === obsStudent)?.name ?? "";
    toast.success(`已記錄 ${name} · ${SKILL_LABEL[obsSkill]} · ${RATING_LABEL[obsRating]}`);
    close();
    scrollTo("section-performance");
  };

  const submitAssessment = () => {
    ws.addManualAssessment(asTitle.trim() || "紙筆測驗", Math.max(1, Number(asTotal) || 100));
    toast.success("已建立評量，可以直接輸入分數");
    close();
    scrollTo("section-assessments");
  };

  const submitHomework = () => {
    if (!hwText.trim()) return;
    ws.updateNextHomework({ classDefault: hwText.trim() });
    toast.success("已設定次堂作業");
    close();
    scrollTo("section-homework");
  };

  const submitDigital = () => {
    const a = PLATFORM_ACTIVITIES.find((x) => x.id === digId);
    if (!a) return;
    ws.addDigital({ title: a.title, origin: "platform", kindLabel: a.kindLabel });
    toast.success(`已指派 ${a.title}`);
    close();
    scrollTo("section-digital");
  };

  const menu = [
    { key: "observation" as Mode, icon: Eye, label: "學生觀察", hint: "記一項能力表現" },
    { key: "assessment" as Mode, icon: ClipboardCheck, label: "評量 / 成績", hint: "建立一份紙筆評量" },
    { key: "homework" as Mode, icon: BookOpen, label: "次堂作業", hint: "打一行就完成" },
    { key: "digital" as Mode, icon: Laptop, label: "線上任務", hint: "從平台挑一項" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <Zap className="h-4 w-4" />
          快速新增
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode !== "menu" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1 text-muted-foreground"
                aria-label="返回"
                onClick={() => setMode("menu")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            快速新增
          </DialogTitle>
          <DialogDescription>上課途中也能在幾秒內記下來</DialogDescription>
        </DialogHeader>

        {mode === "menu" && (
          <div className="space-y-2">
            {menu.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className="w-full flex items-center gap-3 text-left rounded-lg border border-border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="p-2 rounded-lg bg-secondary/10 shrink-0">
                    <Icon className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.hint}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {mode === "observation" && (
          <div className="space-y-3">
            {!single && (
              <Select value={obsStudent} onValueChange={setObsStudent}>
                <SelectTrigger><SelectValue placeholder="選擇學生" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={obsSkill} onValueChange={(v) => setObsSkill(v as SkillKey)}>
              <SelectTrigger><SelectValue placeholder="選擇能力" /></SelectTrigger>
              <SelectContent>
                {SKILL_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>{SKILL_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={obsRating} onValueChange={(v) => setObsRating(v as SkillRating)}>
              <SelectTrigger><SelectValue placeholder="選擇等級" /></SelectTrigger>
              <SelectContent>
                {RATING_ORDER.filter((r) => r !== "not_observed").map((r) => (
                  <SelectItem key={r} value={r}>{RATING_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              onClick={submitObservation}
              disabled={!obsStudent || !obsSkill || !obsRating}
            >
              記錄
            </Button>
          </div>
        )}

        {mode === "assessment" && (
          <div className="space-y-3">
            <Input
              autoFocus
              value={asTitle}
              placeholder="評量名稱，例如：Vocabulary Quiz"
              onChange={(e) => setAsTitle(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={asTotal}
                onChange={(e) => setAsTotal(e.target.value)}
                className="w-28"
                aria-label="滿分"
              />
              <span className="text-sm text-muted-foreground">滿分</span>
            </div>
            <Button className="w-full" onClick={submitAssessment}>建立並輸入分數</Button>
          </div>
        )}

        {mode === "homework" && (
          <div className="space-y-3">
            <Input
              autoFocus
              value={hwText}
              placeholder="例如：講義 P.26–30"
              onChange={(e) => setHwText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitHomework()}
            />
            <p className="text-xs text-muted-foreground">
              繳交時間預設為次堂課 · {ws.scenario.nextClassLabel}
            </p>
            <Button className="w-full" onClick={submitHomework} disabled={!hwText.trim()}>
              設為次堂作業
            </Button>
          </div>
        )}

        {mode === "digital" && (
          <div className="space-y-3">
            <Select value={digId} onValueChange={setDigId}>
              <SelectTrigger><SelectValue placeholder="選擇平台活動" /></SelectTrigger>
              <SelectContent>
                {PLATFORM_ACTIVITIES.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={submitDigital} disabled={!digId}>指派</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
