import { Question } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';

interface Props {
  question: Question;
  studentAnswer?: any;
}

export const ExplanationQuestion = ({ question, studentAnswer }: Props) => {
  const renderMultipleChoice = () => {
    if (question.type !== 'multiple-choice') return null;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {question.question}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {question.options.map((option) => {
            const isCorrect = option.label === question.correctAnswer;
            const isStudentAnswer = option.label === studentAnswer;
            
            return (
              <div
                key={option.label}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors ${
                  isCorrect
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                    : isStudentAnswer
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                    : 'border-border bg-background'
                }`}
              >
                <div className="flex items-center gap-2 min-w-[80px]">
                  <span className="font-semibold">({option.label})</span>
                  {isCorrect && (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                      <Check className="h-3 w-3 mr-1" />
                      正解
                    </Badge>
                  )}
                  {isStudentAnswer && !isCorrect && (
                    <Badge variant="destructive">
                      <X className="h-3 w-3 mr-1" />
                      你的答案
                    </Badge>
                  )}
                  {isStudentAnswer && isCorrect && (
                    <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                      你的答案
                    </Badge>
                  )}
                </div>
                <p className="flex-1 text-base">{option.text}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  const renderCloze = () => {
    if (question.type !== 'cloze') return null;
    
    return (
      <div className="space-y-4">
        {question.questions.map((q) => {
          const isCorrect = q.correctAnswer === studentAnswer?.[q.blankNumber];
          const studentAns = studentAnswer?.[q.blankNumber];
          
          return (
            <Card key={q.blankNumber}>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  第 {q.blankNumber} 空格
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {q.options.map((option) => {
                  const isCorrectOption = option.label === q.correctAnswer;
                  const isStudentOption = option.label === studentAns;
                  
                  return (
                    <div
                      key={option.label}
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors ${
                        isCorrectOption
                          ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                          : isStudentOption
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                          : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <span className="font-semibold">({option.label})</span>
                        {isCorrectOption && (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                            <Check className="h-3 w-3 mr-1" />
                            正解
                          </Badge>
                        )}
                        {isStudentOption && !isCorrectOption && (
                          <Badge variant="destructive">
                            <X className="h-3 w-3 mr-1" />
                            你的答案
                          </Badge>
                        )}
                        {isStudentOption && isCorrectOption && (
                          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                            你的答案
                          </Badge>
                        )}
                      </div>
                      <p className="flex-1 text-base">{option.text}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderReading = () => {
    if (question.type !== 'reading') return null;
    
    return (
      <div className="space-y-4">
        {question.questions.map((q) => {
          const isCorrect = q.correctAnswer === studentAnswer?.[q.questionNumber];
          const studentAns = studentAnswer?.[q.questionNumber];
          
          return (
            <Card key={q.questionNumber}>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  第 {q.questionNumber} 題：{q.question}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {q.options.map((option) => {
                  const isCorrectOption = option.label === q.correctAnswer;
                  const isStudentOption = option.label === studentAns;
                  
                  return (
                    <div
                      key={option.label}
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors ${
                        isCorrectOption
                          ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                          : isStudentOption
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                          : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <span className="font-semibold">({option.label})</span>
                        {isCorrectOption && (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                            <Check className="h-3 w-3 mr-1" />
                            正解
                          </Badge>
                        )}
                        {isStudentOption && !isCorrectOption && (
                          <Badge variant="destructive">
                            <X className="h-3 w-3 mr-1" />
                            你的答案
                          </Badge>
                        )}
                        {isStudentOption && isCorrectOption && (
                          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                            你的答案
                          </Badge>
                        )}
                      </div>
                      <p className="flex-1 text-base">{option.text}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {question.type === 'multiple-choice' && renderMultipleChoice()}
      {question.type === 'cloze' && renderCloze()}
      {question.type === 'reading' && renderReading()}
      {/* 其他題型可以在這裡繼續添加 */}
    </div>
  );
};
