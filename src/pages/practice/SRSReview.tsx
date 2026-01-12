import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  ArrowLeft,
  Volume2,
  BookMarked,
  TrendingUp,
  X,
  Minus,
  Check,
  Settings,
  Layers,
  Package,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useVocabularyStore } from "@/store/vocabularyStore";
import { VocabularyWord } from "@/data/vocabulary";
import { VocabularySelector } from "@/components/vocabulary/VocabularySelector";
import { CollectionPackSelector } from "@/components/vocabulary/CollectionPackSelector";
import { usePackItems, PackItem } from "@/hooks/useUserPacks";
import { useAuth } from "@/contexts/AuthContext";

// Unified card type for review
interface ReviewCard {
  id: string;
  word: string;
  definition: string;
  partOfSpeech?: string;
  phonetic?: string;
  example?: string;
  level?: number;
  source: 'level' | 'pack';
}

const SRSReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    getWordsForSRS,
    updateWordProgress,
    getWordProgress,
    getFilteredWordCount,
  } = useVocabularyStore();

  // Source selection: 'level' or 'pack'
  const [source, setSource] = useState<'level' | 'pack'>('level');

  // Phase: 'selection' or 'review'
  const [phase, setPhase] = useState<'selection' | 'review'>('selection');
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [wordLimit, setWordLimit] = useState(20);

  // For pack-based review
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const { items: packItems, loading: packItemsLoading } = usePackItems(selectedPackIds);

  const currentCard = cards[currentIndex];
  const totalCards = cards.length;

  // Start review with Level vocabulary
  const startLevelReview = () => {
    const filteredCount = getFilteredWordCount();
    const actualLimit = Math.min(wordLimit, filteredCount);
    const reviewWords = getWordsForSRS(actualLimit);
    if (reviewWords.length === 0) {
      toast.error("沒有符合條件的單字", {
        description: "請調整篩選條件後再試一次"
      });
      return;
    }

    // Convert to unified format
    const unifiedCards: ReviewCard[] = reviewWords.map(w => ({
      id: w.id,
      word: w.word,
      definition: w.translation,
      partOfSpeech: w.partOfSpeech,
      phonetic: w.ipa,
      example: w.example,
      level: w.level,
      source: 'level',
    }));

    setCards(unifiedCards);
    setCurrentIndex(0);
    setReviewedCount(0);
    setShowAnswer(false);
    setPhase('review');
  };

  // Start review with collection packs
  const startPackReview = (packIds: string[]) => {
    setSelectedPackIds(packIds);
  };

  // When pack items are loaded, start the review
  useEffect(() => {
    if (selectedPackIds.length > 0 && packItems.length > 0 && !packItemsLoading) {
      // Shuffle and limit
      const shuffled = [...packItems].sort(() => Math.random() - 0.5);
      const limited = shuffled.slice(0, wordLimit);

      // Convert to unified format
      const unifiedCards: ReviewCard[] = limited.map(item => ({
        id: item.id,
        word: item.word,
        definition: item.definition || '',
        partOfSpeech: item.part_of_speech || undefined,
        phonetic: item.phonetic || undefined,
        example: item.example_sentence || undefined,
        source: 'pack',
      }));

      if (unifiedCards.length === 0) {
        toast.error("選擇的單字包沒有單字");
        setSelectedPackIds([]);
        return;
      }

      setCards(unifiedCards);
      setCurrentIndex(0);
      setReviewedCount(0);
      setShowAnswer(false);
      setPhase('review');
    }
  }, [packItems, packItemsLoading, selectedPackIds, wordLimit]);

  const handleResponse = (response: "forgot" | "hard" | "easy") => {
    if (!currentCard) return;

    const responseMap = {
      forgot: { label: "忘記了", nextReview: "10 分鐘後", isCorrect: false },
      hard: { label: "有點難", nextReview: "1 天後", isCorrect: true },
      easy: { label: "很簡單", nextReview: "3 天後", isCorrect: true }
    };

    const result = responseMap[response];

    // Update word progress if it's from Level vocabulary
    if (currentCard.source === 'level') {
      updateWordProgress(currentCard.id, result.isCorrect, response);
    }

    toast.success(`標記: ${result.label}`, {
      description: `下次複習: ${result.nextReview}`
    });

    setReviewedCount(prev => prev + 1);

    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowAnswer(false);
    } else {
      toast.success("複習完成！", {
        description: `你複習了 ${totalCards} 個單字`
      });
      setTimeout(() => {
        setPhase('selection');
        setSelectedPackIds([]);
        setCards([]);
      }, 1500);
    }
  };

  const getMasteryLevel = (wordId: string) => {
    const progress = getWordProgress(wordId);
    return progress.masteryLevel;
  };

  const getLevelColor = (level: number) => {
    if (level <= 1) return "text-destructive";
    if (level <= 2) return "text-warning";
    if (level <= 3) return "text-primary";
    return "text-success";
  };

  const getLevelLabel = (level: number) => {
    const labels = ["新", "學習中", "複習中", "熟悉", "已知", "精通"];
    return labels[Math.min(level, 5)];
  };

  // Loading state for pack items
  if (selectedPackIds.length > 0 && packItemsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">載入單字中...</p>
        </div>
      </div>
    );
  }

  // Selection Phase
  if (phase === 'selection') {
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
              <Brain className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">SRS 智慧複習</h1>
                <p className="text-sm text-muted-foreground">間隔重複記憶系統</p>
              </div>
            </div>

            <div className="w-20" />
          </div>

          {/* Source Selection Tabs */}
          <Tabs value={source} onValueChange={(v) => setSource(v as 'level' | 'pack')} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="level" className="gap-2">
                <Layers className="h-4 w-4" />
                Level 單字
              </TabsTrigger>
              <TabsTrigger value="pack" className="gap-2">
                <Package className="h-4 w-4" />
                收藏單字包
              </TabsTrigger>
            </TabsList>

            <TabsContent value="level" className="mt-6">
              {/* Vocabulary Selector with all filters */}
              <VocabularySelector
                mode="srs"
                title="選擇複習範圍"
                description="從 Level 2-6 單字中選擇要複習的範圍"
                onStart={startLevelReview}
              />

              {/* Word Limit Selection */}
              <Card className="mt-4 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-foreground">複習數量</span>
                  </div>
                  <div className="flex gap-2">
                    {[10, 20, 30, 50, 100].map((num) => (
                      <Button
                        key={num}
                        variant={wordLimit === num ? "default" : "outline"}
                        size="sm"
                        onClick={() => setWordLimit(num)}
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="pack" className="mt-6">
              <Card className="p-6">
                <CollectionPackSelector
                  mode="srs"
                  onStartReview={startPackReview}
                />
              </Card>

              {/* Word Limit Selection */}
              <Card className="mt-4 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-foreground">複習數量</span>
                  </div>
                  <div className="flex gap-2">
                    {[10, 20, 30, 50, 100].map((num) => (
                      <Button
                        key={num}
                        variant={wordLimit === num ? "default" : "outline"}
                        size="sm"
                        onClick={() => setWordLimit(num)}
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Info Card */}
          <Card className="mt-4 p-4 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-secondary mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">什麼是 SRS？</h3>
                <p className="text-sm text-muted-foreground">
                  間隔重複系統會根據你的記憶曲線自動安排複習時間。
                  答對次數越多，複習間隔越長，幫助你高效學習。
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Review Phase
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPhase('selection');
              setSelectedPackIds([]);
              setCards([]);
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>

          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">SRS 複習</h1>
              <p className="text-sm text-muted-foreground">
                {currentCard?.source === 'pack' ? '收藏單字包' : 'Level 單字'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{reviewedCount}/{totalCards}</div>
            <p className="text-xs text-muted-foreground">已完成</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <ProgressBar
            current={reviewedCount}
            max={totalCards}
            label="複習進度"
          />
        </div>

        {/* Main Card */}
        {currentCard && (
          <Card className="relative overflow-hidden mb-6 animate-fade-in">
            {/* Card Header */}
            <div className="p-6 border-b bg-gradient-to-br from-primary/5 to-accent/5">
              <div className="flex items-center justify-between mb-4">
                <Badge variant="outline" className="gap-1">
                  <BookMarked className="h-3 w-3" />
                  第 {currentIndex + 1}/{totalCards} 個
                </Badge>

                <div className="flex items-center gap-2">
                  {currentCard.source === 'level' && currentCard.level && (
                    <>
                      <Badge variant="secondary">Level {currentCard.level}</Badge>
                      <Badge className={getLevelColor(getMasteryLevel(currentCard.id))}>
                        {getLevelLabel(getMasteryLevel(currentCard.id))}
                      </Badge>
                    </>
                  )}
                  {currentCard.source === 'pack' && (
                    <Badge variant="outline">
                      <Package className="h-3 w-3 mr-1" />
                      收藏包
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Volume2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Word */}
              <div className="text-center mb-4">
                <h2 className="text-5xl font-bold text-foreground mb-2">
                  {currentCard.word}
                </h2>
                {currentCard.phonetic && (
                  <p className="text-xl text-muted-foreground mb-2">{currentCard.phonetic}</p>
                )}
                {currentCard.partOfSpeech && (
                  <Badge variant="outline" className="text-sm">{currentCard.partOfSpeech}</Badge>
                )}
              </div>

              {/* Show Answer Button */}
              {!showAnswer && (
                <div className="text-center">
                  <Button
                    onClick={() => setShowAnswer(true)}
                    className="gap-2"
                    size="lg"
                  >
                    <Check className="h-4 w-4" />
                    顯示答案
                  </Button>
                </div>
              )}
            </div>

            {/* Answer Section */}
            {showAnswer && (
              <div className="p-6 space-y-6 animate-fade-in">
                {/* Definition */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">定義</h3>
                  <p className="text-2xl font-bold text-foreground">{currentCard.definition}</p>
                </div>

                {/* Example */}
                {currentCard.example && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">例句</h3>
                    <p className="text-lg text-foreground">{currentCard.example}</p>
                  </div>
                )}

                {/* Response Buttons */}
                <div className="grid grid-cols-3 gap-4 pt-4">
                  <Button
                    onClick={() => handleResponse("forgot")}
                    variant="outline"
                    className="flex-col h-auto py-4 gap-2 border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                  >
                    <X className="h-6 w-6 text-destructive" />
                    <div className="text-center">
                      <div className="font-bold text-destructive">忘記了</div>
                      <div className="text-xs text-muted-foreground">10 分鐘</div>
                    </div>
                  </Button>

                  <Button
                    onClick={() => handleResponse("hard")}
                    variant="outline"
                    className="flex-col h-auto py-4 gap-2 border-warning/30 hover:bg-warning/10 hover:border-warning"
                  >
                    <Minus className="h-6 w-6 text-warning" />
                    <div className="text-center">
                      <div className="font-bold text-warning">有點難</div>
                      <div className="text-xs text-muted-foreground">1 天</div>
                    </div>
                  </Button>

                  <Button
                    onClick={() => handleResponse("easy")}
                    variant="outline"
                    className="flex-col h-auto py-4 gap-2 border-success/30 hover:bg-success/10 hover:border-success"
                  >
                    <Check className="h-6 w-6 text-success" />
                    <div className="text-center">
                      <div className="font-bold text-success">很簡單</div>
                      <div className="text-xs text-muted-foreground">3 天</div>
                    </div>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Info Card */}
        <Card className="p-4 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-secondary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground mb-1">如何使用 SRS</h3>
              <p className="text-sm text-muted-foreground">
                <strong>忘記了:</strong> 10 分鐘後再複習。
                <strong> 有點難:</strong> 明天複習。
                <strong> 很簡單:</strong> 3 天後複習。
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SRSReview;
