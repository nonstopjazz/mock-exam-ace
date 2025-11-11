import { ReadingSet } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Props {
  question: ReadingSet;
  answer: Record<number, string>;
  onAnswerChange: (answer: Record<number, string>) => void;
}

export const ReadingRenderer = ({ question, answer = {}, onAnswerChange }: Props) => {
  const handleQuestionAnswer = (questionNumber: number, value: string) => {
    onAnswerChange({ ...answer, [questionNumber]: value });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          {question.title && <CardTitle>{question.title}</CardTitle>}
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap leading-relaxed text-base">{question.passage}</p>
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
              <RadioGroup
                value={answer[q.questionNumber] || ''}
                onValueChange={(value) => handleQuestionAnswer(q.questionNumber, value)}
              >
                <div className="space-y-3">
                  {q.options.map((option) => (
                    <div
                      key={option.label}
                      className="flex items-start space-x-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
                    >
                      <RadioGroupItem
                        value={option.label}
                        id={`${question.id}-q${q.questionNumber}-${option.label}`}
                        className="mt-0.5"
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
