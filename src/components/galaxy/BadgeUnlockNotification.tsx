import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Award, Crown } from "lucide-react";
import { useEffect } from "react";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { ConfettiCanvas } from "@/components/galaxy/ConfettiCanvas";

interface BadgeUnlockNotificationProps {
  badgeName: string;
  description: string;
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
  onDismiss: () => void;
}

export const BadgeUnlockNotification = ({
  badgeName,
  description,
  rarity,
  onDismiss,
}: BadgeUnlockNotificationProps) => {
  const { confettiRef, badgeUnlock } = useConfetti();

  useEffect(() => {
    const rarityMap = {
      Common: 'common' as const,
      Rare: 'rare' as const,
      Epic: 'epic' as const,
      Legendary: 'legendary' as const,
    };
    
    setTimeout(() => badgeUnlock(rarityMap[rarity]), 200);

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => onDismiss(), 5000);
    return () => clearTimeout(timer);
  }, [rarity, badgeUnlock, onDismiss]);

  const getIcon = () => {
    switch (rarity) {
      case "Legendary":
        return Crown;
      case "Epic":
        return Trophy;
      case "Rare":
        return Award;
      default:
        return Star;
    }
  };

  const getRarityColor = () => {
    switch (rarity) {
      case "Legendary":
        return "from-primary via-accent to-primary";
      case "Epic":
        return "from-accent via-orange-500 to-accent";
      case "Rare":
        return "from-secondary via-explorer to-secondary";
      default:
        return "from-muted to-muted";
    }
  };

  const Icon = getIcon();

  return (
    <>
      <ConfettiCanvas ref={confettiRef} />
      <div className="fixed top-4 right-4 z-[60] animate-slide-in-right">
        <Card
          className={`p-6 bg-gradient-to-br ${getRarityColor()} border-2 border-white/20 shadow-2xl cursor-pointer hover:scale-105 transition-transform`}
          onClick={onDismiss}
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm animate-pulse-glow">
              <Icon className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1 text-white">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg">Badge Unlocked!</h3>
                <Badge className="bg-white/20 text-white text-xs">
                  {rarity}
                </Badge>
              </div>
              <p className="font-bold text-xl mb-1">{badgeName}</p>
              <p className="text-sm text-white/90">{description}</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
};
