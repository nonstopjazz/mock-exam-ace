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
  Award
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useConfetti } from "@/hooks/galaxy/useConfetti";

interface QuizQuestion {
  id: string;
  word: string;
  options: string[];
  correctAnswer: number;
  ipa?: string;
}

const mockQuestions: QuizQuestion[] = [
  {
    id: "1",
    word: "abundant",
    options: ["稀少的", "豐富的", "困難的", "簡單的"],
    correctAnswer: 1,
    ipa: "/əˈbʌndənt/"
  },
  {
    id: "2",
    word: "comprehend",
    options: ["忘記", "理解", "拒絕", "接受"],
    correctAnswer: 1,
    ipa: "/ˌkɑːmprɪˈhend/"
  },
  {
    id: "3",
    word: "elaborate",
    options: ["簡單的", "詳細的", "快速的", "緩慢的"],
    correctAnswer: 1,
    ipa: "/ɪˈlæbərət/"
  },
  {
    id: "4",
    word: "fragile",
    options: ["堅固的", "柔軟的", "脆弱的", "粗糙的"],
    correctAnswer: 2,
    ipa: "/ˈfrædʒl/"
  },
  {
    id: "5",
    word: "genuine",
    options: ["虛假的", "真實的", "昂貴的", "便宜的"],
    correctAnswer: 1,
    ipa: "/ˈdʒenjuɪn/"
  }
];

const QuickQuiz = () => {
  const navigate = useNavigate();
  const { celebrate } = useConfetti();
  const [gameState, setGameState] = useState<"playing" | "finished">("playing");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [answers, setAnswers] = useState<boolean[]>([]);

  const totalQuestions = mockQuestions.length;
  const currentQuestion = mockQuestions[currentQuestionIndex];

  // Timer
  useEffect(() => {
    if (gameState === "playing" && !showResult && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
    
    if (timeLeft === 0 && !showResult) {
      handleTimeout();
    }
  }, [timeLeft, showResult, gameState]);

  const handleTimeout = () => {
    setShowResult(true);
    setCombo(0);
    setAnswers(prev => [...prev, false]);
    toast.error("時間到！");
  };

  const handleAnswerSelect = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);

    const isCorrect = index === currentQuestion.correctAnswer;
    setAnswers(prev => [...prev, isCorrect]);

    if (isCorrect) {
      const newCombo = combo + 1;
      const points = 10 * newCombo;
      setScore(prev => prev + points);
      setCombo(newCombo);
      
      toast.success("答對了！", {
        description: `+${points} 分 (${newCombo}x Combo)`
      });

      if (newCombo >= 3) {
        celebrate("explosion");
      }
    } else {
      setCombo(0);
      toast.error("答錯了！");
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setTimeLeft(15);
    } else {
      setGameState("finished");
      if (score >= 300) {
        celebrate("explosion");
      }
    }
  };

  const handleRestart = () => {
    setGameState("playing");
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setCombo(0);
    setTimeLeft(15);
    setAnswers([]);
  };

  const calculateRewards = () => {
    const baseGems = Math.floor(score / 10);
    const accuracy = (answers.filter(a => a).length / totalQuestions) * 100;
    const bonusGems = accuracy >= 80 ? 20 : accuracy >= 60 ? 10 : 0;
    return { gems: baseGems + bonusGems, accuracy };
  };

  // Results Screen
  if (gameState === "finished") {
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
              <h1 className="text-4xl font-bold text-foreground mb-2">測驗完成！</h1>
              <p className="text-muted-foreground">太棒了！這是你的成績單</p>
            </div>

            {/* Score */}
            <div className="mb-8">
              <div className="text-6xl font-bold text-primary mb-2">{score}</div>
              <p className="text-muted-foreground">總分</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <Card className="p-4 bg-success/10 border-success/20">
                <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{correctCount}</div>
                <div className="text-sm text-muted-foreground">答對</div>
              </Card>

              <Card className="p-4 bg-destructive/10 border-destructive/20">
                <XCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{totalQuestions - correctCount}</div>
                <div className="text-sm text-muted-foreground">答錯</div>
              </Card>

              <Card className="p-4 bg-primary/10 border-primary/20">
                <Target className="h-6 w-6 text-primary mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">{accuracy.toFixed(0)}%</div>
                <div className="text-sm text-muted-foreground">正確率</div>
              </Card>
            </div>

            {/* Rewards */}
            <Card className="p-6 mb-6 bg-gradient-to-br from-treasure/20 to-accent/20 border-treasure/30">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Award className="h-6 w-6 text-treasure" />
                <h3 className="text-xl font-bold text-foreground">獲得獎勵</h3>
              </div>
              
              <div className="flex items-center justify-center gap-2 mb-2">
                <Gem className="h-8 w-8 text-treasure animate-pulse-glow" />
                <span className="text-4xl font-bold text-foreground">+{gems}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {accuracy >= 80 && "完美表現！獲得額外獎勵 +20"}
                {accuracy >= 60 && accuracy < 80 && "表現良好！獲得獎勵加成 +10"}
                {accuracy < 60 && "繼續加油！下次會更好"}
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
                再玩一次
              </Button>
              <Button 
                onClick={() => navigate("/practice/vocabulary")}
                className="flex-1 gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                返回複習中心
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

          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{score}</div>
            <p className="text-xs text-muted-foreground">分數</p>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 flex items-center gap-3">
            <Clock className={`h-6 w-6 ${timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary"}`} />
            <div>
              <div className="text-2xl font-bold text-foreground">{timeLeft}s</div>
              <div className="text-xs text-muted-foreground">剩餘時間</div>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3">
            <Flame className={`h-6 w-6 ${combo >= 3 ? "text-warning animate-pulse" : "text-muted"}`} />
            <div>
              <div className="text-2xl font-bold text-foreground">{combo}x</div>
              <div className="text-xs text-muted-foreground">連擊</div>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3">
            <Target className="h-6 w-6 text-secondary" />
            <div>
              <div className="text-2xl font-bold text-foreground">{currentQuestionIndex + 1}/{totalQuestions}</div>
              <div className="text-xs text-muted-foreground">題號</div>
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
        <Card className="p-8 mb-6 animate-fade-in">
          <div className="text-center mb-8">
            <Badge variant="outline" className="mb-4">
              第 {currentQuestionIndex + 1} 題
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

        {/* Next Button */}
        {showResult && (
          <div className="text-center animate-fade-in">
            <Button onClick={handleNext} size="lg" className="gap-2">
              {currentQuestionIndex < totalQuestions - 1 ? "下一題" : "查看成績"}
              <Zap className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickQuiz;
