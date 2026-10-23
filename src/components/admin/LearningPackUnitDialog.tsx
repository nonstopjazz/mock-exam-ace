import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  MODES_FOR_TASK, TASK_KIND_LABEL, TASK_KIND_RULE, VOCAB_MODE_LABEL,
  VOCAB_MODE_UNAVAILABLE,
  type ActivityType, type PackSources, type PackUnit, type TaskKind, type VocabMode,
} from "@/lib/learn/learningPacks";

/**
 * 新增／編輯單元。
 *
 * 🛑 來源的「可用數量」要一直看得到，而且在要完成的數量超過它的時候
 *    當場就講。不講的話，老師會一路設定到按下發布才被擋，
 *    而那時候已經忘記是哪一個單元設過頭了。
 */

const QUIZ_MODES = MODES_FOR_TASK.quiz;

export function LearningPackUnitDialog({
  open, onOpenChange, unit, sources, saving, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = 新增 */
  unit: PackUnit | null;
  sources: PackSources | null;
  saving: boolean;
  onSave: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  const [activity, setActivity] = useState<ActivityType>("reading");
  const [passageId, setPassageId] = useState<string>("");
  const [vocabPackId, setVocabPackId] = useState<string>("");
  const [taskKind, setTaskKind] = useState<TaskKind>("reading");
  const [mode, setMode] = useState<VocabMode>("quick_quiz");
  const [target, setTarget] = useState<string>("");
  const [title, setTitle] = useState("");
  /** 老師自己改過標題之後，換來源就不要再覆蓋他寫的字 */
  const [titleTouched, setTitleTouched] = useState(false);

  // 開啟時重置。不重置的話，連續新增第二個單元會帶著上一個的設定。
  useEffect(() => {
    if (!open) return;
    setActivity(unit?.activity_type ?? "reading");
    setPassageId(unit?.reading_passage_id ?? "");
    setVocabPackId(unit?.vocab_pack_id ?? "");
    setTaskKind(unit?.task_kind ?? "reading");
    setMode(unit?.vocab_mode ?? "quick_quiz");
    setTarget(unit?.target_count != null ? String(unit.target_count) : "");
    setTitle(unit?.title ?? "");
    setTitleTouched(unit != null);
  }, [open, unit]);

  // 🛑 這兩個要 memo 在 sources 上，不是寫成 `sources?.passages ?? []`。
  //    後者每次 render 都是一個新陣列，下面的 useMemo 依賴它就永遠失效。
  const passages = useMemo(() => sources?.passages ?? [], [sources]);
  const vocabPacks = useMemo(() => sources?.vocab_packs ?? [], [sources]);

  /** 目前選到的來源有多少可用內容。沒選來源時是 null */
  const available = useMemo(() => {
    if (activity === "reading") {
      return passages.find((p) => p.passage_id === passageId)?.question_count ?? null;
    }
    return vocabPacks.find((p) => p.id === vocabPackId)?.item_count ?? null;
  }, [activity, passageId, vocabPackId, passages, vocabPacks]);

  const sourceTitle = useMemo(() => {
    if (activity === "reading") {
      return passages.find((p) => p.passage_id === passageId)?.title ?? "";
    }
    return vocabPacks.find((p) => p.id === vocabPackId)?.title ?? "";
  }, [activity, passageId, vocabPackId, passages, vocabPacks]);

  // 還沒自己取名字的話，跟著來源走
  useEffect(() => {
    if (!titleTouched && sourceTitle) setTitle(sourceTitle);
  }, [sourceTitle, titleTouched]);

  /** 換活動型態時，把任務型態帶到合法的值 —— 否則會送出資料表擋得下的組合 */
  const onActivityChange = (next: ActivityType) => {
    setActivity(next);
    if (next === "reading") setTaskKind("reading");
    else if (taskKind === "reading") { setTaskKind("quiz"); setMode("quick_quiz"); }
  };

  const onTaskKindChange = (next: TaskKind) => {
    setTaskKind(next);
    if (next === "exposure") setMode("flashcard");
    else if (next === "srs") setMode("srs");
    else if (next === "quiz" && !QUIZ_MODES.includes(mode)) setMode("quick_quiz");
  };

  const targetNum = target.trim() === "" ? null : Number(target);
  const targetInvalid = targetNum !== null && (!Number.isInteger(targetNum) || targetNum < 1);
  const targetTooBig = targetNum !== null && available !== null && targetNum > available;

  const sourceChosen = activity === "reading" ? passageId !== "" : vocabPackId !== "";
  const canSave = title.trim() !== "" && sourceChosen && !targetInvalid && !saving;

  const submit = async () => {
    const ok = await onSave({
      p_unit_id: unit?.id ?? null,
      p_title: title.trim(),
      p_activity_type: activity,
      p_reading_passage_id: activity === "reading" ? passageId : null,
      p_vocab_pack_id: activity === "vocab" ? vocabPackId : null,
      p_vocab_mode: activity === "vocab" ? mode : null,
      p_task_kind: taskKind,
      p_target_count: targetNum,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{unit ? "編輯單元" : "新增單元"}</DialogTitle>
          <DialogDescription>
            單元是對既有教材的引用，不會複製一份內容。改動原本的文章或單字集，這裡就跟著變。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── 活動型態 ─────────────────────────── */}
          <div className="space-y-2">
            <Label>這個單元要做什麼</Label>
            <RadioGroup
              value={activity}
              onValueChange={(v) => onActivityChange(v as ActivityType)}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="act-reading"
                className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem value="reading" id="act-reading" />
                <span className="font-normal">讀一篇文章</span>
              </Label>
              <Label
                htmlFor="act-vocab"
                className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem value="vocab" id="act-vocab" />
                <span className="font-normal">練一組單字</span>
              </Label>
            </RadioGroup>
          </div>

          {/* ── 來源 ─────────────────────────────── */}
          {activity === "reading" ? (
            <div className="space-y-2">
              <Label htmlFor="unit-passage">選一篇文章</Label>
              <Select value={passageId} onValueChange={setPassageId}>
                <SelectTrigger id="unit-passage">
                  <SelectValue placeholder="選擇閱讀文章" />
                </SelectTrigger>
                <SelectContent>
                  {passages.map((p) => (
                    <SelectItem key={p.passage_id} value={p.passage_id}>
                      {p.title}（{p.question_count} 題{p.cefr_level ? ` · ${p.cefr_level}` : ""}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {passages.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  還沒有閱讀文章可以選。先到「閱讀文章」匯入或建立。
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="unit-vocab">選一組單字集</Label>
              <Select value={vocabPackId} onValueChange={setVocabPackId}>
                <SelectTrigger id="unit-vocab">
                  <SelectValue placeholder="選擇單字集" />
                </SelectTrigger>
                <SelectContent>
                  {vocabPacks.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}（{p.item_count} 個字）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 🛑 空的單字集照列（RPC 不過濾），所以這裡要講得出它是空的 */}
              {available === 0 ? (
                <p className="text-xs text-accent">
                  這組單字集目前是空的，單元會出不了題，發布時會被擋下來。
                </p>
              ) : null}
            </div>
          )}

          {/* ── 任務型態（只有單字有得選）────────────── */}
          {activity === "vocab" ? (
            <div className="space-y-2">
              <Label htmlFor="unit-task">怎麼算做完</Label>
              <Select value={taskKind} onValueChange={(v) => onTaskKindChange(v as TaskKind)}>
                <SelectTrigger id="unit-task"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["exposure", "srs", "quiz"] as const).map((k) => (
                    <SelectItem key={k} value={k}>{TASK_KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TASK_KIND_RULE[taskKind]}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{TASK_KIND_RULE.reading}</p>
          )}

          {/* ── 練習模式。檢核型才有得挑，其餘是綁定的 ────── */}
          {activity === "vocab" && taskKind === "quiz" ? (
            <div className="space-y-2">
              <Label htmlFor="unit-mode">用哪一種練習</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as VocabMode)}>
                <SelectTrigger id="unit-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUIZ_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{VOCAB_MODE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 🛑 說得出為什麼少了一個選項。只是不列的話，會被當成漏掉 */}
              <p className="text-xs text-muted-foreground">
                沒有「{VOCAB_MODE_LABEL.synonym_antonym}」是因為
                {VOCAB_MODE_UNAVAILABLE.synonym_antonym}。
              </p>
            </div>
          ) : activity === "vocab" ? (
            <p className="text-xs text-muted-foreground">
              使用「{VOCAB_MODE_LABEL[mode]}」。
            </p>
          ) : null}

          {/* ── 數量 ─────────────────────────────── */}
          {activity === "vocab" ? (
            <div className="space-y-2">
              <Label htmlFor="unit-target">
                {taskKind === "quiz" ? "要答幾題" : "要完成幾個字"}
              </Label>
              <Input
                id="unit-target"
                type="number"
                min={1}
                inputMode="numeric"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={available != null ? `留空 = 全部（${available}）` : "留空 = 全部"}
                aria-describedby="unit-target-help"
              />
              <p id="unit-target-help" className="text-xs text-muted-foreground">
                {available != null ? `這組單字集有 ${available} 個字。` : ""}
                留空代表全部。
              </p>
              {targetInvalid ? (
                <p className="text-xs text-destructive">要填 1 以上的整數。</p>
              ) : null}
              {targetTooBig ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    設定要完成 {targetNum} 個，但來源只有 {available} 個 ——
                    學生永遠做不完，發布時會被擋下來。
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {/* ── 標題 ─────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="unit-title">單元標題</Label>
            <Input
              id="unit-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
              placeholder="學生在學習路徑上看到的字"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          {/* 🛑 超量【不】擋存檔，只警告：老師可能是先排好、等單字集補齊。
                 真正的攔截點是發布。 */}
          <Button onClick={submit} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {unit ? "儲存" : "加入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
