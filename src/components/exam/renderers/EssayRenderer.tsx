import { EssayTask } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';

interface Props {
  question: EssayTask;
  answer: string;
  onAnswerChange: (answer: string) => void;
}

// 解析文字內容，將 [IMG:url] 標記轉換為圖片元素
const renderTextWithImages = (text: string) => {
  const imgRegex = /\[IMG:(https?:\/\/[^\]]+)\]/g;
  const parts: (string | { type: 'image'; url: string })[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imgRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ type: 'image', url: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
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
          alt="題目圖片"
          className="inline-block max-w-full my-4 rounded-lg border bg-muted"
          style={{ maxHeight: '400px', objectFit: 'contain' }}
        />
      );
    }
  });
};

export const EssayRenderer = ({ question, answer, onAnswerChange }: Props) => {
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    const count = (answer || '').trim().split(/\s+/).filter(Boolean).length;
    setWordCount(count);
  }, [answer]);

  const isWithinLimit =
    wordCount >= question.wordLimit.min && wordCount <= question.wordLimit.max;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>作文（{question.points} 分）</CardTitle>
          <Badge variant={isWithinLimit ? 'default' : 'destructive'}>
            字數：{wordCount} / {question.wordLimit.min}-{question.wordLimit.max}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="font-medium mb-2">題目：</p>
          <div className="bg-muted/30 p-4 rounded-lg space-y-4">
            {/* Prompt Image (若有獨立的題目圖片欄位) */}
            {question.promptImage && (
              <div className="rounded-lg overflow-hidden border bg-muted">
                <img
                  src={question.promptImage}
                  alt="作文題目圖片"
                  className="w-full max-h-80 object-contain"
                />
              </div>
            )}
            {/* 題目內容（支援 [IMG:url] 行內圖片標記） */}
            <div className="leading-relaxed">
              {renderTextWithImages(question.prompt)}
            </div>
          </div>
        </div>

        {question.rubric && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">內容</p>
              <p className="text-xl font-semibold">{question.rubric.content} 分</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">組織</p>
              <p className="text-xl font-semibold">{question.rubric.organization} 分</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">文法</p>
              <p className="text-xl font-semibold">{question.rubric.grammar} 分</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">字彙</p>
              <p className="text-xl font-semibold">{question.rubric.vocabulary} 分</p>
            </div>
          </div>
        )}

        <div>
          <p className="font-medium mb-2">作文內容：</p>
          <Textarea
            placeholder="請開始撰寫你的英文作文..."
            value={answer || ''}
            onChange={(e) => onAnswerChange(e.target.value)}
            rows={20}
            className="resize-none font-mono"
          />
        </div>

        <div className="text-sm text-muted-foreground">
          <p>• 請使用英文撰寫</p>
          <p>
            • 字數限制：{question.wordLimit.min} - {question.wordLimit.max} 字
          </p>
          <p>• 請確保文章結構完整，包含開頭、本文與結尾</p>
        </div>
      </CardContent>
    </Card>
  );
};
