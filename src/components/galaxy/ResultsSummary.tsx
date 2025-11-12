import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEffect } from "react";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { ConfettiCanvas } from "@/components/galaxy/ConfettiCanvas";
import { 
  Trophy, 
  Target, 
  Flame, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Award,
  Zap,
  Gem,
  TrendingUp
} from "lucide-react";

interface QuestionResult {
  questionNumber: number;
  correct: boolean;
  category: string;
  timeTaken: number; // in seconds
}

interface ResultsSummaryProps {
  totalQuestions: number;
  correctAnswers: number;
  questionsResults: QuestionResult[];
  maxComboAchieved: number;
  totalEXP: number;
  totalGems: number;
  timeTaken: number; // in seconds
  onContinue: () => void;
}

export const ResultsSummary = ({
  totalQuestions,
  correctAnswers,
  questionsResults,
  maxComboAchieved,
  totalEXP,
  totalGems,
  timeTaken,
  onContinue,
}: ResultsSummaryProps) => {
  const { confettiRef, perfectScore, comboAchievement } = useConfetti();
  const accuracy = Math.round((correctAnswers / totalQuestions) * 100);
  const avgTimePerQuestion = Math.round(timeTaken / totalQuestions);
  const isPerfectScore = accuracy === 100;
  const isSpeedBonus = timeTaken < 300; // Less than 5 minutes
  const minutes = Math.floor(timeTaken / 60);
  const seconds = timeTaken % 60;

  // Trigger celebration effects on mount
  useEffect(() => {
    if (isPerfectScore) {
      setTimeout(() => perfectScore(), 500);
    } else if (accuracy >= 90) {
      setTimeout(() => comboAchievement(5), 500);
    } else if (accuracy >= 80) {
      setTimeout(() => comboAchievement(3), 500);
    }

    if (maxComboAchieved >= 7) {
      setTimeout(() => comboAchievement(7), 1000);
    } else if (maxComboAchieved >= 5) {
      setTimeout(() => comboAchievement(5), 1000);
    }
  }, [isPerfectScore, accuracy, maxComboAchieved, perfectScore, comboAchievement]);

  // Calculate bonuses
  const accuracyBonus = accuracy >= 90 ? 50 : accuracy >= 80 ? 30 : accuracy >= 70 ? 20 : 10;
  const speedBonus = isSpeedBonus ? 25 : 0;
  const comboBonus = maxComboAchieved >= 7 ? 30 : maxComboAchieved >= 5 ? 20 : maxComboAchieved >= 3 ? 10 : 0;
  const perfectBonus = isPerfectScore ? 50 : 0;

  const totalBonusGems = accuracyBonus + speedBonus + comboBonus + perfectBonus;
  const finalTotalGems = totalGems + totalBonusGems;

  // Get performance rating
  const getPerformanceRating = () => {
    if (accuracy === 100) return { text: "Perfect!", color: "text-primary", icon: Trophy };
    if (accuracy >= 90) return { text: "Excellent!", color: "text-secondary", icon: Award };
    if (accuracy >= 80) return { text: "Great Job!", color: "text-accent", icon: Target };
    if (accuracy >= 70) return { text: "Good Work!", color: "text-explorer", icon: CheckCircle };
    return { text: "Keep Trying!", color: "text-muted-foreground", icon: TrendingUp };
  };

  const performance = getPerformanceRating();
  const PerformanceIcon = performance.icon;

  return (
    <>
      <ConfettiCanvas ref={confettiRef} />
      <div className="fixed inset-0 bg-background/98 backdrop-blur-lg z-50 overflow-y-auto">
        <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-6 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 animate-pulse-glow">
                <PerformanceIcon className={`h-16 w-16 ${performance.color}`} />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground">
              Quest Complete!
            </h1>
            <p className={`text-2xl font-bold ${performance.color}`}>
              {performance.text}
            </p>
          </div>

          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Accuracy */}
            <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <div className="text-center space-y-3">
                <Target className="h-8 w-8 text-primary mx-auto" />
                <div>
                  <p className="text-4xl font-bold text-foreground">{accuracy}%</p>
                  <p className="text-sm text-muted-foreground">Accuracy</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {correctAnswers} / {totalQuestions} correct
                </div>
              </div>
            </Card>

            {/* Time */}
            <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
              <div className="text-center space-y-3">
                <Clock className="h-8 w-8 text-secondary mx-auto" />
                <div>
                  <p className="text-4xl font-bold text-foreground">
                    {minutes}:{String(seconds).padStart(2, '0')}
                  </p>
                  <p className="text-sm text-muted-foreground">Time Taken</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Avg: {avgTimePerQuestion}s per question
                </div>
              </div>
            </Card>

            {/* Max Combo */}
            <Card className="p-6 bg-gradient-to-br from-accent/10 to-orange-500/10 border-accent/20">
              <div className="text-center space-y-3">
                <Flame className="h-8 w-8 text-accent mx-auto" />
                <div>
                  <p className="text-4xl font-bold text-foreground">{maxComboAchieved}x</p>
                  <p className="text-sm text-muted-foreground">Max Combo</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {maxComboAchieved >= 7 ? "Legendary! 🔥🔥🔥" : 
                   maxComboAchieved >= 5 ? "Amazing! 🔥🔥" : 
                   maxComboAchieved >= 3 ? "Great! 🔥" : 
                   "Keep building!"}
                </div>
              </div>
            </Card>
          </div>

          {/* Question Breakdown */}
          <Card className="p-6">
            <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-secondary" />
              Question Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {questionsResults.map((result) => (
                <div
                  key={result.questionNumber}
                  className={`p-4 rounded-lg border-2 text-center transition-all duration-300 hover:scale-105 ${
                    result.correct
                      ? "border-secondary bg-secondary/10"
                      : "border-destructive bg-destructive/10"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    {result.correct ? (
                      <CheckCircle className="h-6 w-6 text-secondary" />
                    ) : (
                      <XCircle className="h-6 w-6 text-destructive" />
                    )}
                    <div>
                      <p className="text-lg font-bold text-foreground">Q{result.questionNumber}</p>
                      <p className="text-xs text-muted-foreground">{result.timeTaken}s</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {result.category}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Achievements & Bonuses */}
          <Card className="p-6 bg-gradient-to-br from-treasure/5 to-primary/5 border-treasure/20">
            <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <Award className="h-5 w-5 text-treasure" />
              Achievements & Bonuses
            </h3>
            <div className="space-y-3">
              {isPerfectScore && (
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-3">
                    <Trophy className="h-6 w-6 text-primary animate-pulse-glow" />
                    <div>
                      <p className="font-bold text-foreground">Perfect Score!</p>
                      <p className="text-xs text-muted-foreground">100% accuracy achieved</p>
                    </div>
                  </div>
                  <Badge className="bg-primary text-primary-foreground">+{perfectBonus} Gems</Badge>
                </div>
              )}

              {isSpeedBonus && (
                <div className="flex items-center justify-between p-3 bg-accent/10 rounded-lg border border-accent/20">
                  <div className="flex items-center gap-3">
                    <Zap className="h-6 w-6 text-accent animate-pulse" />
                    <div>
                      <p className="font-bold text-foreground">Speed Bonus!</p>
                      <p className="text-xs text-muted-foreground">Completed in under 5 minutes</p>
                    </div>
                  </div>
                  <Badge className="bg-accent text-accent-foreground">+{speedBonus} Gems</Badge>
                </div>
              )}

              {maxComboAchieved >= 3 && (
                <div className="flex items-center justify-between p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <div className="flex items-center gap-3">
                    <Flame className="h-6 w-6 text-orange-500 animate-pulse" />
                    <div>
                      <p className="font-bold text-foreground">Combo Master!</p>
                      <p className="text-xs text-muted-foreground">Max combo: {maxComboAchieved}x</p>
                    </div>
                  </div>
                  <Badge className="bg-orange-500 text-white">+{comboBonus} Gems</Badge>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg border border-secondary/20">
                <div className="flex items-center gap-3">
                  <Target className="h-6 w-6 text-secondary" />
                  <div>
                    <p className="font-bold text-foreground">Accuracy Bonus</p>
                    <p className="text-xs text-muted-foreground">{accuracy}% accuracy</p>
                  </div>
                </div>
                <Badge className="bg-secondary text-secondary-foreground">+{accuracyBonus} Gems</Badge>
              </div>
            </div>
          </Card>

          {/* Total Rewards Summary */}
          <Card className="p-8 bg-gradient-to-br from-primary via-accent to-secondary border-2 border-primary">
            <div className="text-center space-y-6">
              <h3 className="text-2xl font-bold text-foreground">Total Rewards Earned</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Total EXP */}
                <div className="p-6 bg-background/80 backdrop-blur-sm rounded-xl">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <TrendingUp className="h-8 w-8 text-primary" />
                    <span className="text-sm text-muted-foreground">Explorer EXP</span>
                  </div>
                  <p className="text-5xl font-bold text-foreground">{totalEXP}</p>
                </div>

                {/* Total Gems */}
                <div className="p-6 bg-background/80 backdrop-blur-sm rounded-xl">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <Gem className="h-8 w-8 text-treasure animate-pulse-glow" />
                    <span className="text-sm text-muted-foreground">Total Gems</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-5xl font-bold text-treasure">{finalTotalGems}</p>
                    {totalBonusGems > 0 && (
                      <p className="text-sm text-muted-foreground">
                        (Base: {totalGems} + Bonus: {totalBonusGems})
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar Simulation */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress to Next Level</span>
                  <span className="text-foreground font-medium">+{totalEXP} EXP</span>
                </div>
                <Progress value={65} className="h-3" />
                <p className="text-xs text-muted-foreground">1250 / 2000 EXP (Level 7 → 8)</p>
              </div>

              {/* Continue Button */}
              <Button
                onClick={onContinue}
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xl py-8 animate-pulse-glow"
              >
                <Trophy className="mr-2 h-6 w-6" />
                Open Treasure Chest!
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
    </>
  );
};
