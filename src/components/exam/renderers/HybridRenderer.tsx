import { HybridQuestion } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  question: HybridQuestion;
  answer: Record<number, any>;
  onAnswerChange: (answer: Record<number, any>) => void;
}

export const HybridRenderer = ({ question, answer = {}, onAnswerChange }: Props) => {
  const handleAnswer = (questionNumber: number, value: any) => {
    onAnswerChange({ ...answer, [questionNumber]: value });
  };

  const handleMultipleChoice = (questionNumber: number, optionLabel: string, checked: boolean) => {
    const current = answer[questionNumber] || [];
    const newValue = checked
      ? [...current, optionLabel]
      : current.filter((v: string) => v !== optionLabel);
    handleAnswer(questionNumber, newValue);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">閱讀文章</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap leading-relaxed">{question.passage}</p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {question.questions.map((q) => (
          <Card key={q.questionNumber}>
            <CardHeader>
              <CardTitle className="text-base">
                第 {q.questionNumber} 題：{q.question}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {q.questionType === 'single-choice' && q.options && (
                <RadioGroup
                  value={answer[q.questionNumber] || ''}
                  onValueChange={(value) => handleAnswer(q.questionNumber, value)}
                >
                  <div className="space-y-3">
                    {q.options.map((option) => (
                      <div
                        key={option.label}
                        className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                      >
                        <RadioGroupItem
                          value={option.label}
                          id={`${question.id}-q${q.questionNumber}-${option.label}`}
                        />
                        <Label
                          htmlFor={`${question.id}-q${q.questionNumber}-${option.label}`}
                          className="flex-1 cursor-pointer"
                        >
                          ({option.label}) {option.text}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              )}

              {q.questionType === 'multiple-choice' && q.options && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-3">（可複選）</p>
                  {q.options.map((option) => (
                    <div
                      key={option.label}
                      className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`${question.id}-q${q.questionNumber}-${option.label}`}
                        checked={(answer[q.questionNumber] || []).includes(option.label)}
                        onCheckedChange={(checked) =>
                          handleMultipleChoice(q.questionNumber, option.label, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={`${question.id}-q${q.questionNumber}-${option.label}`}
                        className="flex-1 cursor-pointer"
                      >
                        ({option.label}) {option.text}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {q.questionType === 'text-input' && (
                <Input
                  placeholder="請輸入答案"
                  value={answer[q.questionNumber] || ''}
                  onChange={(e) => handleAnswer(q.questionNumber, e.target.value)}
                  className="mt-2"
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
