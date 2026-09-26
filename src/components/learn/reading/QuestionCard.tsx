import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, X } from "lucide-react";
import { CONSTRUCT_LABEL_ZH } from "@/lib/reading/constructs";
import type { QuestionAnswerState } from "@/lib/reading/answerState";
import type { OptionLabel, ReadingQuestion } from "@/lib/reading/studentTypes";
import type { AnsweredResult } from "@/hooks/learn/useReadingSession";

const LABELS: OptionLabel[] = ["A", "B", "C", "D"];

/**
 * 一題。送出前只有選項，送出後才有正解與解說。
 *
 * 🛑 「送出前看不到答案」不是靠這個元件藏起來——reading_get_passage
 *    的回傳裡根本沒有正解，前端沒有那份資料可以洩漏。
 *    這裡做的只是把作答【之後】拿到的東西呈現出來。
 */
export function QuestionCard({
  question, index, draft, result, submitting, onPick, onSubmit,
}: {
  question: ReadingQuestion;
  index: number;
  draft: QuestionAnswerState | undefined;
  result: AnsweredResult | undefined;
  submitting: boolean;
  onPick: (option: OptionLabel) => void;
  onSubmit: () => void;
}) {
  const locked = result !== undefined;
  const selected = result?.selected ?? draft?.selected ?? null;

  return (
    <Card className="p-6" id={`q-${question.question_id}`}>
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {index + 1}
          </span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {question.construct}・{CONSTRUCT_LABEL_ZH[question.construct]}
          </Badge>
        </div>
        {locked && (
          <Badge
            variant={result.isCorrect ? "secondary" : "destructive"}
            className="text-xs shrink-0"
          >
            {result.isCorrect ? "答對" : "答錯"}
          </Badge>
        )}
      </div>

      <p className="text-foreground mb-4 leading-relaxed">{question.question}</p>

      <div className="space-y-2 mb-4">
        {LABELS.map((label) => {
          const isSelected = selected === label;
          const isCorrect = locked && result.correctAnswer === label;
          const isWrongPick = locked && isSelected && !result.isCorrect;

          // 🛑 續做還原的那幾題沒有 correctAnswer（答案表學生讀不到）。
          //    那時只標示自己選了什麼，不假裝知道哪個是對的。
          const tone = isCorrect
            ? "border-success bg-success/10"
            : isWrongPick
              ? "border-destructive bg-destructive/10"
              : isSelected
                ? "border-primary bg-primary/5"
                : "border-border";

          return (
            <button
              key={label}
              type="button"
              disabled={locked || submitting}
              onClick={() => onPick(label)}
              className={`w-full rounded-md border-2 px-4 py-3 text-left transition-colors ${tone} ${
                locked ? "cursor-default" : "hover:border-primary/60"
              } disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
            >
              <span className="flex items-start gap-3">
                <span className="font-semibold text-foreground shrink-0">{label}</span>
                <span className="text-foreground min-w-0 flex-1">{question.options[label]}</span>
                {isCorrect && <Check className="h-5 w-5 text-success shrink-0" />}
                {isWrongPick && <X className="h-5 w-5 text-destructive shrink-0" />}
              </span>
            </button>
          );
        })}
      </div>

      {!locked && (
        <Button
          onClick={onSubmit}
          disabled={!draft?.selected || submitting}
          className="gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          送出這一題
        </Button>
      )}

      {locked && result.explanation && (
        <div className="rounded-lg bg-muted/50 p-4">
          <div className="text-sm font-medium text-foreground mb-1">解說</div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.explanation}
          </p>
        </div>
      )}
      {locked && !result.explanation && (
        <p className="text-sm text-muted-foreground">
          這一題是上次作答的，解說會在結束後的總結裡一起顯示。
        </p>
      )}
      {!locked && (
        <p className="text-xs text-muted-foreground mt-3">
          送出之後就不能改了，也會看到正解與解說。
        </p>
      )}
    </Card>
  );
}
