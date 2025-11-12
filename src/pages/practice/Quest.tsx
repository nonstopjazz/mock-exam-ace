import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ComboIndicator } from "@/components/galaxy/ComboIndicator";
import { LivesCounter } from "@/components/galaxy/LivesCounter";
import { QuestionTimer } from "@/components/galaxy/QuestionTimer";
import { FeedbackAnimation } from "@/components/galaxy/FeedbackAnimation";
import { ResultsSummary } from "@/components/galaxy/ResultsSummary";
import { TreasureChestReveal } from "@/components/galaxy/TreasureChestReveal";
import { X, Eye, Sparkles, Award, Gem } from "lucide-react";
import { toast } from "sonner";

interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  category: string;
}

interface QuestionResult {
  questionNumber: number;
  correct: boolean;
  category: string;
  timeTaken: number;
}

const mockQuestions: Question[] = [
  {
    id: 1,
    question: "Which sentence is grammatically correct?",
    options: [
      "She don't like apples.",
      "She doesn't likes apples.",
      "She doesn't like apples.",
      "She not like apples."
    ],
    correctAnswer: 2,
    explanation: "Use 'doesn't' (does not) with third person singular subjects, followed by the base form of the verb.",
    category: "Grammar"
  },
  {
    id: 2,
    question: "What is the past tense of 'run'?",
    options: ["Runned", "Ran", "Running", "Runs"],
    correctAnswer: 1,
    explanation: "'Ran' is the irregular past tense form of 'run'.",
    category: "Vocabulary"
  },
  {
    id: 3,
    question: "Choose the correct preposition: 'I arrived ___ the station at 5 PM.'",
    options: ["in", "at", "on", "to"],
    correctAnswer: 1,
    explanation: "We use 'at' with specific locations like stations, stops, and addresses.",
    category: "Grammar"
  },
  {
    id: 4,
    question: "Which word is a synonym for 'happy'?",
    options: ["Sad", "Joyful", "Angry", "Tired"],
    correctAnswer: 1,
    explanation: "'Joyful' means full of joy and is a synonym for 'happy'.",
    category: "Vocabulary"
  },
  {
    id: 5,
    question: "What is the plural of 'child'?",
    options: ["Childs", "Children", "Childrens", "Child"],
    correctAnswer: 1,
    explanation: "'Children' is the irregular plural form of 'child'.",
    category: "Grammar"
  },
  {
    id: 6,
    question: "Which sentence uses 'have been' correctly?",
    options: [
      "I have been to Paris last year.",
      "I have been studying English for 3 years.",
      "I have been go there yesterday.",
      "I have been finished my homework."
    ],
    correctAnswer: 1,
    explanation: "'Have been' + verb-ing is used for actions that started in the past and continue to the present.",
    category: "Grammar"
  },
  {
    id: 7,
    question: "What does 'piece of cake' mean?",
    options: [
      "A dessert",
      "Something very difficult",
      "Something very easy",
      "A bakery item"
    ],
    correctAnswer: 2,
    explanation: "'Piece of cake' is an idiom meaning something is very easy to do.",
    category: "Idioms"
  },
  {
    id: 8,
    question: "Choose the correct form: 'If I ___ rich, I would travel the world.'",
    options: ["am", "was", "were", "be"],
    correctAnswer: 2,
    explanation: "In second conditional sentences, we use 'were' for all subjects (formal grammar).",
    category: "Grammar"
  },
  {
    id: 9,
    question: "What is an antonym of 'beautiful'?",
    options: ["Pretty", "Gorgeous", "Ugly", "Lovely"],
    correctAnswer: 2,
    explanation: "'Ugly' is the opposite (antonym) of 'beautiful'.",
    category: "Vocabulary"
  },
  {
    id: 10,
    question: "Which word completes the phrase: 'Make ___'?",
    options: ["do", "sense", "going", "being"],
    correctAnswer: 1,
    explanation: "'Make sense' is a common collocation meaning to be logical or understandable.",
    category: "Collocations"
  }
];

const Quest = () => {
  const navigate = useNavigate();
  const { lessonId } = useParams();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [lives, setLives] = useState(3);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalEXP, setTotalEXP] = useState(0);
  const [totalGems, setTotalGems] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showTreasure, setShowTreasure] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startTime] = useState(Date.now());
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [questionsResults, setQuestionsResults] = useState<QuestionResult[]>([]);

  const currentQuestion = mockQuestions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / mockQuestions.length) * 100;

  useEffect(() => {
    if (combo > maxCombo) {
      setMaxCombo(combo);
    }
  }, [combo, maxCombo]);

  const getComboMultiplier = () => {
    if (combo >= 7) return 3;
    if (combo >= 5) return 2;
    if (combo >= 3) return 1.5;
    return 1;
  };

  const calculateRewards = (correct: boolean) => {
    if (correct) {
      const multiplier = getComboMultiplier();
      const baseEXP = 10;
      const baseGems = 5;
      
      const earnedEXP = Math.round(baseEXP * multiplier);
      const earnedGems = Math.round(baseGems * multiplier);
      
      setTotalEXP(prev => prev + earnedEXP);
      setTotalGems(prev => prev + earnedGems);
      
      return { exp: earnedEXP, gems: earnedGems };
    }
    return { exp: 0, gems: 0 };
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (showFeedback || selectedAnswer !== null) return;
    setSelectedAnswer(answerIndex);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) {
      toast.error("Please select an answer!");
      return;
    }

    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);
    const correct = selectedAnswer === currentQuestion.correctAnswer;
    setIsCorrect(correct);

    // Store question result
    setQuestionsResults(prev => [...prev, {
      questionNumber: currentQuestionIndex + 1,
      correct,
      category: currentQuestion.category,
      timeTaken
    }]);

    if (correct) {
      setCombo(prev => prev + 1);
      setTotalCorrect(prev => prev + 1);
      const rewards = calculateRewards(true);
      toast.success(`Correct! +${rewards.exp} EXP, +${rewards.gems} Gems`, {
        description: combo >= 2 ? `${combo + 1}x Combo! ${getComboMultiplier()}x multiplier` : undefined
      });
    } else {
      setCombo(0);
      if (lives > 1) {
        setLives(prev => prev - 1);
      }
      toast.error("Wrong answer!", {
        description: "Combo reset to 0"
      });
    }

    setShowFeedback(true);
  };

  const handleContinue = () => {
    setShowFeedback(false);
    setSelectedAnswer(null);

    if (currentQuestionIndex < mockQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setQuestionStartTime(Date.now());
    } else {
      setShowResults(true);
    }
  };

  const handleUseHint = () => {
    if (hintsUsed >= 2) {
      toast.error("No more hints available!");
      return;
    }
    
    toast.info("Hint: One wrong answer has been removed!", {
      description: `You have ${2 - hintsUsed - 1} hint(s) remaining`
    });
    
    setHintsUsed(prev => prev + 1);
  };

  const getTreasureReward = () => {
    const accuracy = (totalCorrect / mockQuestions.length) * 100;
    const totalTimeTaken = Math.floor((Date.now() - startTime) / 1000);
    const timeTakenMinutes = Math.floor(totalTimeTaken / 60);
    
    // Legendary: 100% accuracy OR time < 5 minutes
    if (accuracy === 100 || timeTakenMinutes < 5) {
      const gems = 150 + Math.floor(Math.random() * 150);
      return {
        type: "Legendary" as const,
        gems,
        items: ["Legendary Explorer Badge", "Double XP Boost"]
      };
    }
    
    // Rare: >= 80% accuracy OR 5+ combo achieved
    if (accuracy >= 80 || maxCombo >= 5) {
      const gems = 60 + Math.floor(Math.random() * 40);
      return {
        type: "Rare" as const,
        gems,
        items: ["Extra Life Power-up"]
      };
    }
    
    // Common: default
    const gems = 20 + Math.floor(Math.random() * 30);
    return {
      type: "Common" as const,
      gems,
      items: []
    };
  };

  const handleResultsContinue = () => {
    setShowResults(false);
    setShowTreasure(true);
  };

  const handleQuestComplete = () => {
    navigate("/quests");
  };

  const handleExit = () => {
    if (window.confirm("Are you sure you want to exit? Your progress will be saved.")) {
      navigate("/quests");
    }
  };

  const totalTimeTaken = Math.floor((Date.now() - startTime) / 1000);

  if (showTreasure) {
    const reward = getTreasureReward();
    return (
      <TreasureChestReveal
        reward={reward}
        onContinue={handleQuestComplete}
      />
    );
  }

  if (showResults) {
    return (
      <ResultsSummary
        totalQuestions={mockQuestions.length}
        correctAnswers={totalCorrect}
        questionsResults={questionsResults}
        maxComboAchieved={maxCombo}
        totalEXP={totalEXP}
        totalGems={totalGems}
        timeTaken={totalTimeTaken}
        onContinue={handleResultsContinue}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExit}
                className="hover:bg-destructive/10"
              >
                <X className="h-5 w-5" />
              </Button>
              <Badge variant="outline" className="text-sm">
                Lesson {lessonId || "1"}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <LivesCounter lives={lives} maxLives={3} />
              <div className="flex items-center gap-1 bg-treasure/10 px-3 py-1 rounded-lg">
                <Gem className="h-4 w-4 text-treasure" />
                <span className="text-sm font-bold text-foreground">{totalGems}</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Question {currentQuestionIndex + 1} of {mockQuestions.length}
              </span>
              <span className="font-medium text-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>

          {/* Timer */}
          <QuestionTimer totalSeconds={600} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Question Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Combo Indicator */}
            {combo >= 3 && (
              <div className="flex justify-center">
                <ComboIndicator combo={combo} />
              </div>
            )}

            {/* Question Card */}
            <Card className="p-8 bg-card border-2 border-border">
              <div className="space-y-6">
                {/* Category Badge */}
                <Badge className="bg-secondary text-secondary-foreground">
                  {currentQuestion.category}
                </Badge>

                {/* Question */}
                <h2 className="text-2xl font-bold text-foreground leading-relaxed">
                  {currentQuestion.question}
                </h2>

                {/* Options */}
                <div className="space-y-3">
                  {currentQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={showFeedback}
                      className={`w-full p-4 text-left rounded-lg border-2 transition-all duration-300 ${
                        selectedAnswer === index
                          ? "border-primary bg-primary/10 scale-105"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted"
                      } ${showFeedback ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold ${
                            selectedAnswer === index
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground text-muted-foreground"
                          }`}
                        >
                          {String.fromCharCode(65 + index)}
                        </div>
                        <span className="text-foreground font-medium">{option}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={handleSubmitAnswer}
                    disabled={selectedAnswer === null || showFeedback}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    size="lg"
                  >
                    Submit Answer
                  </Button>
                  <Button
                    onClick={handleUseHint}
                    disabled={hintsUsed >= 2 || showFeedback}
                    variant="outline"
                    size="lg"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Hint ({2 - hintsUsed})
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Stats Sidebar */}
          <div className="space-y-4">
            {/* Current Stats */}
            <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Current Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Correct Answers</span>
                  <span className="text-xl font-bold text-foreground">{totalCorrect}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Current Combo</span>
                  <span className="text-xl font-bold text-primary">{combo}x</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Max Combo</span>
                  <span className="text-xl font-bold text-accent">{maxCombo}x</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total EXP</span>
                  <span className="text-xl font-bold text-foreground">{totalEXP}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Gems</span>
                  <div className="flex items-center gap-1">
                    <Gem className="h-4 w-4 text-treasure" />
                    <span className="text-xl font-bold text-treasure">{totalGems}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Multiplier Info */}
            <Card className="p-6 bg-gradient-to-br from-secondary/5 to-explorer/5 border-secondary/20">
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-secondary" />
                Combo Bonuses
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">3+ Streak</span>
                  <Badge className="bg-yellow-500/20 text-yellow-700">1.5x</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">5+ Streak</span>
                  <Badge className="bg-orange-500/20 text-orange-700">2x</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">7+ Streak</span>
                  <Badge className="bg-red-500/20 text-red-700">3x</Badge>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Feedback Animation */}
      {showFeedback && (
        <FeedbackAnimation
          isCorrect={isCorrect}
          explanation={currentQuestion.explanation}
          correctAnswer={
            !isCorrect ? currentQuestion.options[currentQuestion.correctAnswer] : undefined
          }
          onContinue={handleContinue}
        />
      )}
    </div>
  );
};

export default Quest;
