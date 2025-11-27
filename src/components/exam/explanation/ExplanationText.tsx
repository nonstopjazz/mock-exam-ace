import { QuestionExplanation } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Key, FileText } from 'lucide-react';

interface Props {
  explanation?: QuestionExplanation;
}

export const ExplanationText = ({ explanation }: Props) => {
  if (!explanation) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          此題目前尚無詳解內容
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 核心概念 */}
      {explanation.coreConcept && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              {explanation.coreConceptTitle || '核心概念'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
                {explanation.coreConcept}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 關鍵字 */}
      {explanation.keywords && explanation.keywords.length > 0 && (
        <Card className="border-l-4 border-l-secondary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5 text-secondary" />
              {explanation.keywordsTitle || '關鍵字'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {explanation.keywords.map((keyword, index) => (
                <Badge key={index} variant="secondary" className="text-sm px-3 py-1">
                  {keyword}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 逐句解析 */}
      {explanation.detailedAnalysis && (
        <Card className="border-l-4 border-l-accent">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent" />
              {explanation.detailedAnalysisTitle || '詳細解析'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <div
                className="text-base leading-relaxed text-foreground whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: explanation.detailedAnalysis }}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
