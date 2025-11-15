import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import { 
  FlipVertical2,
  ArrowLeft,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Star,
  RotateCcw,
  TrendingUp
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface FlashcardData {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  example: string;
  synonyms: string[];
  antonyms: string[];
  level: number;
}

const mockFlashcards: FlashcardData[] = [
  {
    id: "1",
    word: "diligent",
    ipa: "/ˈdɪlɪdʒənt/",
    translation: "勤奮的、用功的",
    example: "She is a diligent student who studies every day.",
    synonyms: ["hardworking", "industrious"],
    antonyms: ["lazy", "idle"],
    level: 2
  },
  {
    id: "2",
    word: "persevere",
    ipa: "/ˌpɜːrsəˈvɪr/",
    translation: "堅持、不屈不撓",
    example: "Despite difficulties, he persevered in his studies.",
    synonyms: ["persist", "continue"],
    antonyms: ["quit", "give up"],
    level: 3
  },
  {
    id: "3",
    word: "efficient",
    ipa: "/ɪˈfɪʃnt/",
    translation: "有效率的",
    example: "This is an efficient way to learn vocabulary.",
    synonyms: ["effective", "productive"],
    antonyms: ["inefficient", "wasteful"],
    level: 1
  }
];

const Flashcards = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardLevels, setCardLevels] = useState<Record<string, number>>(
    mockFlashcards.reduce((acc, card) => ({ ...acc, [card.id]: card.level }), {})
  );
  
  const totalCards = mockFlashcards.length;
  const currentCard = mockFlashcards[currentIndex];
  const currentLevel = cardLevels[currentCard.id];

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      toast.success("卡片複習完成！", {
        description: `你已瀏覽完 ${totalCards} 張卡片`
      });
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const handleLevelUp = () => {
    if (currentLevel < 5) {
      setCardLevels(prev => ({
        ...prev,
        [currentCard.id]: Math.min(prev[currentCard.id] + 1, 5)
      }));
      toast.success("熟練度提升！", {
        description: `${currentCard.word} 升級為 LV${Math.min(currentLevel + 1, 5)}`
      });
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    toast.success("已重新開始");
  };

  const getLevelColor = (level: number) => {
    if (level <= 1) return "bg-destructive";
    if (level <= 2) return "bg-warning";
    if (level <= 3) return "bg-primary";
    if (level <= 4) return "bg-secondary";
    return "bg-success";
  };

  const getLevelLabel = (level: number) => {
    const labels = ["陌生", "認識", "熟悉", "精通", "大師"];
    return labels[level - 1] || labels[0];
  };

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
            <FlipVertical2 className="h-6 w-6 text-secondary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">翻轉卡片</h1>
              <p className="text-sm text-muted-foreground">滑動翻閱，快速記憶</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            重新開始
          </Button>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <ProgressBar 
            current={currentIndex + 1} 
            max={totalCards} 
            label={`卡片進度 (${currentIndex + 1}/${totalCards})`}
          />
        </div>

        {/* Card Container */}
        <div className="relative mb-8" style={{ perspective: "1000px" }}>
          <div
            className={`relative transition-all duration-500 cursor-pointer ${
              isFlipped ? "[transform:rotateY(180deg)]" : ""
            }`}
            style={{ transformStyle: "preserve-3d" }}
            onClick={handleFlip}
          >
            {/* Front Side */}
            <Card 
              className={`min-h-[400px] p-8 flex flex-col items-center justify-center ${
                isFlipped ? "invisible" : ""
              }`}
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="absolute top-6 left-6">
                <Badge variant="outline" className="gap-1">
                  卡片 {currentIndex + 1}/{totalCards}
                </Badge>
              </div>

              <div className="absolute top-6 right-6 flex items-center gap-2">
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < currentLevel 
                          ? `${getLevelColor(currentLevel).replace('bg-', 'text-')} fill-current`
                          : "text-muted"
                      }`}
                    />
                  ))}
                </div>
                <Badge className={getLevelColor(currentLevel)}>
                  LV{currentLevel}
                </Badge>
              </div>

              <div className="text-center space-y-4">
                <Button variant="ghost" size="sm" className="gap-1 mb-4">
                  <Volume2 className="h-4 w-4" />
                  發音
                </Button>

                <h2 className="text-6xl font-bold text-foreground mb-4">
                  {currentCard.word}
                </h2>
                <p className="text-2xl text-muted-foreground">{currentCard.ipa}</p>

                <div className="mt-8 pt-8 border-t">
                  <p className="text-sm text-muted-foreground">點擊卡片翻面</p>
                  <FlipVertical2 className="h-6 w-6 text-muted-foreground mx-auto mt-2 animate-pulse" />
                </div>
              </div>
            </Card>

            {/* Back Side */}
            <Card 
              className={`absolute inset-0 min-h-[400px] p-8 ${
                !isFlipped ? "invisible" : ""
              }`}
              style={{ 
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)"
              }}
            >
              <div className="absolute top-6 left-6">
                <Badge variant="secondary">答案</Badge>
              </div>

              <div className="absolute top-6 right-6">
                <Badge className={getLevelColor(currentLevel)}>
                  LV{currentLevel} - {getLevelLabel(currentLevel)}
                </Badge>
              </div>

              <div className="space-y-6">
                {/* Translation */}
                <div className="text-center py-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">中文翻譯</h3>
                  <p className="text-3xl font-bold text-foreground">{currentCard.translation}</p>
                </div>

                {/* Example */}
                <div className="p-4 rounded-lg bg-muted/50">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">例句</h3>
                  <p className="text-base text-foreground">{currentCard.example}</p>
                </div>

                {/* Synonyms & Antonyms */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                    <h3 className="text-sm font-semibold text-success mb-2">同義詞</h3>
                    <div className="space-y-1">
                      {currentCard.synonyms.map((word, i) => (
                        <Badge key={i} variant="outline" className="mr-2">
                          {word}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <h3 className="text-sm font-semibold text-destructive mb-2">反義詞</h3>
                    <div className="space-y-1">
                      {currentCard.antonyms.map((word, i) => (
                        <Badge key={i} variant="outline" className="mr-2">
                          {word}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Level Up Button */}
                <Button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLevelUp();
                  }}
                  className="w-full gap-2"
                  disabled={currentLevel >= 5}
                >
                  <TrendingUp className="h-4 w-4" />
                  {currentLevel >= 5 ? "已達最高等級" : "標記為已熟悉 +1"}
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <Button
            variant="outline"
            size="lg"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-5 w-5" />
            上一張
          </Button>

          <Button
            variant="default"
            size="lg"
            onClick={handleFlip}
            className="gap-2 px-8"
          >
            <FlipVertical2 className="h-5 w-5" />
            翻轉卡片
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={handleNext}
            disabled={currentIndex === totalCards - 1}
            className="gap-2"
          >
            下一張
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Keyboard Hint */}
        <Card className="p-4 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="outline">←</Badge>
              上一張
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Space</Badge>
              翻轉
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">→</Badge>
              下一張
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Flashcards;
