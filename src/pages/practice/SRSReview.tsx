import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
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
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useVocabularyStore } from "@/store/vocabularyStore";
import { VocabularyWord } from "@/data/vocabulary";
import { VocabularySelector } from "@/components/vocabulary/VocabularySelector";
import { CollectionPackSelector, VocabularySource } from "@/components/vocabulary/CollectionPackSelector";
import { useMultiPackItems, PackItem } from "@/hooks/useUserPacks";
import { usePackItemProgress } from "@/hooks/usePackItemProgress";

// Extended VocabularyWord with pack_id for tracking
interface ExtendedVocabularyWord extends VocabularyWord {
  pack_id?: string;
}

// Convert PackItem to VocabularyWord format
const convertPackItemToVocabularyWord = (item: PackItem): ExtendedVocabularyWord => ({
  id: item.id,
  word: item.word,
  translation: item.definition || '',
  ipa: item.phonetic || '',
  partOfSpeech: item.part_of_speech || '',
  example: item.example_sentence || '',
  exampleTranslation: '',
  synonyms: [],
  antonyms: [],
  level: 1,
  tags: [],
  difficulty: 'medium',
  category: '',
  extraNotes: '',
  pack_id: item.pack_id,
});

const SRSReview = () => {
  const navigate = useNavigate();
  const {
    getWordsForSRS,
    updateWordProgress,
    getWordProgress,
    getFilteredWordCount,
  } = useVocabularyStore();

  // Source selection state
  const [selectedSource, setSelectedSource] = useState<VocabularySource>('local');
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);

  // Fetch pack items when packs are selected (supports multiple packs)
  const { items: packItems, loading: packLoading, error: packError } = useMultiPackItems(selectedPackIds);

  // Pack item progress tracking
  const { updateProgress: updatePackItemProgress } = usePackItemProgress();

  // Phase: 'selection' or 'review'
  const [phase, setPhase] = useState<'selection' | 'review'>('selection');
  const [cards, setCards] = useState<ExtendedVocabularyWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [wordLimit, setWordLimit] = useState(20);

  const currentCard = cards[currentIndex];
  const totalCards = cards.length;

  // Start the review session
  const startReview = () => {
    let reviewWords: VocabularyWord[] = [];

    if (selectedSource === 'pack') {
      // Use pack items
      if (selectedPackIds.length === 0) {
        toast.error("請選擇收藏包", {
          description: "請至少選擇一個收藏包"
        });
        return;
      }
      if (packLoading) {
        toast.error("載入中", {
          description: "請稍候..."
        });
        return;
      }
      if (packError) {
        toast.error("載入失敗", {
          description: packError
        });
        return;
      }
      if (packItems.length === 0) {
        toast.error("收藏包沒有單字", {
          description: "選擇的收藏包沒有單字"
        });
        return;
      }
      // Convert and shuffle pack items from all selected packs
      const allPackWords = packItems.map(item => convertPackItemToVocabularyWord(item));
      reviewWords = [...allPackWords].sort(() => Math.random() - 0.5).slice(0, wordLimit);
    } else {
      // Use local vocabulary
      const filteredCount = getFilteredWordCount();
      const actualLimit = Math.min(wordLimit, filteredCount);
      reviewWords = getWordsForSRS(actualLimit);
      if (reviewWords.length === 0) {
        toast.error("沒有符合條件的單字", {
          description: "請調整篩選條件後再試一次"
        });
        return;
      }
    }

    setCards(reviewWords);
    setCurrentIndex(0);
    setReviewedCount(0);
    setShowAnswer(false);
    setPhase('review');
  };

  const handleResponse = (response: "forgot" | "hard" | "easy") => {
    if (!currentCard) return;

    const responseMap = {
      forgot: { label: "Forgot", nextReview: "10 minutes", isCorrect: false },
      hard: { label: "Hard", nextReview: "1 day", isCorrect: true },
      easy: { label: "Easy", nextReview: "3 days", isCorrect: true }
    };

    const result = responseMap[response];

    // Update progress based on source
    if (selectedSource === 'pack' && currentCard.pack_id) {
      updatePackItemProgress(currentCard.pack_id, currentCard.id, result.isCorrect, response);
    } else {
      updateWordProgress(currentCard.id, result.isCorrect, response);
    }

    toast.success(`Marked: ${result.label}`, {
      description: `Next review: ${result.nextReview}`
    });

    setReviewedCount(prev => prev + 1);

    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowAnswer(false);
    } else {
      toast.success("Review Complete!", {
        description: `You reviewed ${totalCards} words.`
      });
      setTimeout(() => setPhase('selection'), 1500);
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
    const labels = ["New", "Learning", "Review", "Familiar", "Known", "Mastered"];
    return labels[Math.min(level, 5)];
  };

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

          {/* Source Selection */}
          <CollectionPackSelector
            selectedSource={selectedSource}
            multiSelect
            selectedPackIds={selectedPackIds}
            onSourceChange={setSelectedSource}
            onPacksSelect={setSelectedPackIds}
          />

          {/* Vocabulary Selector (only shown for local source) */}
          {selectedSource === 'local' && (
            <VocabularySelector
              mode="srs"
              title="選擇複習範圍"
              description="設定篩選條件，選擇要複習的單字"
              onStart={startReview}
            />
          )}

          {/* Pack Start Button (shown for pack source) */}
          {selectedSource === 'pack' && (
            <Card className="p-6">
              <div className="flex flex-col items-center gap-4">
                {packLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>載入中...</span>
                  </div>
                ) : packError ? (
                  <div className="text-destructive">{packError}</div>
                ) : selectedPackIds.length > 0 ? (
                  <>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">{packItems.length}</div>
                      <div className="text-muted-foreground">
                        個單字（來自 {selectedPackIds.length} 個收藏包）
                      </div>
                    </div>
                    <Button
                      size="lg"
                      className="gap-2"
                      onClick={startReview}
                      disabled={packItems.length === 0}
                    >
                      <Brain className="h-5 w-5" />
                      開始混合複習
                    </Button>
                  </>
                ) : (
                  <div className="text-muted-foreground">請選擇收藏包（可多選）</div>
                )}
              </div>
            </Card>
          )}

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
            onClick={() => setPhase('selection')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">SRS Review</h1>
              <p className="text-sm text-muted-foreground">Spaced Repetition System</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{reviewedCount}/{totalCards}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <ProgressBar
            current={reviewedCount}
            max={totalCards}
            label="Review Progress"
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
                  Word {currentIndex + 1}/{totalCards}
                </Badge>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Level {currentCard.level}</Badge>
                  <Badge className={getLevelColor(getMasteryLevel(currentCard.id))}>
                    {getLevelLabel(getMasteryLevel(currentCard.id))}
                  </Badge>
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
                <p className="text-xl text-muted-foreground mb-2">{currentCard.ipa}</p>
                <Badge variant="outline" className="text-sm">{currentCard.partOfSpeech}</Badge>
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
                    Show Answer
                  </Button>
                </div>
              )}
            </div>

            {/* Answer Section */}
            {showAnswer && (
              <div className="p-6 space-y-6 animate-fade-in">
                {/* Translation */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Translation</h3>
                  <p className="text-2xl font-bold text-foreground">{currentCard.translation}</p>
                </div>

                {/* Example */}
                <div className="p-4 rounded-lg bg-muted/50">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Example</h3>
                  <p className="text-lg text-foreground mb-2">{currentCard.example}</p>
                  <p className="text-base text-muted-foreground">{currentCard.exampleTranslation}</p>
                </div>

                {/* Synonyms & Antonyms */}
                {(currentCard.synonyms.length > 0 || currentCard.antonyms.length > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    {currentCard.synonyms.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Synonyms</h3>
                        <div className="flex flex-wrap gap-1">
                          {currentCard.synonyms.map((syn, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{syn}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {currentCard.antonyms.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Antonyms</h3>
                        <div className="flex flex-wrap gap-1">
                          {currentCard.antonyms.map((ant, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{ant}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Extra Notes */}
                {currentCard.extraNotes && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-muted-foreground">{currentCard.extraNotes}</p>
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
                      <div className="font-bold text-destructive">Forgot</div>
                      <div className="text-xs text-muted-foreground">10 min</div>
                    </div>
                  </Button>

                  <Button
                    onClick={() => handleResponse("hard")}
                    variant="outline"
                    className="flex-col h-auto py-4 gap-2 border-warning/30 hover:bg-warning/10 hover:border-warning"
                  >
                    <Minus className="h-6 w-6 text-warning" />
                    <div className="text-center">
                      <div className="font-bold text-warning">Hard</div>
                      <div className="text-xs text-muted-foreground">1 day</div>
                    </div>
                  </Button>

                  <Button
                    onClick={() => handleResponse("easy")}
                    variant="outline"
                    className="flex-col h-auto py-4 gap-2 border-success/30 hover:bg-success/10 hover:border-success"
                  >
                    <Check className="h-6 w-6 text-success" />
                    <div className="text-center">
                      <div className="font-bold text-success">Easy</div>
                      <div className="text-xs text-muted-foreground">3 days</div>
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
              <h3 className="font-semibold text-foreground mb-1">How to use SRS</h3>
              <p className="text-sm text-muted-foreground">
                <strong>Forgot:</strong> Review again in 10 minutes.
                <strong> Hard:</strong> Review tomorrow.
                <strong> Easy:</strong> Review in 3 days.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SRSReview;
