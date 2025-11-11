import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Question } from "@/types/exam";
import { Check, Clock } from "lucide-react";

interface AnswerMapProps {
  questions: Question[];
  currentIndex: number;
  answers: Record<string, any>;
  onQuestionClick: (index: number) => void;
}

export const AnswerMap = ({
  questions,
  currentIndex,
  answers,
  onQuestionClick,
}: AnswerMapProps) => {
  const getQuestionStatus = (question: Question) => {
    const hasAnswer = answers[question.id] !== undefined && answers[question.id] !== null;
    
    // 檢查不同題型的答案是否完整
    if (question.type === 'fill-in-blank' || question.type === 'sentence-ordering') {
      const answerObj = answers[question.id];
      if (typeof answerObj === 'object' && answerObj !== null) {
        const answerCount = Object.keys(answerObj).length;
        const requiredCount = question.type === 'fill-in-blank' ? 10 : 4;
        return answerCount === requiredCount;
      }
      return false;
    }
    
    if (question.type === 'cloze' || question.type === 'reading' || question.type === 'hybrid') {
      const answerObj = answers[question.id];
      if (typeof answerObj === 'object' && answerObj !== null) {
        return Object.keys(answerObj).length === question.questions.length;
      }
      return false;
    }
    
    if (question.type === 'translation' || question.type === 'essay') {
      return hasAnswer && String(answers[question.id]).trim().length > 0;
    }
    
    return hasAnswer;
  };

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-4 w-4" />
          答題卡
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">總題數</span>
          <Badge variant="outline">{questions.length}</Badge>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">已作答</span>
          <Badge variant="default">
            {questions.filter((q) => getQuestionStatus(q)).length}
          </Badge>
        </div>

        <div className="border-t pt-4">
          <div className="grid grid-cols-5 gap-2">
            {questions.map((question, index) => {
              const isAnswered = getQuestionStatus(question);
              const isCurrent = index === currentIndex;

              return (
                <Button
                  key={question.id}
                  variant={isCurrent ? "default" : isAnswered ? "secondary" : "outline"}
                  size="sm"
                  className="relative h-10 w-full"
                  onClick={() => onQuestionClick(index)}
                >
                  {isAnswered && !isCurrent && (
                    <Check className="absolute top-1 right-1 h-3 w-3" />
                  )}
                  {index + 1}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="border-t pt-4 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-primary"></div>
            <span>當前題目</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-secondary"></div>
            <span>已作答</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border"></div>
            <span>未作答</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
