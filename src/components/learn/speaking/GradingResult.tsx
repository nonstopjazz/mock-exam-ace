import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp, FileText, Lightbulb, MessageSquare } from "lucide-react";
import { BandScores } from "./BandScores";
import { splitBilingual, type SpeakingPractice } from "@/lib/speaking/types";

/**
 * 一則練習的批改結果：分數 → 講評 → 建議 → 逐字稿。
 *
 * 【順序是刻意的】分數先出現，因為那是學生點開來要看的第一件事；
 * 逐字稿放最後而且預設收合——它最長，而且是用來對照的材料，不是結論。
 *
 * 中文在前、英文在後。全站的讀者是台灣高中生，先讀得懂再讀原文。
 */
function Bilingual({ text }: { text: string | null }) {
  const { en, zh } = splitBilingual(text);
  if (!zh && !en) return null;
  return (
    <div className="space-y-2">
      {zh && (
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
          {zh}
        </p>
      )}
      {en && (
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">
          {en}
        </p>
      )}
    </div>
  );
}

export function GradingResult({ practice }: { practice: SpeakingPractice }) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-4">
      <BandScores bands={practice} />

      {practice.feedback && (
        <>
          <Separator className="my-4" />
          <div className="mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-secondary" />
            <span className="text-sm font-semibold text-foreground">講評</span>
          </div>
          <Bilingual text={practice.feedback} />
        </>
      )}

      {practice.suggestions && (
        <>
          <Separator className="my-4" />
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-semibold text-foreground">下一步可以練什麼</span>
          </div>
          <Bilingual text={practice.suggestions} />
        </>
      )}

      {practice.transcript && (
        <>
          <Separator className="my-4" />
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => setShowTranscript((v) => !v)}
          >
            <FileText className="h-4 w-4" />
            逐字稿
            {showTranscript ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          {showTranscript && (
            <p className="mt-2 whitespace-pre-line break-words rounded-md bg-background p-3 text-sm leading-relaxed text-foreground">
              {practice.transcript}
            </p>
          )}
        </>
      )}

      {/* 🛑 不在這裡寫「AI 批改僅供參考」那種免責聲明——
          它出現在每一則結果上只會變成背景雜訊，真正該說的是這是什麼、
          由誰產生的，那句話放在頁面上方說一次就好。 */}
    </div>
  );
}
