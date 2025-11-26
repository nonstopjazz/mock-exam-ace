import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/ProgressBar";
import {
  Brain,
  ArrowLeft,
  Volume2,
  BookMarked,
  Clock,
  TrendingUp,
  X,
  Minus,
  Check,
  Layers,
  Play,
  Settings,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useVocabularyStore } from "@/store/vocabularyStore";
import { VocabularyWord, VOCABULARY_LEVELS } from "@/data/vocabulary";

const SRSReview = () => {
  const navigate = useNavigate();
  const {
    selectedLevels,
    setSelectedLevels,
    getWordsForSRS,
    updateWordProgress,
    getWordProgress,
  } = useVocabularyStore();

  // Phase: 'selection' or 'review'
  const [phase, setPhase] = useState<'selection' | 'review'>('selection');
  const [cards, setCards] = useState<VocabularyWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [wordLimit, setWordLimit] = useState(20);

  const currentCard = cards[currentIndex];
  const totalCards = cards.length;

  // Toggle level selection
  const toggleLevel = (level: number) => {
    if (selectedLevels.includes(level)) {
      setSelectedLevels(selectedLevels.filter(l => l !== level));
    } else {
      setSelectedLevels([...selectedLevels, level]);
    }
  };

  // Start the review session
  const startReview = () => {
    const reviewWords = getWordsForSRS(wordLimit);
    if (reviewWords.length === 0) {
      toast.error("No words available", {
        description: "Please select at least one level with words to review."
      });
      return;
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

    // Update word progress in store
    updateWordProgress(currentCard.id, result.isCorrect, response);

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
              Back
            </Button>

            <div className="flex items-center gap-3">
              <Brain className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">SRS Review</h1>
                <p className="text-sm text-muted-foreground">Spaced Repetition System</p>
              </div>
            </div>

            <div className="w-20" />
          </div>

          {/* Selection Card */}
          <Card className="p-6">
            <div className="space-y-6">
              {/* Level Selection */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Select Levels</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {VOCABULARY_LEVELS.filter(l => l.wordCount > 0).map((level) => {
                    const isSelected = selectedLevels.includes(level.level);
                    return (
                      <div
                        key={level.level}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/50"
                        }`}
                        onClick={() => toggleLevel(level.level)}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Checkbox checked={isSelected} />
                          <span className="font-bold">Level {level.level}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {level.wordCount.toLocaleString()} words
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Word Limit */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Review Count</h2>
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

              {/* Start Button */}
              <div className="pt-4 border-t">
                <Button
                  size="lg"
                  className="w-full gap-2"
                  disabled={selectedLevels.length === 0}
                  onClick={startReview}
                >
                  <Play className="h-5 w-5" />
                  Start Review ({wordLimit} words)
                </Button>
              </div>
            </div>
          </Card>

          {/* Info Card */}
          <Card className="mt-6 p-4 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-secondary mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">What is SRS?</h3>
                <p className="text-sm text-muted-foreground">
                  Spaced Repetition System automatically schedules review based on your memory curve.
                  The more times you answer correctly, the longer the review interval, helping you learn efficiently.
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
