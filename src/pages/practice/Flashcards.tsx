import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/ProgressBar";
import {
  FlipVertical2,
  ArrowLeft,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Star,
  RotateCcw,
  TrendingUp,
  Settings,
  Shuffle,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useVocabularyStore } from "@/store/vocabularyStore";
import { VocabularyWord } from "@/data/vocabulary";
import { VocabularySelector } from "@/components/vocabulary/VocabularySelector";
import { CollectionPackSelector, VocabularySource } from "@/components/vocabulary/CollectionPackSelector";
import { usePackItems, PackItem } from "@/hooks/useUserPacks";
import { usePackItemProgress } from "@/hooks/usePackItemProgress";

// Convert PackItem to VocabularyWord format
const convertPackItemToVocabularyWord = (item: PackItem, index: number): VocabularyWord => ({
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
});

const Flashcards = () => {
  const navigate = useNavigate();
  const {
    getWordsForFlashcards,
    updateWordProgress,
    getWordProgress,
  } = useVocabularyStore();

  // Source selection state
  const [selectedSource, setSelectedSource] = useState<VocabularySource>('local');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  // Fetch pack items when a pack is selected
  const { items: packItems, loading: packLoading, error: packError } = usePackItems(selectedPackId);

  // Pack item progress tracking
  const { updateProgress: updatePackItemProgress } = usePackItemProgress();

  // Phase: 'selection' or 'study'
  const [phase, setPhase] = useState<'selection' | 'study'>('selection');
  const [cards, setCards] = useState<VocabularyWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [shuffled, setShuffled] = useState(false);

  const totalCards = cards.length;
  const currentCard = cards[currentIndex];

  // Start the flashcard session
  const startStudy = () => {
    let studyWords: VocabularyWord[] = [];

    if (selectedSource === 'pack') {
      // Use pack items
      if (!selectedPackId) {
        toast.error("請選擇收藏包", {
          description: "請先選擇一個收藏包"
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
          description: "此收藏包沒有單字"
        });
        return;
      }
      studyWords = packItems.map((item, index) => convertPackItemToVocabularyWord(item, index));
    } else {
      // Use local vocabulary
      studyWords = getWordsForFlashcards();
      if (studyWords.length === 0) {
        toast.error("沒有符合條件的單字", {
          description: "請調整篩選條件後再試一次"
        });
        return;
      }
    }

    if (shuffled) {
      studyWords = [...studyWords].sort(() => Math.random() - 0.5);
    }
    setCards(studyWords);
    setCurrentIndex(0);
    setIsFlipped(false);
    setPhase('study');
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      toast.success("Flashcards Complete!", {
        description: `You reviewed ${totalCards} cards.`
      });
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const handleLevelUp = () => {
    if (!currentCard) return;

    // Update progress based on source
    if (selectedSource === 'pack' && selectedPackId) {
      updatePackItemProgress(selectedPackId, currentCard.id, true, 'easy');
    } else {
      updateWordProgress(currentCard.id, true, 'easy');
    }
    toast.success("Progress Updated!", {
      description: `${currentCard.word} marked as known.`
    });
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    toast.success("Restarted from beginning");
  };

  const getMasteryLevel = (wordId: string) => {
    const progress = getWordProgress(wordId);
    return progress.masteryLevel;
  };

  const getLevelColor = (level: number) => {
    if (level <= 1) return "bg-destructive";
    if (level <= 2) return "bg-warning";
    if (level <= 3) return "bg-primary";
    if (level <= 4) return "bg-secondary";
    return "bg-success";
  };

  const getLevelLabel = (level: number) => {
    const labels = ["New", "Learning", "Review", "Familiar", "Known", "Mastered"];
    return labels[Math.min(level, 5)];
  };

  // Keyboard controls
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (phase !== 'study') return;
    if (e.key === 'ArrowLeft') handlePrevious();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === ' ') {
      e.preventDefault();
      handleFlip();
    }
  }, [phase, currentIndex, totalCards, isFlipped]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
              <FlipVertical2 className="h-6 w-6 text-secondary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">翻轉卡片</h1>
                <p className="text-sm text-muted-foreground">翻牌學習</p>
              </div>
            </div>

            <div className="w-20" />
          </div>

          {/* Source Selection */}
          <CollectionPackSelector
            selectedSource={selectedSource}
            selectedPackId={selectedPackId}
            onSourceChange={setSelectedSource}
            onPackSelect={setSelectedPackId}
          />

          {/* Vocabulary Selector (only shown for local source) */}
          {selectedSource === 'local' && (
            <VocabularySelector
              mode="flashcards"
              title="選擇學習範圍"
              description="設定篩選條件，選擇要學習的單字"
              onStart={startStudy}
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
                ) : selectedPackId ? (
                  <>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">{packItems.length}</div>
                      <div className="text-muted-foreground">個單字</div>
                    </div>
                    <Button
                      size="lg"
                      className="gap-2"
                      onClick={startStudy}
                      disabled={packItems.length === 0}
                    >
                      <FlipVertical2 className="h-5 w-5" />
                      開始學習
                    </Button>
                  </>
                ) : (
                  <div className="text-muted-foreground">請選擇一個收藏包</div>
                )}
              </div>
            </Card>
          )}

          {/* Shuffle Option */}
          <Card className="mt-4 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">選項設定</span>
              </div>
              <div
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all inline-flex items-center gap-2 ${
                  shuffled ? "border-primary bg-primary/5" : "border-muted"
                }`}
                onClick={() => setShuffled(!shuffled)}
              >
                <Checkbox checked={shuffled} />
                <Shuffle className="h-4 w-4" />
                <span>隨機排序</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Study Phase
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
            <FlipVertical2 className="h-6 w-6 text-secondary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Flashcards</h1>
              <p className="text-sm text-muted-foreground">Flip and Learn</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Restart
          </Button>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <ProgressBar
            current={currentIndex + 1}
            max={totalCards}
            label={`Card ${currentIndex + 1} of ${totalCards}`}
          />
        </div>

        {/* Card Container */}
        {currentCard && (
          <div className="relative mb-8" style={{ perspective: "1000px" }}>
            <div
              className={`relative transition-all duration-500 cursor-pointer ${
                isFlipped ? "[transform:rotateY(180deg)]" : ""
              }`}
              style={{ transformStyle: "preserve-3d" }}
              onClick={handleFlip}
            >
              {/* Front Side */}
              <Card
                className={`min-h-[400px] p-8 flex flex-col items-center justify-center ${
                  isFlipped ? "invisible" : ""
                }`}
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="absolute top-6 left-6">
                  <Badge variant="outline" className="gap-1">
                    Card {currentIndex + 1}/{totalCards}
                  </Badge>
                </div>

                <div className="absolute top-6 right-6 flex items-center gap-2">
                  <Badge variant="secondary">Level {currentCard.level}</Badge>
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i < getMasteryLevel(currentCard.id)
                            ? "text-primary fill-current"
                            : "text-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="text-center space-y-4">
                  <Button variant="ghost" size="sm" className="gap-1 mb-4">
                    <Volume2 className="h-4 w-4" />
                    Pronounce
                  </Button>

                  <h2 className="text-6xl font-bold text-foreground mb-4">
                    {currentCard.word}
                  </h2>
                  <p className="text-2xl text-muted-foreground">{currentCard.ipa}</p>
                  <Badge variant="outline">{currentCard.partOfSpeech}</Badge>

                  <div className="mt-8 pt-8 border-t">
                    <p className="text-sm text-muted-foreground">Click to flip</p>
                    <FlipVertical2 className="h-6 w-6 text-muted-foreground mx-auto mt-2 animate-pulse" />
                  </div>
                </div>
              </Card>

              {/* Back Side */}
              <Card
                className={`absolute inset-0 min-h-[400px] p-8 ${
                  !isFlipped ? "invisible" : ""
                }`}
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)"
                }}
              >
                <div className="absolute top-6 left-6">
                  <Badge variant="secondary">Answer</Badge>
                </div>

                <div className="absolute top-6 right-6">
                  <Badge className={getLevelColor(getMasteryLevel(currentCard.id))}>
                    {getLevelLabel(getMasteryLevel(currentCard.id))}
                  </Badge>
                </div>

                <div className="space-y-6">
                  {/* Translation */}
                  <div className="text-center py-4">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">Translation</h3>
                    <p className="text-3xl font-bold text-foreground">{currentCard.translation}</p>
                  </div>

                  {/* Example */}
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">Example</h3>
                    <p className="text-base text-foreground mb-2">{currentCard.example}</p>
                    <p className="text-sm text-muted-foreground">{currentCard.exampleTranslation}</p>
                  </div>

                  {/* Synonyms & Antonyms */}
                  {(currentCard.synonyms.length > 0 || currentCard.antonyms.length > 0) && (
                    <div className="grid grid-cols-2 gap-4">
                      {currentCard.synonyms.length > 0 && (
                        <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                          <h3 className="text-sm font-semibold text-success mb-2">Synonyms</h3>
                          <div className="flex flex-wrap gap-1">
                            {currentCard.synonyms.slice(0, 3).map((word, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {word}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentCard.antonyms.length > 0 && (
                        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                          <h3 className="text-sm font-semibold text-destructive mb-2">Antonyms</h3>
                          <div className="flex flex-wrap gap-1">
                            {currentCard.antonyms.slice(0, 3).map((word, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {word}
                              </Badge>
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

                  {/* Level Up Button */}
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLevelUp();
                    }}
                    className="w-full gap-2"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Mark as Known
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Navigation Controls */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <Button
            variant="outline"
            size="lg"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-5 w-5" />
            Previous
          </Button>

          <Button
            variant="default"
            size="lg"
            onClick={handleFlip}
            className="gap-2 px-8"
          >
            <FlipVertical2 className="h-5 w-5" />
            Flip
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={handleNext}
            disabled={currentIndex === totalCards - 1}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Keyboard Hint */}
        <Card className="p-4 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Arrow Left</Badge>
              Previous
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Space</Badge>
              Flip
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Arrow Right</Badge>
              Next
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Flashcards;
