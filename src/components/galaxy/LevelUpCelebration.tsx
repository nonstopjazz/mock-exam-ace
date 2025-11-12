import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Sparkles, Award, Zap } from "lucide-react";
import { useEffect } from "react";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { ConfettiCanvas } from "@/components/galaxy/ConfettiCanvas";

interface LevelUpCelebrationProps {
  newLevel: number;
  newTitle: string;
  rewardsGems: number;
  onContinue: () => void;
}

export const LevelUpCelebration = ({
  newLevel,
  newTitle,
  rewardsGems,
  onContinue,
}: LevelUpCelebrationProps) => {
  const { confettiRef, levelUp } = useConfetti();

  useEffect(() => {
    // Trigger level up celebration
    setTimeout(() => levelUp(), 300);
  }, [levelUp]);

  return (
    <>
      <ConfettiCanvas ref={confettiRef} />
      <div className="fixed inset-0 bg-background/98 backdrop-blur-lg z-50 flex items-center justify-center animate-fade-in">
        <Card className="max-w-lg w-full mx-4 p-8 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 border-2 border-primary">
          <div className="text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="p-8 rounded-full bg-gradient-to-br from-primary to-accent animate-pulse-glow">
                  <Trophy className="h-20 w-20 text-primary-foreground" />
                </div>
                <div className="absolute -top-2 -right-2">
                  <Sparkles className="h-12 w-12 text-primary animate-spin" style={{ animationDuration: '3s' }} />
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h2 className="text-5xl font-bold text-foreground animate-pulse">
                Level {newLevel}!
              </h2>
              <p className="text-xl text-muted-foreground">You've leveled up!</p>
            </div>

            {/* New Title */}
            <div className="p-6 bg-background/80 backdrop-blur-sm rounded-xl border-2 border-primary/20">
              <div className="flex items-center justify-center gap-3 mb-2">
                <Award className="h-6 w-6 text-primary" />
                <span className="text-sm text-muted-foreground">New Title Unlocked</span>
              </div>
              <h3 className="text-2xl font-bold text-primary">{newTitle}</h3>
            </div>

            {/* Rewards */}
            <div className="p-4 bg-gradient-to-r from-treasure/10 to-primary/10 rounded-lg border border-treasure/20">
              <div className="flex items-center justify-center gap-3">
                <Zap className="h-6 w-6 text-treasure animate-pulse" />
                <span className="text-xl font-bold text-foreground">
                  +{rewardsGems} Gems Bonus!
                </span>
              </div>
            </div>

            {/* Achievement Badge */}
            <Badge className="bg-gradient-to-r from-primary to-accent text-white px-6 py-2 text-lg">
              🎉 Achievement Unlocked!
            </Badge>

            {/* Continue Button */}
            <Button
              onClick={onContinue}
              size="lg"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xl py-8"
            >
              Continue Adventure
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
};
