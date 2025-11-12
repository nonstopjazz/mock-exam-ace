import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Lock, MapPin, BookOpen, CheckCircle2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Territory {
  id: string;
  name: string;
  description: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  totalLessons: number;
  completedLessons: number;
  isLocked: boolean;
  category: string;
}

const territories: Territory[] = [
  {
    id: "1",
    name: "現在式森林",
    description: "掌握現在簡單式和現在進行式的基礎",
    difficulty: "Beginner",
    totalLessons: 12,
    completedLessons: 8,
    isLocked: false,
    category: "文法"
  },
  {
    id: "2",
    name: "詞彙山谷",
    description: "探索日常必備詞彙和常用短語",
    difficulty: "Beginner",
    totalLessons: 15,
    completedLessons: 15,
    isLocked: false,
    category: "詞彙"
  },
  {
    id: "3",
    name: "過去式平原",
    description: "穿越簡單過去式和過去進行式",
    difficulty: "Intermediate",
    totalLessons: 10,
    completedLessons: 3,
    isLocked: false,
    category: "文法"
  },
  {
    id: "4",
    name: "慣用語遺跡",
    description: "揭開英語慣用語和表達方式的奧秘",
    difficulty: "Intermediate",
    totalLessons: 20,
    completedLessons: 0,
    isLocked: false,
    category: "詞彙"
  },
  {
    id: "5",
    name: "條件句峽谷",
    description: "穿梭於第一、第二和第三條件句",
    difficulty: "Advanced",
    totalLessons: 8,
    completedLessons: 0,
    isLocked: true,
    category: "文法"
  },
  {
    id: "6",
    name: "片語動詞巔峰",
    description: "攀登至精通必備片語動詞",
    difficulty: "Advanced",
    totalLessons: 18,
    completedLessons: 0,
    isLocked: true,
    category: "詞彙"
  }
];

const Quests = () => {
  const navigate = useNavigate();
  
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "bg-secondary/20 text-secondary border-secondary/30";
      case "Intermediate":
        return "bg-accent/20 text-accent border-accent/30";
      case "Advanced":
        return "bg-destructive/20 text-destructive border-destructive/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner": return "初級";
      case "Intermediate": return "中級";
      case "Advanced": return "高級";
      default: return difficulty;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-lg bg-primary/10">
              <MapPin className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground">任務地圖</h1>
              <p className="text-muted-foreground">選擇你的下一個冒險</p>
            </div>
          </div>
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant="outline" className="cursor-pointer hover:bg-muted">全部領域</Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-muted">文法</Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-muted">詞彙</Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-muted">初級</Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-muted">中級</Badge>
        </div>

        {/* Territories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {territories.map((territory) => {
            const progress = (territory.completedLessons / territory.totalLessons) * 100;
            const isComplete = territory.completedLessons === territory.totalLessons;

            return (
              <Card
                key={territory.id}
                className={`relative overflow-hidden transition-all duration-300 ${
                  territory.isLocked
                    ? "opacity-60"
                    : "hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                }`}
              >
                {/* Category Badge */}
                <div className="absolute top-4 right-4 z-10">
                  <Badge variant="secondary" className="text-xs">
                    {territory.category}
                  </Badge>
                </div>

                {/* Locked Overlay */}
                {territory.isLocked && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
                    <div className="text-center">
                      <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground font-medium">
                        完成前面的領域以解鎖
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-6">
                  {/* Title & Description */}
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                      {isComplete && <CheckCircle2 className="h-5 w-5 text-secondary" />}
                      {territory.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{territory.description}</p>
                  </div>

                  {/* Difficulty Badge */}
                  <Badge className={`${getDifficultyColor(territory.difficulty)} mb-4`}>
                    {getDifficultyLabel(territory.difficulty)}
                  </Badge>

                  {/* Progress */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">進度</span>
                      <span className="font-medium text-foreground">
                        {territory.completedLessons} / {territory.totalLessons} 課程
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* Action Button */}
                  <Button
                    className="w-full"
                    variant={isComplete ? "outline" : "default"}
                    disabled={territory.isLocked}
                    onClick={() => !territory.isLocked && navigate(`/quest/${territory.id}`)}
                  >
                    {territory.isLocked ? (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        已鎖定
                      </>
                    ) : isComplete ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        複習
                      </>
                    ) : territory.completedLessons > 0 ? (
                      <>
                        <Clock className="mr-2 h-4 w-4" />
                        繼續
                      </>
                    ) : (
                      <>
                        <BookOpen className="mr-2 h-4 w-4" />
                        開始任務
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Quests;
