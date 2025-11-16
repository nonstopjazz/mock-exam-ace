import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Brain, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { generateMockGrammarData, GrammarMainTopic, GrammarMiddleTopic } from "@/data/grammar-topics";

const GrammarAnalysis = () => {
  const grammarData = generateMockGrammarData();
  const [expandedMain, setExpandedMain] = useState<string | null>(null);
  const [expandedMiddle, setExpandedMiddle] = useState<Record<string, boolean>>({});

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 85) return "text-success";
    if (accuracy >= 70) return "text-primary";
    if (accuracy >= 60) return "text-warning";
    return "text-destructive";
  };

  const getAccuracyBgColor = (accuracy: number) => {
    if (accuracy >= 85) return "bg-success/10 border-success/20";
    if (accuracy >= 70) return "bg-primary/10 border-primary/20";
    if (accuracy >= 60) return "bg-warning/10 border-warning/20";
    return "bg-destructive/10 border-destructive/20";
  };

  const getAccuracyIcon = (accuracy: number) => {
    if (accuracy >= 85) return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (accuracy >= 70) return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (accuracy >= 60) return <AlertCircle className="h-4 w-4 text-warning" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const getAccuracyLabel = (accuracy: number) => {
    if (accuracy >= 85) return "優秀";
    if (accuracy >= 70) return "良好";
    if (accuracy >= 60) return "需加強";
    return "待改善";
  };

  const toggleMiddle = (middleTopicName: string) => {
    setExpandedMiddle(prev => ({
      ...prev,
      [middleTopicName]: !prev[middleTopicName]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-lg bg-primary/10">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">文法主題熟練度分析</h2>
          <p className="text-sm text-muted-foreground">
            點擊卡片查看詳細子主題分析
          </p>
        </div>
      </div>

      {/* Legend */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground font-medium">熟練度標準：</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-foreground">≥85% 優秀</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-foreground">70-84% 良好</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-foreground">60-69% 需加強</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-foreground">&lt;60% 待改善</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Topics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {grammarData.map((mainTopic) => (
          <Card
            key={mainTopic.name}
            className={`transition-all duration-200 hover:shadow-lg cursor-pointer ${
              expandedMain === mainTopic.name ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setExpandedMain(
              expandedMain === mainTopic.name ? null : mainTopic.name
            )}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg font-bold text-foreground flex-1">
                  {mainTopic.name}
                </CardTitle>
                {expandedMain === mainTopic.name ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Overall Accuracy */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">整體正確率</span>
                  <div className="flex items-center gap-2">
                    {getAccuracyIcon(mainTopic.accuracy || 0)}
                    <span className={`text-2xl font-bold ${getAccuracyColor(mainTopic.accuracy || 0)}`}>
                      {mainTopic.accuracy}%
                    </span>
                  </div>
                </div>

                <Progress value={mainTopic.accuracy || 0} className="h-2" />

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {mainTopic.middleTopics.length} 個中主題
                  </span>
                  <Badge variant="outline" className={getAccuracyBgColor(mainTopic.accuracy || 0)}>
                    {getAccuracyLabel(mainTopic.accuracy || 0)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Expanded Details */}
      {expandedMain && (
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {expandedMain} - 詳細分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {grammarData
                .find(mt => mt.name === expandedMain)
                ?.middleTopics.map((middleTopic) => (
                  <Card key={middleTopic.name} className="border-l-4" style={{
                    borderLeftColor: middleTopic.accuracy! >= 85 ? 'hsl(var(--success))' :
                                     middleTopic.accuracy! >= 70 ? 'hsl(var(--primary))' :
                                     middleTopic.accuracy! >= 60 ? 'hsl(var(--warning))' :
                                     'hsl(var(--destructive))'
                  }}>
                    <Collapsible
                      open={expandedMiddle[middleTopic.name]}
                      onOpenChange={() => toggleMiddle(middleTopic.name)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              {expandedMiddle[middleTopic.name] ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div className="flex-1">
                                <h4 className="font-semibold text-foreground">{middleTopic.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {middleTopic.subTopics.length} 個子主題
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className={`text-2xl font-bold ${getAccuracyColor(middleTopic.accuracy || 0)}`}>
                                  {middleTopic.accuracy}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {getAccuracyLabel(middleTopic.accuracy || 0)}
                                </div>
                              </div>
                              {getAccuracyIcon(middleTopic.accuracy || 0)}
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-4 pb-4 space-y-2">
                          {middleTopic.subTopics.map((subTopic) => (
                            <div
                              key={subTopic.name}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {getAccuracyIcon(subTopic.accuracy || 0)}
                                <span className="text-sm font-medium text-foreground">
                                  {subTopic.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="w-24">
                                  <Progress value={subTopic.accuracy || 0} className="h-1.5" />
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`min-w-[60px] justify-center ${getAccuracyBgColor(subTopic.accuracy || 0)}`}
                                >
                                  <span className={getAccuracyColor(subTopic.accuracy || 0)}>
                                    {subTopic.accuracy}%
                                  </span>
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GrammarAnalysis;
