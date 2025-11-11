import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Upload, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// TODO: Connect to AI API for essay grading
const Essay = () => {
  const { toast } = useToast();
  const [essayText, setEssayText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async () => {
    if (!essayText.trim()) {
      toast({
        title: "請輸入作文內容",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    
    // TODO: Call AI API
    setTimeout(() => {
      setResult({
        score: 18,
        maxScore: 20,
        strengths: [
          "文章結構清晰，分段合理",
          "用詞豐富，表達流暢",
          "論點明確，有說服力",
        ],
        improvements: [
          "部分句子可以更加精簡",
          "建議增加更多具體例子",
          "注意時態一致性",
        ],
      });
      setIsAnalyzing(false);
      toast({
        title: "分析完成！",
        description: "AI 已完成作文批改",
      });
    }, 2000);
  };

  const wordCount = essayText.trim().split(/\s+/).filter(Boolean).length;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">AI 作文批改</h1>
          <p className="text-muted-foreground">上傳你的英文作文，獲得即時 AI 評分與改進建議</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Input Section */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>作文內容</CardTitle>
                <CardDescription>
                  請輸入或貼上你的英文作文（建議 120-180 字）
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Write your essay here..."
                  value={essayText}
                  onChange={(e) => setEssayText(e.target.value)}
                  rows={15}
                  className="resize-none"
                />
                
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    字數: <span className="font-semibold text-foreground">{wordCount}</span>
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={isAnalyzing || !essayText.trim()}
                  >
                    {isAnalyzing ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                        分析中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        開始批改
                      </>
                    )}
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <div className="flex items-start gap-2">
                    <Upload className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium mb-1">上傳 PDF/圖片</p>
                      <p className="text-muted-foreground text-xs">
                        {/* TODO: Implement file upload */}
                        支援 PDF、JPG、PNG 格式（即將推出）
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Results Section */}
          <div>
            {result ? (
              <div className="space-y-6">
                {/* Score Card */}
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>AI 評分</span>
                      <Badge className="text-lg px-4 py-1">
                        {result.score} / {result.maxScore}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center text-5xl font-bold text-primary">
                      {Math.round((result.score / result.maxScore) * 100)}
                    </div>
                    <p className="text-center text-sm text-muted-foreground mt-2">
                      整體表現
                    </p>
                  </CardContent>
                </Card>

                {/* Strengths */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-success">
                      <CheckCircle2 className="h-5 w-5" />
                      優點
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.strengths.map((strength: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <span className="text-success mt-1">✓</span>
                          <span>{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Improvements */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-warning">
                      <AlertCircle className="h-5 w-5" />
                      改進建議
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.improvements.map((improvement: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <span className="text-warning mt-1">→</span>
                          <span>{improvement}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="h-full flex items-center justify-center bg-muted/30">
                <CardContent className="text-center py-12">
                  <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    輸入作文後點擊「開始批改」
                    <br />
                    AI 將為你提供詳細分析
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Essay;
