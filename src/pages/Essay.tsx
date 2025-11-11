import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, useMemo } from "react";
import {
  FileText,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Target,
  Sparkles,
  BookOpen,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  MOCK_ESSAY_PROMPTS,
  MOCK_GRADING_RESPONSE,
  MOCK_STUDENT_ESSAY,
  type EssayGradingResponse,
} from "@/data/mock-essay";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

// TODO: 未來從 API 拉取與提交
// GET /api/essay/prompts - 取得題目列表
// POST /api/essay/grade - 提交作文並取得 AI 批改
// POST /api/essay/submit - 儲存作文記錄

const Essay = () => {
  const [selectedPromptId, setSelectedPromptId] = useState(MOCK_ESSAY_PROMPTS[0].id);
  const [essayContent, setEssayContent] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState<EssayGradingResponse | null>(null);
  const [showExample, setShowExample] = useState(false);

  const selectedPrompt = MOCK_ESSAY_PROMPTS.find((p) => p.id === selectedPromptId) || MOCK_ESSAY_PROMPTS[0];

  // 字數統計
  const wordCount = useMemo(() => {
    return essayContent.trim().split(/\s+/).filter(Boolean).length;
  }, [essayContent]);

  const isWithinLimit = wordCount >= selectedPrompt.wordLimit.min && wordCount <= selectedPrompt.wordLimit.max;

  // 載入範例作文
  const loadExample = () => {
    setEssayContent(MOCK_STUDENT_ESSAY);
    setShowExample(true);
  };

  // 送出批改（Mock）
  const handleGrade = async () => {
    if (!essayContent.trim()) {
      alert('請先輸入作文內容');
      return;
    }

    setIsGrading(true);

    // TODO: 實際 API 呼叫
    // const response = await fetch('/api/essay/grade', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     promptId: selectedPromptId,
    //     content: essayContent,
    //   }),
    // });
    // const result = await response.json();

    // Mock 延遲
    setTimeout(() => {
      setGradingResult(MOCK_GRADING_RESPONSE);
      setIsGrading(false);
    }, 2000);
  };

  // 重新提交
  const handleReset = () => {
    setEssayContent('');
    setGradingResult(null);
    setShowExample(false);
  };

  // 高亮顯示文字
  const renderHighlightedText = () => {
    if (!gradingResult || !essayContent) return null;

    const highlights = [...gradingResult.highlights].sort((a, b) => a.start - b.start);
    const segments: JSX.Element[] = [];
    let lastIndex = 0;

    highlights.forEach((highlight, idx) => {
      // 正常文字
      if (highlight.start > lastIndex) {
        segments.push(
          <span key={`text-${idx}`}>{essayContent.slice(lastIndex, highlight.start)}</span>
        );
      }

      // 高亮文字
      const bgColor =
        highlight.severity === 'error'
          ? 'bg-destructive/20 border-b-2 border-destructive'
          : highlight.severity === 'warning'
          ? 'bg-warning/20 border-b-2 border-warning'
          : 'bg-primary/10 border-b-2 border-primary';

      segments.push(
        <span
          key={`highlight-${idx}`}
          className={`${bgColor} cursor-pointer relative group`}
          title={highlight.note}
        >
          {essayContent.slice(highlight.start, highlight.end)}
          <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 w-64 p-2 bg-popover text-popover-foreground text-xs rounded-md shadow-lg border">
            <p className="font-semibold mb-1">{highlight.type.toUpperCase()}</p>
            <p>{highlight.note}</p>
            {highlight.suggestion && (
              <p className="mt-1 text-success">建議：{highlight.suggestion}</p>
            )}
          </span>
        </span>
      );

      lastIndex = highlight.end;
    });

    // 剩餘文字
    if (lastIndex < essayContent.length) {
      segments.push(<span key="text-end">{essayContent.slice(lastIndex)}</span>);
    }

    return <div className="whitespace-pre-wrap leading-relaxed">{segments}</div>;
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'suggestion':
        return <Lightbulb className="h-4 w-4 text-primary" />;
      default:
        return <Lightbulb className="h-4 w-4" />;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <FileText className="h-8 w-8" />
            作文練習與 AI 批改
          </h1>
          <p className="text-muted-foreground">選擇題目、撰寫作文，獲得即時 AI 回饋與改進建議</p>
        </div>

        {/* Prompt Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>選擇作文題目</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Select value={selectedPromptId} onValueChange={setSelectedPromptId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_ESSAY_PROMPTS.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={loadExample} disabled={showExample}>
                載入範例作文
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Left: Writing Area */}
          <div className="space-y-4">
            {/* Prompt Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  {selectedPrompt.title}
                </CardTitle>
                <CardDescription>
                  字數：{selectedPrompt.wordLimit.min}-{selectedPrompt.wordLimit.max} 字
                  {selectedPrompt.timeLimit && ` | 建議時間：${selectedPrompt.timeLimit} 分鐘`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <p className="leading-relaxed">{selectedPrompt.prompt}</p>
                  </div>

                  {selectedPrompt.hints && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-warning" />
                        寫作提示：
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        {selectedPrompt.hints.map((hint, idx) => (
                          <li key={idx}>{hint}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Writing Area */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>作文內容</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={isWithinLimit ? 'default' : 'destructive'}>
                      {wordCount} 字
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      / {selectedPrompt.wordLimit.min}-{selectedPrompt.wordLimit.max}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!gradingResult ? (
                  <Textarea
                    placeholder="請開始撰寫你的英文作文..."
                    value={essayContent}
                    onChange={(e) => setEssayContent(e.target.value)}
                    rows={20}
                    className="resize-none font-mono"
                  />
                ) : (
                  <ScrollArea className="h-[500px] border rounded-lg p-4">
                    {renderHighlightedText()}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleReset} disabled={isGrading}>
                <RotateCcw className="h-4 w-4 mr-2" />
                重新開始
              </Button>
              <Button
                onClick={handleGrade}
                disabled={isGrading || !essayContent.trim()}
                className="gap-2"
              >
                {isGrading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    批改中...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    送出批改
                  </>
                )}
              </Button>
            </div>

            {showExample && (
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription>
                  已載入範例作文，點擊「送出批改」即可查看 AI 批改結果（Mock）
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Right: AI Feedback */}
          <div className="space-y-4">
            {!gradingResult ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    AI 批改結果
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>完成作文後點擊「送出批改」</p>
                    <p className="text-sm">即可獲得即時 AI 回饋</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Overall Score */}
                <Card className="border-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        總評
                      </span>
                      <Badge variant="default" className="text-lg px-4 py-1">
                        {gradingResult.level}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-5xl font-bold text-primary mb-2">
                          {gradingResult.overall_score}
                        </div>
                        <p className="text-sm text-muted-foreground">/ 100 分</p>
                      </div>

                      <Progress value={gradingResult.overall_score} className="h-3" />

                      <div className="text-sm text-muted-foreground">
                        <p>{gradingResult.summary}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Rubric Scores */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      評分細項
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(gradingResult.rubric).map(([key, value]) => (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {key === 'TaskResponse' && '內容完整性'}
                              {key === 'Coherence' && '結構組織'}
                              {key === 'LexicalResource' && '用詞精準度'}
                              {key === 'Grammar' && '文法正確性'}
                              {key === 'Creativity' && '創意表達'}
                            </span>
                            <Badge variant="outline">
                              {value.score} / {value.maxScore}
                            </Badge>
                          </div>
                          <Progress value={(value.score / value.maxScore) * 100} className="h-2" />
                          <p className="text-xs text-muted-foreground">{value.comment}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Strengths & Weaknesses */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      優缺點分析
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="strengths">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="strengths">優點</TabsTrigger>
                        <TabsTrigger value="weaknesses">待改進</TabsTrigger>
                      </TabsList>
                      <TabsContent value="strengths" className="space-y-2 mt-4">
                        {gradingResult.strengths.map((strength, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                            <span>{strength}</span>
                          </div>
                        ))}
                      </TabsContent>
                      <TabsContent value="weaknesses" className="space-y-2 mt-4">
                        {gradingResult.weaknesses.map((weakness, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <AlertCircle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                            <span>{weakness}</span>
                          </div>
                        ))}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Detailed Feedback Tabs */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      詳細回饋
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="highlights">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="highlights">錯誤標註</TabsTrigger>
                        <TabsTrigger value="fixes">改寫建議</TabsTrigger>
                        <TabsTrigger value="advice">重點提醒</TabsTrigger>
                      </TabsList>

                      {/* Highlights */}
                      <TabsContent value="highlights" className="space-y-3 mt-4">
                        <ScrollArea className="h-[300px]">
                          {gradingResult.highlights.map((highlight, idx) => (
                            <div
                              key={idx}
                              className="p-3 border rounded-lg mb-3 space-y-2 bg-muted/30"
                            >
                              <div className="flex items-center gap-2">
                                {getSeverityIcon(highlight.severity)}
                                <Badge variant="outline" className="text-xs">
                                  {highlight.type}
                                </Badge>
                              </div>
                              <p className="text-sm font-medium">
                                "{essayContent.slice(highlight.start, highlight.end)}"
                              </p>
                              <p className="text-xs text-muted-foreground">{highlight.note}</p>
                              {highlight.suggestion && (
                                <p className="text-xs text-success">
                                  建議：{highlight.suggestion}
                                </p>
                              )}
                            </div>
                          ))}
                        </ScrollArea>
                      </TabsContent>

                      {/* Sentence Fixes */}
                      <TabsContent value="fixes" className="space-y-3 mt-4">
                        <ScrollArea className="h-[300px]">
                          {gradingResult.suggestions.sentence_fixes.map((fix, idx) => (
                            <div key={idx} className="p-3 border rounded-lg mb-3 space-y-2">
                              <Badge variant="secondary" className="text-xs">
                                {fix.category}
                              </Badge>
                              <div className="space-y-1">
                                <p className="text-sm">
                                  <span className="text-muted-foreground">原句：</span>
                                  <span className="text-destructive ml-1">"{fix.original}"</span>
                                </p>
                                <p className="text-sm">
                                  <span className="text-muted-foreground">改寫：</span>
                                  <span className="text-success ml-1">"{fix.improved}"</span>
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground">💡 {fix.why}</p>
                            </div>
                          ))}
                        </ScrollArea>
                      </TabsContent>

                      {/* Top Advice */}
                      <TabsContent value="advice" className="space-y-3 mt-4">
                        <ScrollArea className="h-[300px]">
                          {gradingResult.suggestions.top_advice.map((advice, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg mb-3"
                            >
                              <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {idx + 1}
                              </div>
                              <p className="text-sm">{advice}</p>
                            </div>
                          ))}

                          {gradingResult.suggestions.paragraph_comments.length > 0 && (
                            <>
                              <Separator className="my-4" />
                              <h4 className="font-semibold text-sm mb-3">段落評論</h4>
                              {gradingResult.suggestions.paragraph_comments.map((para, idx) => (
                                <div key={idx} className="p-3 border rounded-lg mb-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Badge>第 {para.paraIndex + 1} 段</Badge>
                                  </div>
                                  <p className="text-sm">{para.comment}</p>
                                  {para.strength && (
                                    <p className="text-xs text-success">✓ {para.strength}</p>
                                  )}
                                  {para.improvement && (
                                    <p className="text-xs text-warning">! {para.improvement}</p>
                                  )}
                                </div>
                              ))}
                            </>
                          )}
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Essay;
