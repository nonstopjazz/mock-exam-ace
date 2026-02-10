import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Target,
  ArrowLeft,
  BookOpen,
  Package,
  TrendingDown,
  AlertCircle,
  RotateCcw,
  Zap,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useVocabularyStore, WordProgress } from "@/store/vocabularyStore";
import type { VocabularyWord } from "@/data/vocabulary/types";
import { useUserPacks } from "@/hooks/useUserPacks";
import { useWeakWords, WeakWord } from "@/hooks/usePackItemProgress";

interface LocalWeakWord {
  word: VocabularyWord;
  progress: WordProgress;
  accuracy: number;
}

const WeakWords = () => {
  const navigate = useNavigate();
  const { wordProgress, setSelectedLearningStatus, getAllWords } = useVocabularyStore();
  const { packs } = useUserPacks();

  // Selected pack for viewing weak words
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  // Fetch weak words for selected pack
  const { weakWords: packWeakWords, loading: packLoading } = useWeakWords(selectedPackId);

  // Calculate local weak words
  const localWeakWords = useMemo(() => {
    const allWords = getAllWords();
    const weakWords: LocalWeakWord[] = [];


    allWords.forEach(word => {
      const progress = wordProgress[word.id];
      if (progress && progress.reviewCount > 0) {
        const accuracy = Math.round((progress.correctCount / progress.reviewCount) * 100);

        // Include if mastery < 3 or accuracy < 60%
        if (progress.masteryLevel < 3 || accuracy < 60) {
          weakWords.push({
            word,
            progress,
            accuracy,
          });
        }
      }
    });

    // Sort by accuracy (lowest first), then by mastery level
    weakWords.sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return a.progress.masteryLevel - b.progress.masteryLevel;
    });

    return weakWords;
  }, [wordProgress, getAllWords]);

  // Calculate overall stats
  const localStats = useMemo(() => {
    const totalReviewed = Object.values(wordProgress).filter(p => p.reviewCount > 0).length;
    return {
      weakCount: localWeakWords.length,
      totalReviewed,
      weakPercentage: totalReviewed > 0 ? Math.round((localWeakWords.length / totalReviewed) * 100) : 0,
    };
  }, [wordProgress, localWeakWords]);

  const getMasteryLabel = (level: number) => {
    const labels = ["新單字", "學習中", "複習中", "熟悉", "已知", "精通"];
    return labels[Math.min(level, 5)];
  };

  const getMasteryColor = (level: number) => {
    if (level <= 1) return "bg-destructive";
    if (level <= 2) return "bg-warning";
    if (level <= 3) return "bg-primary";
    return "bg-success";
  };

  const handleStartWeakReview = () => {
    // Set filter to only show learning/reviewing words
    setSelectedLearningStatus(['learning', 'reviewing']);
    navigate("/practice/vocabulary/srs");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/practice/vocabulary")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>

          <div className="flex items-center gap-3">
            <Target className="h-6 w-6 text-destructive" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">弱點單字</h1>
              <p className="text-sm text-muted-foreground">需要加強的單字</p>
            </div>
          </div>

          <div className="w-20" />
        </div>

        {/* Overall Stats */}
        <Card className="p-6 mb-6 bg-gradient-to-br from-destructive/10 to-warning/10 border-destructive/20">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-destructive/20">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground mb-1">
                本地單字庫：{localStats.weakCount} 個弱點單字
              </h3>
              <p className="text-sm text-muted-foreground">
                佔已複習單字的 {localStats.weakPercentage}%（共複習 {localStats.totalReviewed} 個）
              </p>
            </div>
            <Button onClick={handleStartWeakReview} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              開始複習
            </Button>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="local" className="space-y-6">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="local" className="gap-2">
              <BookOpen className="h-4 w-4" />
              本地單字庫
            </TabsTrigger>
            <TabsTrigger value="packs" className="gap-2">
              <Package className="h-4 w-4" />
              收藏包
            </TabsTrigger>
          </TabsList>

          {/* Local Weak Words */}
          <TabsContent value="local">
            {localWeakWords.length === 0 ? (
              <Card className="p-8 text-center">
                <TrendingDown className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold text-foreground mb-2">沒有弱點單字</h3>
                <p className="text-muted-foreground mb-4">
                  太棒了！你的單字掌握度很好，繼續保持！
                </p>
                <Button onClick={() => navigate("/practice/vocabulary/srs")}>
                  繼續學習
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {localWeakWords.slice(0, 50).map((item) => (
                  <Card key={item.word.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-lg font-bold text-foreground">{item.word.word}</span>
                          {item.word.ipa && (
                            <span className="text-sm text-muted-foreground">{item.word.ipa}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.word.translation}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Accuracy */}
                        <div className="text-center">
                          <div className={`text-lg font-bold ${item.accuracy < 50 ? 'text-destructive' : item.accuracy < 70 ? 'text-warning' : 'text-foreground'}`}>
                            {item.accuracy}%
                          </div>
                          <div className="text-xs text-muted-foreground">正確率</div>
                        </div>

                        {/* Review count */}
                        <div className="text-center">
                          <div className="text-lg font-bold text-foreground">
                            {item.progress.reviewCount}
                          </div>
                          <div className="text-xs text-muted-foreground">複習次數</div>
                        </div>

                        {/* Mastery badge */}
                        <Badge className={`${getMasteryColor(item.progress.masteryLevel)} text-white`}>
                          {getMasteryLabel(item.progress.masteryLevel)}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                ))}

                {localWeakWords.length > 50 && (
                  <p className="text-center text-muted-foreground py-4">
                    顯示前 50 個弱點單字，共 {localWeakWords.length} 個
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          {/* Pack Weak Words */}
          <TabsContent value="packs">
            {packs.length === 0 ? (
              <Card className="p-8 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold text-foreground mb-2">沒有收藏包</h3>
                <p className="text-muted-foreground mb-4">
                  使用邀請碼領取單字包開始學習
                </p>
                <Button onClick={() => navigate("/practice/vocabulary/collections")}>
                  前往收藏包
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Pack selector */}
                <div className="flex flex-wrap gap-2">
                  {packs.map((pack) => (
                    <Button
                      key={pack.pack_id}
                      variant={selectedPackId === pack.pack_id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedPackId(pack.pack_id)}
                    >
                      {pack.title}
                    </Button>
                  ))}
                </div>

                {/* Weak words list */}
                {selectedPackId ? (
                  packLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : packWeakWords.length === 0 ? (
                    <Card className="p-8 text-center">
                      <TrendingDown className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">沒有弱點單字</h3>
                      <p className="text-muted-foreground">
                        這個收藏包沒有需要加強的單字
                      </p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {packWeakWords.map((item) => (
                        <Card key={item.item_id} className="p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <span className="text-lg font-bold text-foreground">{item.word}</span>
                              <p className="text-sm text-muted-foreground">{item.definition}</p>
                            </div>

                            <div className="flex items-center gap-4">
                              {/* Accuracy */}
                              <div className="text-center">
                                <div className={`text-lg font-bold ${item.accuracy < 50 ? 'text-destructive' : item.accuracy < 70 ? 'text-warning' : 'text-foreground'}`}>
                                  {item.accuracy}%
                                </div>
                                <div className="text-xs text-muted-foreground">正確率</div>
                              </div>

                              {/* Review count */}
                              <div className="text-center">
                                <div className="text-lg font-bold text-foreground">
                                  {item.review_count}
                                </div>
                                <div className="text-xs text-muted-foreground">複習次數</div>
                              </div>

                              {/* Mastery badge */}
                              <Badge className={`${getMasteryColor(item.mastery_level)} text-white`}>
                                {getMasteryLabel(item.mastery_level)}
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )
                ) : (
                  <Card className="p-8 text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      請選擇一個收藏包查看弱點單字
                    </p>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WeakWords;
