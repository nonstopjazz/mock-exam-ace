import { ReadingSet } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Props {
  question: ReadingSet;
  answer: Record<number, string>;
  onAnswerChange: (answer: Record<number, string>) => void;
}

// 解析文章內容，將 [IMG:url] 標記轉換為圖片元素
const renderPassageWithImages = (passage: string) => {
  // 匹配 [IMG:url] 格式
  const imgRegex = /\[IMG:(https?:\/\/[^\]]+)\]/g;
  const parts: (string | { type: 'image'; url: string })[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imgRegex.exec(passage)) !== null) {
    // 加入圖片前的文字
    if (match.index > lastIndex) {
      parts.push(passage.slice(lastIndex, match.index));
    }
    // 加入圖片
    parts.push({ type: 'image', url: match[1] });
    lastIndex = match.index + match[0].length;
  }

  // 加入最後一段文字
  if (lastIndex < passage.length) {
    parts.push(passage.slice(lastIndex));
  }

  return parts.map((part, index) => {
    if (typeof part === 'string') {
      return (
        <span key={index} className="whitespace-pre-wrap">
          {part}
        </span>
      );
    } else {
      return (
        <img
          key={index}
          src={part.url}
          alt="文章圖片"
          className="inline-block max-w-full my-4 rounded-lg border bg-muted"
          style={{ maxHeight: '400px', objectFit: 'contain' }}
        />
      );
    }
  });
};

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
        <CardContent className="space-y-4">
          {/* Passage Image (若有獨立的文章圖片欄位) */}
          {question.passageImage && (
            <div className="rounded-lg overflow-hidden border bg-muted">
              <img
                src={question.passageImage}
                alt="文章圖片"
                className="w-full max-h-96 object-contain"
              />
            </div>
          )}
          {/* 文章內容（支援 [IMG:url] 行內圖片標記） */}
          <div className="leading-relaxed text-base">
            {renderPassageWithImages(question.passage)}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {question.questions.map((q) => {
          const isImageOptions = q.optionsType === 'image';

          return (
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
                  <div className={isImageOptions ? "grid grid-cols-2 gap-4" : "space-y-3"}>
                    {q.options.map((option) => {
                      const imageUrl = option.imageUrl || (isImageOptions ? option.text : null);
                      const isImage = isImageOptions && imageUrl?.startsWith('http');

                      return (
                        <div
                          key={option.label}
                          className={`flex ${isImage ? 'flex-col' : 'items-start'} space-x-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors cursor-pointer`}
                          onClick={() => handleQuestionAnswer(q.questionNumber, option.label)}
                        >
                          <div className={`flex items-center ${isImage ? 'mb-2' : ''} gap-2`}>
                            <RadioGroupItem
                              value={option.label}
                              id={`${question.id}-q${q.questionNumber}-${option.label}`}
                            />
                            <Label
                              htmlFor={`${question.id}-q${q.questionNumber}-${option.label}`}
                              className="font-medium cursor-pointer"
                            >
                              ({option.label})
                            </Label>
                          </div>
                          {isImage ? (
                            <img
                              src={imageUrl!}
                              alt={`選項 ${option.label}`}
                              className="w-full h-32 object-contain rounded border bg-muted"
                            />
                          ) : (
                            <Label
                              htmlFor={`${question.id}-q${q.questionNumber}-${option.label}`}
                              className="flex-1 cursor-pointer"
                            >
                              {option.text}
                            </Label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
