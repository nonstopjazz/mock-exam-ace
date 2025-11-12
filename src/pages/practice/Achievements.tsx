import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACHIEVEMENTS, getRarityColor, getAchievementStats, type Achievement as AchievementType } from "@/data/galaxy/achievements";
import { useState, useMemo } from "react";

// Simulate user progress (in real app, this would come from backend/state management)
interface UserAchievement extends AchievementType {
  unlocked: boolean;
  progress?: number;
  unlockedDate?: string;
}

// Mock user achievement data - simulating some unlocked achievements
const getUserAchievements = (): UserAchievement[] => {
  return ACHIEVEMENTS.map((achievement) => {
    // Simulate some unlocked achievements for demo
    const isUnlocked = Math.random() > 0.7; // 30% chance unlocked
    const progress = achievement.maxProgress 
      ? Math.floor(Math.random() * achievement.maxProgress)
      : undefined;

    return {
      ...achievement,
      unlocked: isUnlocked,
      progress: isUnlocked ? achievement.maxProgress : progress,
      unlockedDate: isUnlocked ? "2024-01-" + Math.floor(Math.random() * 28 + 1) : undefined
    };
  });
};

const leaderboard = [
  { rank: 1, name: "Sarah Chen", gems: 15420, level: 24 },
  { rank: 2, name: "Mike Johnson", gems: 14890, level: 23 },
  { rank: 3, name: "Emma Williams", gems: 13650, level: 22 },
  { rank: 4, name: "You", gems: 3420, level: 7 },
  { rank: 5, name: "David Lee", gems: 3200, level: 8 },
];

const Achievements = () => {
  const [achievements] = useState<UserAchievement[]>(getUserAchievements());
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  
  const stats = useMemo(() => getAchievementStats(), []);
  const unlockedCount = useMemo(() => achievements.filter(a => a.unlocked).length, [achievements]);
  const legendaryUnlockedCount = useMemo(() => 
    achievements.filter(a => a.rarity === "Legendary" && a.unlocked).length, 
    [achievements]
  );

  const filteredAchievements = useMemo(() => {
    if (selectedCategory === "all") return achievements;
    if (selectedCategory === "unlocked") return achievements.filter(a => a.unlocked);
    if (selectedCategory === "locked") return achievements.filter(a => !a.unlocked);
    return achievements.filter(a => a.category === selectedCategory);
  }, [achievements, selectedCategory]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Trophy className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground">Achievements</h1>
              <p className="text-muted-foreground">Your legendary accomplishments</p>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">
                  {unlockedCount}/{stats.total}
                </p>
                <p className="text-sm text-muted-foreground">徽章已解鎖</p>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">
                  {legendaryUnlockedCount}/{stats.byRarity.Legendary}
                </p>
                <p className="text-sm text-muted-foreground">傳說徽章</p>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-accent/10 to-primary/10 border-accent/20">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">
                  {Math.round((unlockedCount / stats.total) * 100)}%
                </p>
                <p className="text-sm text-muted-foreground">完成度</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">4th</p>
                <p className="text-sm text-muted-foreground">全球排名</p>
              </div>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="all" className="space-y-6" onValueChange={setSelectedCategory}>
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="unlocked">已解鎖</TabsTrigger>
            <TabsTrigger value="locked">進行中</TabsTrigger>
            <TabsTrigger value="累積作答">累積作答</TabsTrigger>
            <TabsTrigger value="連續挑戰">連續挑戰</TabsTrigger>
            <TabsTrigger value="完美答題">完美答題</TabsTrigger>
            <TabsTrigger value="活動限定">活動限定</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <BadgeGrid achievements={filteredAchievements} />
          </TabsContent>

          <TabsContent value="unlocked">
            <BadgeGrid achievements={filteredAchievements} />
          </TabsContent>

          <TabsContent value="locked">
            <BadgeGrid achievements={filteredAchievements} />
          </TabsContent>

          <TabsContent value="累積作答">
            <BadgeGrid achievements={filteredAchievements} />
          </TabsContent>

          <TabsContent value="連續挑戰">
            <BadgeGrid achievements={filteredAchievements} />
          </TabsContent>

          <TabsContent value="完美答題">
            <BadgeGrid achievements={filteredAchievements} />
          </TabsContent>

          <TabsContent value="活動限定">
            <BadgeGrid achievements={filteredAchievements} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const BadgeGrid = ({ 
  achievements
}: { 
  achievements: UserAchievement[];
}) => {
  if (achievements.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center text-muted-foreground">
          <p className="text-lg">此分類暫無成就</p>
          <p className="text-sm mt-2">繼續探索，解鎖更多徽章！</p>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {achievements.map((achievement) => {
        const Icon = achievement.icon;
        
        return (
          <Card
            key={achievement.id}
            className={`relative overflow-hidden transition-all duration-300 ${
              achievement.unlocked
                ? "hover:shadow-xl hover:-translate-y-1"
                : "opacity-75"
            }`}
          >
            <div className="p-6">
              {/* Icon & Rarity */}
              <div className="flex items-start justify-between mb-4">
                <div className={`p-4 rounded-xl ${
                  achievement.unlocked 
                    ? "bg-primary/20 animate-pulse-glow" 
                    : "bg-muted"
                }`}>
                  <Icon className={`h-8 w-8 ${
                    achievement.unlocked ? "text-primary" : "text-muted-foreground"
                  }`} />
                </div>
                <Badge className={getRarityColor(achievement.rarity)}>
                  {achievement.rarity}
                </Badge>
              </div>

              {/* Title & Description */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-foreground mb-1">
                  {achievement.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  {achievement.nameEn}
                </p>
                <p className="text-sm text-muted-foreground">
                  {achievement.description}
                </p>
              </div>

              {/* Category & Rewards */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline" className="text-xs">
                  {achievement.category}
                </Badge>
                <Badge className="bg-primary/10 text-primary text-xs">
                  +{achievement.rewards.exp} EXP
                </Badge>
                <Badge className="bg-treasure/10 text-treasure text-xs">
                  +{achievement.rewards.gems} 💎
                </Badge>
              </div>

              {/* Progress or Unlock Date */}
              {achievement.unlocked ? (
                <p className="text-xs text-muted-foreground">
                  Unlocked: {achievement.unlockedDate}
                </p>
              ) : achievement.maxProgress ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">進度</span>
                    <span className="font-medium text-foreground">
                      {achievement.progress} / {achievement.maxProgress}
                    </span>
                  </div>
                  <Progress 
                    value={(achievement.progress! / achievement.maxProgress) * 100} 
                    className="h-2"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">繼續探索以解鎖</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default Achievements;
