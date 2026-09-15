import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { promptBody, promptHeadline, type SpeakingPrompt } from "@/lib/speaking/types";

interface PromptCardProps {
  prompt: SpeakingPrompt;
  selected: boolean;
  onSelect: (prompt: SpeakingPrompt) => void;
}

/** Part 幾，以及那個 part 大概要講多久——選題時最需要知道的兩件事。 */
const PART_LABEL: Record<number, string> = {
  1: "Part 1 · 簡答",
  2: "Part 2 · 個人陳述",
  3: "Part 3 · 深入討論",
};

export function PromptCard({ prompt, selected, onSelect }: PromptCardProps) {
  const body = promptBody(prompt);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(prompt)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(prompt);
        }
      }}
      className={cn(
        "p-6 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected && "border-primary ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <Badge variant="secondary" className="shrink-0">
          {PART_LABEL[prompt.part] ?? `Part ${prompt.part}`}
        </Badge>
        {selected && <Check className="h-5 w-5 text-primary shrink-0" />}
      </div>

      <h3 className="font-semibold text-foreground mb-2 break-words">
        {promptHeadline(prompt)}
      </h3>

      {body && (
        <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{body}</p>
      )}

      {prompt.part === 2 && prompt.bullets.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {prompt.bullets.map((bullet, index) => (
            <li key={index} className="flex gap-2">
              <span className="text-primary shrink-0">·</span>
              <span className="break-words">{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
