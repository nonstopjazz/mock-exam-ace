import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { ConfettiCanvas } from "@/components/galaxy/ConfettiCanvas";
import { Gem, Sparkles, Trophy, Zap } from "lucide-react";

interface TreasureReward {
  type: "Common" | "Rare" | "Legendary";
  gems: number;
  items: string[];
}

interface TreasureChestRevealProps {
  reward: TreasureReward;
  onContinue: () => void;
}

export const TreasureChestReveal = ({ reward, onContinue }: TreasureChestRevealProps) => {
  const [isOpened, setIsOpened] = useState(false);
  const { confettiRef, chestOpening } = useConfetti();

  useEffect(() => {
    if (isOpened) {
      const rarity = reward.type.toLowerCase() as 'common' | 'rare' | 'legendary';
      chestOpening(rarity);
    }
  }, [isOpened, reward.type, chestOpening]);

  const getChestColor = () => {
    switch (reward.type) {
      case "Legendary":
        return "from-primary via-accent to-primary";
      case "Rare":
        return "from-secondary via-explorer to-secondary";
      default:
        return "from-map via-muted to-map";
    }
  };

  const getChestEmoji = () => {
    switch (reward.type) {
      case "Legendary":
        return "👑";
      case "Rare":
        return "💎";
      default:
        return "📦";
    }
  };

  return (
    <>
      <ConfettiCanvas ref={confettiRef} />
      <div className="fixed inset-0 bg-background/98 backdrop-blur-lg z-50 flex items-center justify-center animate-fade-in">
        <Card className="max-w-2xl w-full mx-4 p-8 bg-gradient-to-br from-card to-background">
        <div className="text-center space-y-6">
          {/* Title */}
          <div>
            <h2 className="text-4xl font-bold text-foreground mb-2">
              Quest Complete! 🎊
            </h2>
            <p className="text-muted-foreground">You've earned a treasure chest!</p>
          </div>

          {/* Chest Animation */}
          <div className="relative py-8">
            <div
              className={`w-48 h-48 mx-auto rounded-3xl bg-gradient-to-br ${getChestColor()} flex items-center justify-center cursor-pointer transition-all duration-500 ${
                isOpened
                  ? "scale-110 animate-pulse-glow"
                  : "hover:scale-105 animate-float"
              }`}
              onClick={() => setIsOpened(true)}
            >
              <span className="text-8xl">{getChestEmoji()}</span>
            </div>
            
            {!isOpened && (
              <p className="text-sm text-muted-foreground mt-4 animate-pulse">
                Click the chest to open it!
              </p>
            )}

            {/* Sparkle Effects */}
            {isOpened && (
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Sparkles
                    key={i}
                    className="absolute text-primary animate-ping"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Chest Type Badge */}
          <Badge
            className={`text-lg px-6 py-2 ${
              reward.type === "Legendary"
                ? "bg-gradient-to-r from-primary to-accent"
                : reward.type === "Rare"
                ? "bg-gradient-to-r from-secondary to-explorer"
                : "bg-muted"
            }`}
          >
            {reward.type} Chest
          </Badge>

          {/* Rewards Reveal */}
          {isOpened && (
            <div className="space-y-4 animate-scale-in">
              {/* Gems */}
              <div className="flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border-2 border-primary/20">
                <Gem className="h-8 w-8 text-treasure animate-pulse-glow" />
                <span className="text-3xl font-bold text-foreground">
                  +{reward.gems} Gems
                </span>
              </div>

              {/* Additional Items */}
              {reward.items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Bonus Items:</p>
                  {reward.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg"
                    >
                      {item.includes("Badge") ? (
                        <Trophy className="h-5 w-5 text-primary" />
                      ) : (
                        <Zap className="h-5 w-5 text-accent" />
                      )}
                      <span className="text-foreground font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Continue Button */}
              <Button
                onClick={onContinue}
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-lg py-6"
              >
                Continue Adventure
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
    </>
  );
};
