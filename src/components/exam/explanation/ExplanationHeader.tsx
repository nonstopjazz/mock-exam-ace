import { Question } from '@/types/exam';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';

interface Props {
  question: Question;
  questionNumber: number;
}

const getQuestionTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'multiple-choice': '單選題',
    'cloze': '克漏字',
    'fill-in-blank': '文意選填',
    'sentence-ordering': '篇章結構',
    'reading': '閱讀測驗',
    'hybrid': '混合題',
    'translation': '翻譯',
    'essay': '作文',
  };
  return labels[type] || type;
};

const getQuestionTypeVariant = (type: string): 'default' | 'secondary' | 'outline' => {
  if (['multiple-choice', 'cloze'].includes(type)) return 'default';
  if (['fill-in-blank', 'sentence-ordering', 'reading'].includes(type)) return 'secondary';
  return 'outline';
};

export const ExplanationHeader = ({ question, questionNumber }: Props) => {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-2xl font-bold">第 {questionNumber} 題</h2>
          <Badge variant={getQuestionTypeVariant(question.type)} className="text-sm">
            {getQuestionTypeLabel(question.type)}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          配分：{question.points} 分
        </div>
      </CardHeader>
    </Card>
  );
};
