import { SentenceOrderingQuestion } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface Props {
  question: SentenceOrderingQuestion;
  answer: Record<number, string>;
  onAnswerChange: (answer: Record<number, string>) => void;
}

export const SentenceOrderingRenderer = ({ question, answer = {}, onAnswerChange }: Props) => {
  const handleBlankAnswer = (blankNumber: number, value: string) => {
    onAnswerChange({ ...answer, [blankNumber]: value });
  };

  const renderPassage = () => {
    let text = question.passage;
    question.blanks.forEach((blank) => {
      const selected = answer[blank.blankNumber] || '___';
      text = text.replace(`{{${blank.blankNumber}}}`, `\n\n__(${blank.blankNumber}: ${selected})__\n\n`);
    });
    return text;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">說明：請將適當的句子填入文章空格中</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {question.sentences.map((sentence) => (
              <div key={sentence.label} className="rounded-lg border border-border p-3">
                <Badge variant="outline" className="mb-2">
                  {sentence.label}
                </Badge>
                <p className="text-sm">{sentence.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">文章</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap leading-relaxed">{renderPassage()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">作答區</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {question.blanks.map((blank) => (
              <div key={blank.blankNumber} className="flex items-center gap-3">
                <span className="font-semibold min-w-[60px]">空格 {blank.blankNumber}:</span>
                <Select
                  value={answer[blank.blankNumber] || ''}
                  onValueChange={(value) => handleBlankAnswer(blank.blankNumber, value)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="請選擇句子" />
                  </SelectTrigger>
                  <SelectContent>
                    {question.sentences.map((sentence) => (
                      <SelectItem key={sentence.label} value={sentence.label}>
                        ({sentence.label})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
