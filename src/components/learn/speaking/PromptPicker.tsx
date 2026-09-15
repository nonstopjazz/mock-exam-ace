import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertCircle, Loader2, Mic, Search, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeakingPrompts } from "@/hooks/learn/useSpeakingPrompts";
import { PromptRow } from "./PromptRow";
import type { SpeakingPrompt } from "@/lib/speaking/types";

interface PromptPickerProps {
  practiced: Set<string>;
  onSelect: (prompt: SpeakingPrompt) => void;
}

const PARTS = [
  { value: 1, label: "Part 1", hint: "簡答" },
  { value: 2, label: "Part 2", hint: "個人陳述" },
  { value: 3, label: "Part 3", hint: "深入討論" },
] as const;

/**
 * 主題的進度點：沒碰過 / 練了一些 / 全部練完。
 *
 * 101 個主題排下來，「8/8」和「0/8」在掃視時長得一樣——要逐個讀數字才分得出來。
 * 一個顏色點讓「哪些還沒碰」變成一眼的事，數字留給想知道確切進度的人。
 */
function TopicDot({ done, total }: { done: number; total: number }) {
  const state = done === 0 ? "none" : done >= total ? "all" : "some";
  return (
    <span
      aria-label={state === "all" ? "全部練過" : state === "some" ? "練了一部分" : "還沒練過"}
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        state === "all" && "bg-success",
        state === "some" && "bg-primary",
        state === "none" && "border border-muted-foreground/40",
      )}
    />
  );
}

/** 一題在清單裡顯示的那一行字。Part 2 是題卡標題，Part 1/3 是問題本身。 */
const labelOf = (prompt: SpeakingPrompt) =>
  prompt.part === 2 ? prompt.title?.trim() || "（沒有標題）" : prompt.question?.trim() || "";

/**
 * 選題 —— Part 分頁籤 → 主題（收合）→ 題目。
 *
 * 【為什麼是這個形狀】
 *
 *   題庫有 1,945 題：Part 1 有 801 題分在 101 個主題，Part 3 有 1,043 題分在
 *   79 個主題。任何「把題目全部攤出來」的版面在這個量級都不能用——
 *   不是慢，是找不到東西。
 *
 *   所以：一次只載入一個 Part（161 KB，不是整份 451 KB），主題預設全部收合，
 *   展開才渲染底下的題目。一開始畫面上只有 101 行主題，不是 801 行題目。
 *
 *   Part 2 沒有主題（它的識別就是題卡標題），101 題直接列。
 *
 * 【搜尋為什麼是必要的而不是加分】
 *
 *   學生想練「音樂」相關的題目時，不會想在 101 個主題裡一個個展開找。
 *   搜尋時直接列出命中的題目、跳過主題那一層——這時候分組只會礙事。
 */
export function PromptPicker({ practiced, onSelect }: PromptPickerProps) {
  const [part, setPart] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const { prompts, loading, error, refetch } = useSpeakingPrompts(part);

  // 換 Part 就清掉搜尋。留著上一個 Part 的關鍵字，換過去會看到一片空白，
  // 而原因（還有字在搜尋框裡）在畫面上不明顯。
  useEffect(() => setQuery(""), [part]);

  const needle = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!needle) return prompts;
    return prompts.filter((p) =>
      [p.topic, p.question, p.title, p.cue, ...(p.bullets ?? [])]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    );
  }, [prompts, needle]);

  /** 依主題分組，保留原本的順序（sort_order 匯入時已經依主題重編過）。 */
  const topics = useMemo(() => {
    const map = new Map<string, SpeakingPrompt[]>();
    for (const prompt of matches) {
      const key = prompt.topic?.trim() || "其他";
      const list = map.get(key);
      if (list) list.push(prompt);
      else map.set(key, [prompt]);
    }
    return [...map.entries()].map(([name, list]) => ({
      name,
      list,
      done: list.filter((p) => practiced.has(p.id)).length,
    }));
  }, [matches, practiced]);

  const doneCount = matches.filter((p) => practiced.has(p.id)).length;

  /** 跳到第一題還沒練過的。在上千題裡，這是最常按的那顆按鈕。 */
  const nextUnpracticed = () => {
    const next = matches.find((p) => !practiced.has(p.id));
    if (next) onSelect(next);
  };

  const flat = part === 2 || needle.length > 0;

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">選一題</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "載入中…" : `${matches.length} 題，已練過 ${doneCount} 題`}
          </p>
        </div>
        <Tabs value={String(part)} onValueChange={(v) => setPart(Number(v) as 1 | 2 | 3)}>
          <TabsList>
            {PARTS.map((option) => (
              <TabsTrigger key={option.value} value={String(option.value)}>
                {option.label}
                <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
                  {option.hint}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋題目或主題"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={nextUnpracticed}
          disabled={loading || doneCount === matches.length}
          className="shrink-0"
        >
          <SkipForward className="h-4 w-4" />
          <span className="hidden sm:inline">下一題沒練過的</span>
          <span className="sm:hidden">沒練過的</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              重新載入
            </Button>
          </AlertDescription>
        </Alert>
      ) : matches.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Mic className="mx-auto mb-4 h-12 w-12 opacity-40" />
          <p>{needle ? "沒有符合的題目" : "這個 Part 還沒有題目"}</p>
          <p className="mt-2 text-sm">
            {needle ? "換個關鍵字，或清空搜尋看全部" : "老師新增題目之後就會出現在這裡"}
          </p>
        </div>
      ) : (
        // 固定高度的捲動框：底下還有錄音面板與練習紀錄，
        // 讓清單把整頁撐長會讓人以為頁面只有這一塊。
        <div className="max-h-[26rem] overflow-y-auto rounded-md border border-border">
          {flat ? (
            <div className="p-1">
              {matches.map((prompt) => (
                <PromptRow
                  key={prompt.id}
                  label={labelOf(prompt)}
                  meta={prompt.topic?.trim() || undefined}
                  practiced={practiced.has(prompt.id)}
                  active={false}
                  onSelect={() => onSelect(prompt)}
                />
              ))}
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {topics.map((topic) => (
                <AccordionItem key={topic.name} value={topic.name} className="px-2">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex w-full items-center gap-2 pr-2 min-w-0">
                      <TopicDot done={topic.done} total={topic.list.length} />
                      <span className="min-w-0 flex-1 text-left text-sm font-medium truncate">
                        {topic.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {topic.done}/{topic.list.length}
                      </span>
                    </div>
                  </AccordionTrigger>
                  {/* 收合時 Radix 不會渲染裡面的內容——101 個主題只有 101 行，
                      不是 801 行題目。這就是這一頁能用的原因。 */}
                  <AccordionContent>
                    <div className="pb-1">
                      {topic.list.map((prompt) => (
                        <PromptRow
                          key={prompt.id}
                          label={labelOf(prompt)}
                          practiced={practiced.has(prompt.id)}
                          active={false}
                          onSelect={() => onSelect(prompt)}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {flat ? `共 ${matches.length} 題` : `${topics.length} 個主題，點開看題目`}
        </p>
      )}
    </Card>
  );
}
