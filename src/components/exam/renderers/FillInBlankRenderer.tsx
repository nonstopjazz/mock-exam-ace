import { FillInTheBlankSet } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  question: FillInTheBlankSet;
  answer: Record<number, string>;
  onAnswerChange: (answer: Record<number, string>) => void;
}

export const FillInBlankRenderer = ({ question, answer = {}, onAnswerChange }: Props) => {
  const handleBlankAnswer = (blankNumber: number, value: string) => {
    onAnswerChange({ ...answer, [blankNumber]: value });
  };

  const renderPassage = () => {
    let text = question.passage;
    question.blanks.forEach((blank) => {
      const selectedOption = answer[blank.blankNumber] || '___';
      text = text.replace(`{{${blank.blankNumber}}}`, `__(${blank.blankNumber}: ${selectedOption})__`);
    });
    return text;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">說明：請從選項中選擇適當的字詞填入空格</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {question.optionPool.map((option) => (
              <Badge key={option.label} variant="outline" className="text-sm">
                ({option.label}) {option.text}
              </Badge>
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
                    <SelectValue placeholder="請選擇" />
                  </SelectTrigger>
                  <SelectContent>
                    {question.optionPool.map((option) => (
                      <SelectItem key={option.label} value={option.label}>
                        ({option.label}) {option.text}
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
