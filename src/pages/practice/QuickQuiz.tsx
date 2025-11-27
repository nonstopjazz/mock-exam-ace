import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import {
  Zap,
  ArrowLeft,
  Clock,
  Trophy,
  Gem,
  Target,
  Flame,
  CheckCircle2,
  XCircle,
  Award,
  Settings,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { useVocabularyStore } from "@/store/vocabularyStore";
import { VocabularyWord, getAllWords } from "@/data/vocabulary";
import { VocabularySelector } from "@/components/vocabulary/VocabularySelector";

interface QuizQuestion {
  id: string;
  word: string;
  ipa: string;
  options: string[];
  correctAnswer: number;
  wordData: VocabularyWord;
}

// Generate quiz questions from vocabulary data
const generateQuestions = (words: VocabularyWord[], count: number): QuizQuestion[] => {
  const allWords = getAllWords();
  const shuffledWords = [...words].sort(() => Math.random() - 0.5).slice(0, count);

  return shuffledWords.map((word) => {
    // Get 3 wrong answers (different translations from other words)
    const wrongAnswers = allWords
      .filter(w => w.id !== word.id && w.translation !== word.translation)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => w.translation);

    // Create options array with correct answer at random position
    const correctIndex = Math.floor(Math.random() * 4);
    const options = [...wrongAnswers];
    options.splice(correctIndex, 0, word.translation);

    return {
      id: word.id,
      word: word.word,
      ipa: word.ipa,
      options: options.slice(0, 4),
      correctAnswer: correctIndex,
      wordData: word,
    };
  });
};

const QuickQuiz = () => {
  const navigate = useNavigate();
  const { celebrate } = useConfetti();
  const {
    getWordsForQuiz,
    updateWordProgress,
    getFilteredWordCount,
  } = useVocabularyStore();

  // Phase: 'selection', 'playing', or 'finished'
  const [phase, setPhase] = useState<'selection' | 'playing' | 'finished'>('selection');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [questionCount, setQuestionCount] = useState(10);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex];

  // Start quiz
  const startQuiz = () => {
    const filteredCount = getFilteredWordCount();
    if (filteredCount < 4) {
      toast.error("單字數量不足", {
        description: "請調整篩選條件，至少需要 4 個單字"
      });
      return;
    }
    const words = getWordsForQuiz(questionCount * 2); // Get more words to have variety
    const generatedQuestions = generateQuestions(words, questionCount);
    setQuestions(generatedQuestions);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setCombo(0);
    setTimeLeft(15);
    setAnswers([]);
    setPhase('playing');
  };

  // Timer
  useEffect(() => {
    if (phase === "playing" && !showResult && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }

    if (timeLeft === 0 && !showResult && phase === "playing") {
      handleTimeout();
    }
  }, [timeLeft, showResult, phase]);

  const handleTimeout = () => {
    if (!currentQuestion) return;
    setShowResult(true);
    setCombo(0);
    setAnswers(prev => [...prev, false]);
    updateWordProgress(currentQuestion.id, false);
    toast.error("Time's up!");
  };

  const handleAnswerSelect = (index: number) => {
    if (showResult || !currentQuestion) return;
    setSelectedAnswer(index);
    setShowResult(true);

    const isCorrect = index === currentQuestion.correctAnswer;
    setAnswers(prev => [...prev, isCorrect]);

    // Update word progress
    updateWordProgress(currentQuestion.id, isCorrect);

    if (isCorrect) {
      const newCombo = combo + 1;
      const points = 10 * newCombo;
      setScore(prev => prev + points);
      setCombo(newCombo);

      toast.success("Correct!", {
        description: `+${points} points (${newCombo}x Combo)`
      });

      if (newCombo >= 3) {
        celebrate("explosion");
      }
    } else {
      setCombo(0);
      toast.error("Wrong!");
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setTimeLeft(15);
    } else {
      setPhase("finished");
      if (score >= 300) {
        celebrate("explosion");
      }
    }
  };

  const handleRestart = () => {
    setPhase('selection');
  };

  const calculateRewards = () => {
    const baseGems = Math.floor(score / 10);
    const accuracy = totalQuestions > 0 ? (answers.filter(a => a).length / totalQuestions) * 100 : 0;
    const bonusGems = accuracy >= 80 ? 20 : accuracy >= 60 ? 10 : 0;
    return { gems: baseGems + bonusGems, accuracy };
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
              <Zap className="h-6 w-6 text-accent" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">快速測驗</h1>
                <p className="text-sm text-muted-foreground">限時挑戰</p>
              </div>
            </div>

            <div className="w-20" />
          </div>

          {/* Vocabulary Selector with all filters */}
          <VocabularySelector
            mode="quiz"
            title="選擇測驗範圍"
            description="設定篩選條件，選擇要測驗的單字"
            onStart={startQuiz}
          />

          {/* Question Count */}
          <Card className="mt-4 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">題目數量</span>
              </div>
              <div className="flex gap-2">
                {[5, 10, 15, 20, 30].map((num) => (
                  <Button
                    key={num}
                    variant={questionCount === num ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQuestionCount(num)}
                  >
                    {num}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {/* Info Card */}
          <Card className="mt-4 p-4 bg-gradient-to-br from-accent/10 to-treasure/10 border-accent/20">
            <div className="flex items-start gap-3">
              <Flame className="h-5 w-5 text-accent mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">How it works</h3>
                <p className="text-sm text-muted-foreground">
                  Answer each question within 15 seconds.
                  Build combos for bonus points!
                  Get 80%+ accuracy for extra gem rewards.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Results Screen
  if (phase === "finished") {
    const { gems, accuracy } = calculateRewards();
    const correctCount = answers.filter(a => a).length;

    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Card className="p-8 text-center animate-fade-in">
            <div className="mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4">
                <Trophy className="h-10 w-10 text-primary-foreground" />
              </div>
              <h1 className="text-4xl font-bold text-foreground mb-2">Quiz Complete!</h1>
              <p className="text-muted-foreground">Great job! Here are your results</p>
            </div>

            {/* Score */}
            <div className="mb-8">
              <div className="text-6xl font-bold text-primary mb-2">{score}</div>
              <p className="text-muted-foreground">Total Score</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <Card className="p-4 bg-success/10 border-success/20">
                <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{correctCount}</div>
                <div className="text-sm text-muted-foreground">Correct</div>
              </Card>

              <Card className="p-4 bg-destructive/10 border-destructive/20">
                <XCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{totalQuestions - correctCount}</div>
                <div className="text-sm text-muted-foreground">Wrong</div>
              </Card>

              <Card className="p-4 bg-primary/10 border-primary/20">
                <Target className="h-6 w-6 text-primary mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{accuracy.toFixed(0)}%</div>
                <div className="text-sm text-muted-foreground">Accuracy</div>
              </Card>
            </div>

            {/* Rewards */}
            <Card className="p-6 mb-6 bg-gradient-to-br from-treasure/20 to-accent/20 border-treasure/30">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Award className="h-6 w-6 text-treasure" />
                <h3 className="text-xl font-bold text-foreground">Rewards</h3>
              </div>

              <div className="flex items-center justify-center gap-2 mb-2">
                <Gem className="h-8 w-8 text-treasure animate-pulse" />
                <span className="text-4xl font-bold text-foreground">+{gems}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {accuracy >= 80 && "Perfect! Bonus +20 gems"}
                {accuracy >= 60 && accuracy < 80 && "Good job! Bonus +10 gems"}
                {accuracy < 60 && "Keep practicing!"}
              </p>
            </Card>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                onClick={handleRestart}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Zap className="h-4 w-4" />
                Play Again
              </Button>
              <Button
                onClick={() => navigate("/practice/vocabulary")}
                className="flex-1 gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Hub
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Quiz Screen
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
            <Zap className="h-6 w-6 text-accent" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Quick Quiz</h1>
              <p className="text-sm text-muted-foreground">Timed Challenge</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{score}</div>
            <p className="text-xs text-muted-foreground">Score</p>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 flex items-center gap-3">
            <Clock className={`h-6 w-6 ${timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary"}`} />
            <div>
              <div className="text-2xl font-bold text-foreground">{timeLeft}s</div>
              <div className="text-xs text-muted-foreground">Time Left</div>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3">
            <Flame className={`h-6 w-6 ${combo >= 3 ? "text-warning animate-pulse" : "text-muted"}`} />
            <div>
              <div className="text-2xl font-bold text-foreground">{combo}x</div>
              <div className="text-xs text-muted-foreground">Combo</div>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3">
            <Target className="h-6 w-6 text-secondary" />
            <div>
              <div className="text-2xl font-bold text-foreground">{currentQuestionIndex + 1}/{totalQuestions}</div>
              <div className="text-xs text-muted-foreground">Question</div>
            </div>
          </Card>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <ProgressBar
            current={currentQuestionIndex + 1}
            max={totalQuestions}
            showValues={false}
          />
        </div>

        {/* Question Card */}
        {currentQuestion && (
          <Card className="p-8 mb-6 animate-fade-in">
            <div className="text-center mb-8">
              <Badge variant="outline" className="mb-4">
                Question {currentQuestionIndex + 1}
              </Badge>
              <h2 className="text-5xl font-bold text-foreground mb-2">
                {currentQuestion.word}
              </h2>
              {currentQuestion.ipa && (
                <p className="text-xl text-muted-foreground">{currentQuestion.ipa}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedAnswer === index;
                const isCorrect = index === currentQuestion.correctAnswer;
                const showCorrectAnswer = showResult && isCorrect;
                const showWrongAnswer = showResult && isSelected && !isCorrect;

                return (
                  <Button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={showResult}
                    variant={showCorrectAnswer ? "default" : showWrongAnswer ? "destructive" : "outline"}
                    className={`h-20 text-lg ${
                      showCorrectAnswer ? "bg-success hover:bg-success" :
                      showWrongAnswer ? "bg-destructive" :
                      ""
                    }`}
                  >
                    <span className="font-semibold mr-2">{String.fromCharCode(65 + index)}.</span>
                    {option}
                    {showCorrectAnswer && <CheckCircle2 className="ml-2 h-5 w-5" />}
                    {showWrongAnswer && <XCircle className="ml-2 h-5 w-5" />}
                  </Button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Next Button */}
        {showResult && (
          <div className="text-center animate-fade-in">
            <Button onClick={handleNext} size="lg" className="gap-2">
              {currentQuestionIndex < totalQuestions - 1 ? "Next Question" : "View Results"}
              <Zap className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickQuiz;
