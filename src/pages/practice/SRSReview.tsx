import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import {
  Brain,
  ArrowLeft,
  Volume2,
  BookMarked,
  Clock,
  TrendingUp,
  X,
  Minus,
  Check
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface VocabularyCard {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  example: string;
  exampleTranslation: string;
  level: number;
  nextReview: string;
}

const mockCards: VocabularyCard[] = [
  {
    id: "1",
    word: "accomplish",
    ipa: "/əˈkʌmplɪʃ/",
    translation: "完成、實現",
    example: "She accomplished her goal of learning English.",
    exampleTranslation: "她完成了學習英語的目標。",
    level: 2,
    nextReview: "2 小時後"
  },
  {
    id: "2",
    word: "ambitious",
    ipa: "/æmˈbɪʃəs/",
    translation: "有抱負的、野心勃勃的",
    example: "He is an ambitious student who wants to study abroad.",
    exampleTranslation: "他是一位想要出國留學的有抱負的學生。",
    level: 1,
    nextReview: "1 天後"
  },
  {
    id: "3",
    word: "consequence",
    ipa: "/ˈkɑːnsɪkwens/",
    translation: "結果、後果",
    example: "Every action has its consequences.",
    exampleTranslation: "每個行動都有其後果。",
    level: 3,
    nextReview: "3 天後"
  }
];

const SRSReview = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const totalCards = mockCards.length;
  const currentCard = mockCards[currentIndex];

  const handleResponse = (difficulty: "forgot" | "vague" | "remembered") => {
    const difficultyMap = {
      forgot: { label: "忘記了", nextReview: "10 分鐘後", color: "destructive" },
      vague: { label: "有點模糊", nextReview: "1 天後", color: "warning" },
      remembered: { label: "記得很清楚", nextReview: "3 天後", color: "success" }
    };

    const response = difficultyMap[difficulty];

    toast.success(`已標記：${response.label}`, {
      description: `下次複習時間：${response.nextReview}`
    });

    setReviewedCount(prev => prev + 1);

    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowAnswer(false);
    } else {
      toast.success("今日複習完成！", {
        description: `你完成了 ${totalCards} 個單字的複習`
      });
      setTimeout(() => navigate("/practice/vocabulary"), 1500);
    }
  };

  const getLevelColor = (level: number) => {
    if (level <= 1) return "text-destructive";
    if (level <= 2) return "text-warning";
    if (level <= 3) return "text-primary";
    return "text-success";
  };

  const getLevelLabel = (level: number) => {
    if (level <= 1) return "陌生";
    if (level <= 2) return "認識";
    if (level <= 3) return "熟悉";
    return "精通";
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
            <Brain className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">SRS 智慧複習</h1>
              <p className="text-sm text-muted-foreground">間隔重複記憶系統</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{reviewedCount}/{totalCards}</div>
            <p className="text-xs text-muted-foreground">已完成</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <ProgressBar
            current={reviewedCount}
            max={totalCards}
            label="複習進度"
          />
        </div>

        {/* Main Card */}
        <Card className="relative overflow-hidden mb-6 animate-fade-in">
          {/* Card Header */}
          <div className="p-6 border-b bg-gradient-to-br from-primary/5 to-accent/5">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="outline" className="gap-1">
                <BookMarked className="h-3 w-3" />
                單字 {currentIndex + 1}/{totalCards}
              </Badge>

              <div className="flex items-center gap-2">
                <Badge className={getLevelColor(currentCard.level)}>
                  等級 {currentCard.level} - {getLevelLabel(currentCard.level)}
                </Badge>
                <Button variant="ghost" size="sm" className="gap-1">
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Word */}
            <div className="text-center mb-4">
              <h2 className="text-5xl font-bold text-foreground mb-2">
                {currentCard.word}
              </h2>
              <p className="text-xl text-muted-foreground mb-4">{currentCard.ipa}</p>
            </div>

            {/* Show Answer Button */}
            {!showAnswer && (
              <div className="text-center">
                <Button
                  onClick={() => setShowAnswer(true)}
                  className="gap-2"
                  size="lg"
                >
                  <Check className="h-4 w-4" />
                  顯示答案
                </Button>
              </div>
            )}
          </div>

          {/* Answer Section */}
          {showAnswer && (
            <div className="p-6 space-y-6 animate-fade-in">
              {/* Translation */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">中文翻譯</h3>
                <p className="text-2xl font-bold text-foreground">{currentCard.translation}</p>
              </div>

              {/* Example */}
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">例句</h3>
                <p className="text-lg text-foreground mb-2">{currentCard.example}</p>
                <p className="text-base text-muted-foreground">{currentCard.exampleTranslation}</p>
              </div>

              {/* Next Review Time */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">預計下次複習</p>
                  <p className="font-semibold text-foreground">{currentCard.nextReview}</p>
                </div>
              </div>

              {/* Response Buttons */}
              <div className="grid grid-cols-3 gap-4 pt-4">
                <Button
                  onClick={() => handleResponse("forgot")}
                  variant="outline"
                  className="flex-col h-auto py-4 gap-2 border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                >
                  <X className="h-6 w-6 text-destructive" />
                  <div className="text-center">
                    <div className="font-bold text-destructive">忘記了</div>
                    <div className="text-xs text-muted-foreground">10 分鐘後</div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleResponse("vague")}
                  variant="outline"
                  className="flex-col h-auto py-4 gap-2 border-warning/30 hover:bg-warning/10 hover:border-warning"
                >
                  <Minus className="h-6 w-6 text-warning" />
                  <div className="text-center">
                    <div className="font-bold text-warning">有點模糊</div>
                    <div className="text-xs text-muted-foreground">1 天後</div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleResponse("remembered")}
                  variant="outline"
                  className="flex-col h-auto py-4 gap-2 border-success/30 hover:bg-success/10 hover:border-success"
                >
                  <Check className="h-6 w-6 text-success" />
                  <div className="text-center">
                    <div className="font-bold text-success">記得很清楚</div>
                    <div className="text-xs text-muted-foreground">3 天後</div>
                  </div>
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Info Card */}
        <Card className="p-4 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-secondary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground mb-1">什麼是 SRS？</h3>
              <p className="text-sm text-muted-foreground">
                間隔重複系統會根據你的記憶曲線，自動安排最佳的複習時間。答對越多次，複習間隔越長，幫助你高效記憶。
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SRSReview;
