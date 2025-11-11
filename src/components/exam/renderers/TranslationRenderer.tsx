import { TranslationQuestion } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  question: TranslationQuestion;
  answer: string;
  onAnswerChange: (answer: string) => void;
}

export const TranslationRenderer = ({ question, answer, onAnswerChange }: Props) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>第 {question.questionNumber} 題 翻譯（{question.points} 分）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium mb-2">中文：</p>
          <p className="text-base leading-relaxed bg-muted/30 p-4 rounded-lg">
            {question.chineseText}
          </p>
        </div>

        <div>
          <p className="font-medium mb-2">英文翻譯：</p>
          <Textarea
            placeholder="請輸入英文翻譯..."
            value={answer || ''}
            onChange={(e) => onAnswerChange(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        {question.keyPoints && (
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">評分要點參考：</p>
            <ul className="list-disc list-inside space-y-1">
              {question.keyPoints.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
