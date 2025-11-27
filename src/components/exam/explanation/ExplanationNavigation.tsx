import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';

interface Props {
  currentQuestionIndex: number;
  totalQuestions: number;
  onPrevious: () => void;
  onNext: () => void;
  onBackToResults: () => void;
}

export const ExplanationNavigation = ({
  currentQuestionIndex,
  totalQuestions,
  onPrevious,
  onNext,
  onBackToResults,
}: Props) => {
  const isFirst = currentQuestionIndex === 0;
  const isLast = currentQuestionIndex === totalQuestions - 1;

  return (
    <Card className="sticky bottom-0 z-10 shadow-lg">
      <div className="flex items-center justify-between p-4 gap-4">
        <Button
          variant="outline"
          onClick={onPrevious}
          disabled={isFirst}
          className="flex-1 max-w-[150px]"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          上一題
        </Button>

        <div className="flex flex-col items-center gap-2 flex-1">
          <Button
            variant="ghost"
            onClick={onBackToResults}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            返回結果頁
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {currentQuestionIndex + 1} / {totalQuestions} 題
          </span>
        </div>

        <Button
          variant="outline"
          onClick={onNext}
          disabled={isLast}
          className="flex-1 max-w-[150px]"
        >
          下一題
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
};
