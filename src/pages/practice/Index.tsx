import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/galaxy/StatCard";
import { ProgressBar } from "@/components/galaxy/ProgressBar";
import { useNavigate } from "react-router-dom";
import {
  Compass,
  Gem,
  Trophy,
  MapPin,
  Sparkles,
  BookOpen,
  Target,
  Award
} from "lucide-react";
import heroImage from "@/assets/hero-adventure.jpg";

const Index = () => {
  const navigate = useNavigate();
  
  // Mock data - in real app would come from backend
  const explorerLevel = 7;
  const currentExp = 1250;
  const expToNextLevel = 2000;
  const gemsCollected = 3420;
  const badgesEarned = 12;
  const lessonsCompleted = 45;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background/90 to-secondary/20" />
        
        <div className="relative container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Badge className="bg-primary text-primary-foreground px-4 py-2 text-sm animate-float">
              <Sparkles className="h-4 w-4 mr-2 inline" />
              WordQuest 編年史
            </Badge>
            
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              展開你的
              <span className="block bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                英語冒險之旅
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              透過史詩級任務精通英語，收集珍貴寶石，解鎖傳奇成就
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                onClick={() => navigate("/practice/quests")}
              >
                <Compass className="mr-2 h-5 w-5" />
                開始冒險
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg transition-all duration-300"
                onClick={() => navigate("/practice/quests")}
              >
                <MapPin className="mr-2 h-5 w-5" />
                查看地圖
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Progress Dashboard */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
              你的探險者檔案
            </h2>
            <p className="text-muted-foreground">追蹤你在 WordQuest 世界的旅程</p>
          </div>

          {/* Level Progress */}
          <div className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-3 rounded-lg">
                  <Award className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-foreground">等級 {explorerLevel}</h3>
                  <p className="text-sm text-muted-foreground">詞彙探索者</p>
                </div>
              </div>
              <Badge variant="outline" className="border-primary text-primary px-3 py-1">
                距離等級 {explorerLevel + 1} 還有 {Math.round((currentExp / expToNextLevel) * 100)}%
              </Badge>
            </div>
            <ProgressBar 
              current={currentExp}
              max={expToNextLevel}
            />
            <p className="text-sm text-muted-foreground mt-2">
              {currentExp} / {expToNextLevel} 探索者經驗值
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              icon={Gem}
              label="收集的寶石"
              value={gemsCollected.toLocaleString()}
              subtitle="總寶藏"
              variant="treasure"
            />
            <StatCard
              icon={Trophy}
              label="獲得的徽章"
              value={badgesEarned}
              subtitle="已解鎖成就"
              variant="explorer"
            />
            <StatCard
              icon={BookOpen}
              label="完成的課程"
              value={lessonsCompleted}
              subtitle="知識任務"
            />
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20 rounded-xl p-8 text-center space-y-4">
            <Target className="h-12 w-12 text-accent mx-auto" />
            <h3 className="text-xl sm:text-2xl font-bold text-foreground">準備好下一個任務了嗎？</h3>
            <p className="text-muted-foreground max-w-xl mx-auto">
              繼續你的冒險，在 WordQuest 編年史中解鎖新領域
            </p>
            <Button
              size="lg"
              className="bg-accent hover:bg-accent/90 text-accent-foreground mt-4"
              onClick={() => navigate("/practice/quests")}
            >
              繼續學習
            </Button>
          </div>
        </div>
      </section>

      {/* Features Preview */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-foreground mb-12">
              你的冒險在等待
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: MapPin,
                  title: "探索領域",
                  description: "從古代文明到現代城市，穿梭於主題學習區域"
                },
                {
                  icon: Gem,
                  title: "收集寶石",
                  description: "完成課程獲得珍貴寶石，解鎖獨家內容"
                },
                {
                  icon: Trophy,
                  title: "解鎖徽章",
                  description: "達成里程碑，為你的檔案獲得傳奇探險者徽章"
                }
              ].map((feature, index) => (
                <div 
                  key={index}
                  className="bg-card border border-border rounded-lg p-6 text-center space-y-4 transition-all duration-300 hover:shadow-xl hover:-translate-y-2"
                >
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                    <feature.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
