import { ClozeQuestion } from '@/types/exam';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  question: ClozeQuestion;
  answer: Record<number, string>;
  onAnswerChange: (answer: Record<number, string>) => void;
}

export const ClozeRenderer = ({ question, answer = {}, onAnswerChange }: Props) => {
  const handleBlankAnswer = (blankNumber: number, value: string) => {
    onAnswerChange({ ...answer, [blankNumber]: value });
  };

  // 渲染段落，將 {{1}}, {{2}} 轉換為空格標記
  const renderPassage = () => {
    let text = question.passage;
    question.questions.forEach((q) => {
      text = text.replace(`{{${q.blankNumber}}}`, `__(${q.blankNumber})__`);
    });
    return text;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">文章</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap leading-relaxed">{renderPassage()}</p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {question.questions.map((q) => (
          <div key={q.blankNumber} className="space-y-3">
            <h4 className="font-semibold">第 {q.blankNumber} 題</h4>
            <RadioGroup
              value={answer[q.blankNumber] || ''}
              onValueChange={(value) => handleBlankAnswer(q.blankNumber, value)}
            >
              <div className="grid gap-2 md:grid-cols-2">
                {q.options.map((option) => (
                  <div
                    key={option.label}
                    className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem
                      value={option.label}
                      id={`${question.id}-${q.blankNumber}-${option.label}`}
                    />
                    <Label
                      htmlFor={`${question.id}-${q.blankNumber}-${option.label}`}
                      className="flex-1 cursor-pointer"
                    >
                      ({option.label}) {option.text}
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          </div>
        ))}
      </div>
    </div>
  );
};
