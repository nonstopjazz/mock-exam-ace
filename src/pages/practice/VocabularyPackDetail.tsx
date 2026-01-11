import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  ChevronLeft,
  BookmarkPlus,
  CheckCircle,
  Volume2,
  Tag,
  Users,
  Calendar,
  TrendingUp,
  ZoomIn,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Word {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  example: string;
  exampleTranslation: string;
  partOfSpeech: string;
}

interface ThemeImage {
  id: string;
  url: string;
  caption: string;
}

interface VocabularyPack {
  id: string;
  title: string;
  theme: string;
  description: string;
  source: string;
  totalWords: number;
  difficulty: string;
  datePublished: string;
  author: string;
  words: Word[];
  themeImages: ThemeImage[];
}

const VocabularyPackDetail = () => {
  const { packId } = useParams();
  const navigate = useNavigate();
  const [isCollected, setIsCollected] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ThemeImage | null>(null);

  // 模拟数据 - 实际应该根据 packId 从 API 获取
  const packs: Record<string, VocabularyPack> = {
    "1": {
      id: "1",
      title: "全球暖化",
      theme: "環境議題",
      description: "探討全球暖化相關的核心詞彙，包含氣候變遷、溫室效應、碳排放等重要概念",
      source: "環境教育社群",
      totalWords: 15,
      difficulty: "中高級",
      datePublished: "2024-03-15",
      author: "環境學習小組",
      themeImages: [
        { id: "1", url: "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=800&h=400&fit=crop", caption: "全球暖化導致冰川融化" },
        { id: "2", url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=400&fit=crop", caption: "氣候變遷影響自然生態" },
        { id: "3", url: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=800&h=400&fit=crop", caption: "可再生能源是未來趨勢" },
      ],
      words: [
        {
          id: "1",
          word: "greenhouse effect",
          ipa: "/ˈɡriːnhaʊs ɪˈfekt/",
          translation: "溫室效應",
          example: "The greenhouse effect is causing global temperatures to rise.",
          exampleTranslation: "溫室效應正導致全球氣溫上升。",
          partOfSpeech: "n.",
        },
        {
          id: "2",
          word: "carbon footprint",
          ipa: "/ˈkɑːrbən ˈfʊtprɪnt/",
          translation: "碳足跡",
          example: "We should all try to reduce our carbon footprint.",
          exampleTranslation: "我們都應該試著減少我們的碳足跡。",
          partOfSpeech: "n.",
        },
        {
          id: "3",
          word: "sustainable",
          ipa: "/səˈsteɪnəbl/",
          translation: "可持續的；永續的",
          example: "Sustainable energy sources are crucial for our future.",
          exampleTranslation: "永續能源對我們的未來至關重要。",
          partOfSpeech: "adj.",
        },
        {
          id: "4",
          word: "fossil fuel",
          ipa: "/ˈfɑːsl ˈfjuːəl/",
          translation: "化石燃料",
          example: "Burning fossil fuels releases harmful emissions.",
          exampleTranslation: "燃燒化石燃料會釋放有害排放物。",
          partOfSpeech: "n.",
        },
        {
          id: "5",
          word: "renewable",
          ipa: "/rɪˈnjuːəbl/",
          translation: "可再生的",
          example: "Solar and wind are renewable energy sources.",
          exampleTranslation: "太陽能和風能是可再生能源。",
          partOfSpeech: "adj.",
        },
        {
          id: "6",
          word: "climate change",
          ipa: "/ˈklaɪmət tʃeɪndʒ/",
          translation: "氣候變遷",
          example: "Climate change affects ecosystems worldwide.",
          exampleTranslation: "氣候變遷影響全球生態系統。",
          partOfSpeech: "n.",
        },
        {
          id: "7",
          word: "deforestation",
          ipa: "/diːˌfɔːrɪˈsteɪʃn/",
          translation: "森林砍伐",
          example: "Deforestation contributes to global warming.",
          exampleTranslation: "森林砍伐加劇了全球暖化。",
          partOfSpeech: "n.",
        },
        {
          id: "8",
          word: "emissions",
          ipa: "/ɪˈmɪʃnz/",
          translation: "排放物",
          example: "Countries need to reduce carbon emissions.",
          exampleTranslation: "各國需要減少碳排放。",
          partOfSpeech: "n.",
        },
      ],
    },
    "2": {
      id: "2",
      title: "少子化",
      theme: "社會議題",
      description: "討論少子化現象的相關詞彙，涵蓋人口統計、生育率、社會福利等面向",
      source: "社會學習社群",
      totalWords: 12,
      difficulty: "中級",
      datePublished: "2024-03-14",
      author: "社會議題研究組",
      themeImages: [
        { id: "1", url: "https://images.unsplash.com/photo-1491013516836-7db643ee125a?w=800&h=400&fit=crop", caption: "少子化影響家庭結構" },
        { id: "2", url: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=800&h=400&fit=crop", caption: "人口老化帶來的挑戰" },
        { id: "3", url: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&h=400&fit=crop", caption: "教育政策需因應人口變化" },
        { id: "4", url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&h=400&fit=crop", caption: "女性勞動參與率提升" },
      ],
      words: [
        {
          id: "1",
          word: "birth rate",
          ipa: "/bɜːrθ reɪt/",
          translation: "出生率",
          example: "The birth rate has been declining for decades.",
          exampleTranslation: "出生率已經下降了數十年。",
          partOfSpeech: "n.",
        },
        {
          id: "2",
          word: "fertility",
          ipa: "/fərˈtɪləti/",
          translation: "生育力；生育率",
          example: "Fertility rates vary greatly across countries.",
          exampleTranslation: "各國的生育率差異很大。",
          partOfSpeech: "n.",
        },
        {
          id: "3",
          word: "demographic",
          ipa: "/ˌdeməˈɡræfɪk/",
          translation: "人口統計的",
          example: "Demographic changes affect economic policies.",
          exampleTranslation: "人口統計變化影響經濟政策。",
          partOfSpeech: "adj.",
        },
        {
          id: "4",
          word: "aging population",
          ipa: "/ˈeɪdʒɪŋ ˌpɑːpjəˈleɪʃn/",
          translation: "人口老化",
          example: "An aging population poses challenges to healthcare.",
          exampleTranslation: "人口老化對醫療保健構成挑戰。",
          partOfSpeech: "n.",
        },
      ],
    },
    "3": {
      id: "3",
      title: "垃圾問題",
      theme: "環境議題",
      description: "聚焦於垃圾處理與環境保護的核心詞彙，包含回收、減廢、循環經濟等概念",
      source: "環保行動聯盟",
      totalWords: 10,
      difficulty: "中級",
      datePublished: "2024-03-13",
      author: "綠色生活推廣組",
      themeImages: [
        { id: "1", url: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800&h=400&fit=crop", caption: "垃圾分類是環保第一步" },
        { id: "2", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop", caption: "減少塑膠使用保護海洋" },
        { id: "3", url: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&h=400&fit=crop", caption: "循環經濟創造永續未來" },
      ],
      words: [
        {
          id: "1",
          word: "recycling",
          ipa: "/riːˈsaɪklɪŋ/",
          translation: "回收",
          example: "Recycling helps reduce waste in landfills.",
          exampleTranslation: "回收有助於減少垃圾掩埋場的廢物。",
          partOfSpeech: "n.",
        },
        {
          id: "2",
          word: "landfill",
          ipa: "/ˈlændfɪl/",
          translation: "垃圾掩埋場",
          example: "Most of our waste ends up in landfills.",
          exampleTranslation: "我們的大部分垃圾最終進入掩埋場。",
          partOfSpeech: "n.",
        },
        {
          id: "3",
          word: "biodegradable",
          ipa: "/ˌbaɪoʊdɪˈɡreɪdəbl/",
          translation: "可生物分解的",
          example: "We should use biodegradable packaging materials.",
          exampleTranslation: "我們應該使用可生物分解的包裝材料。",
          partOfSpeech: "adj.",
        },
      ],
    },
  };

  const pack = packs[packId || "1"];

  if (!pack) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">找不到此單字集</h2>
          <Button onClick={() => navigate("/practice/vocabulary")}>返回單字複習中心</Button>
        </Card>
      </div>
    );
  }

  const handleCollect = () => {
    setIsCollected(!isCollected);
    if (!isCollected) {
      toast.success(`已收藏「${pack.title}」單字集`);
    } else {
      toast.success(`已取消收藏「${pack.title}」單字集`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/practice/vocabulary")}
          className="mb-4"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回單字複習中心
        </Button>

        {/* Hero Image Carousel */}
        {pack.themeImages && pack.themeImages.length > 0 && (
          <div className="mb-6">
            <Carousel className="w-full" opts={{ loop: true }}>
              <CarouselContent>
                {pack.themeImages.map((image) => (
                  <CarouselItem key={image.id}>
                    <div 
                      className="relative overflow-hidden rounded-2xl cursor-pointer group"
                      onClick={() => setSelectedImage(image)}
                    >
                      <img
                        src={image.url}
                        alt={image.caption}
                        className="w-full h-48 sm:h-64 md:h-80 object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 flex items-end justify-between">
                        <p className="text-white text-sm sm:text-base md:text-lg font-medium drop-shadow-lg">
                          {image.caption}
                        </p>
                        <div className="bg-white/20 backdrop-blur-sm rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ZoomIn className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-2 sm:left-4" />
              <CarouselNext className="right-2 sm:right-4" />
            </Carousel>
            {/* Carousel Indicators */}
            <div className="flex justify-center gap-2 mt-3">
              {pack.themeImages.map((_, index) => (
                <div
                  key={index}
                  className="w-2 h-2 rounded-full bg-primary/30 transition-colors"
                />
              ))}
            </div>
          </div>
        )}

        {/* Image Lightbox Modal */}
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 overflow-hidden bg-black/95 border-none">
            <DialogTitle className="sr-only">
              {selectedImage?.caption || "圖片檢視"}
            </DialogTitle>
            {selectedImage && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 z-10 text-white hover:bg-white/20"
                  onClick={() => setSelectedImage(null)}
                >
                  <X className="h-6 w-6" />
                </Button>
                <div className="overflow-auto max-h-[85vh]">
                  <img
                    src={selectedImage.url}
                    alt={selectedImage.caption}
                    className="w-full h-auto"
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-white text-center text-lg font-medium">
                    {selectedImage.caption}
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Pack Header */}
        <Card className="p-8 mb-6 bg-gradient-to-br from-primary/10 to-accent/10">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline">
                  <Tag className="h-3 w-3 mr-1" />
                  {pack.theme}
                </Badge>
                <Badge variant="secondary">{pack.difficulty}</Badge>
              </div>

              <h1 className="text-4xl font-bold text-foreground mb-3">{pack.title}</h1>
              <p className="text-lg text-muted-foreground mb-4">{pack.description}</p>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{pack.author}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{pack.datePublished}</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  <span>{pack.source}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                variant={isCollected ? "secondary" : "default"}
                onClick={handleCollect}
                className="w-full md:w-auto"
              >
                {isCollected ? (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    已收藏
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="h-5 w-5 mr-2" />
                    加入收藏
                  </>
                )}
              </Button>

              <div className="text-center p-4 rounded-lg bg-background/50">
                <div className="text-3xl font-bold text-primary">{pack.totalWords}</div>
                <div className="text-sm text-muted-foreground">個單字</div>
              </div>
            </div>
          </div>

          {/* Progress */}
          {isCollected && (
            <div className="mt-6 p-4 rounded-lg bg-background/70">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">學習進度</span>
                <span className="text-sm text-muted-foreground">3 / {pack.totalWords}</span>
              </div>
              <Progress value={(3 / pack.totalWords) * 100} className="h-2" />
            </div>
          )}
        </Card>

        {/* Word Cards */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            單字列表 ({pack.words.length} 個)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pack.words.map((word, index) => (
            <Card
              key={word.id}
              className="p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <Badge variant="outline" className="text-xs">
                  #{index + 1}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {word.partOfSpeech}
                </Badge>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-2xl font-bold text-foreground">{word.word}</h3>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Volume2 className="h-4 w-4 text-primary" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{word.ipa}</p>
                <p className="text-lg text-foreground font-medium">{word.translation}</p>
              </div>

              <div className="p-4 rounded-lg bg-muted/50 border-l-4 border-primary">
                <p className="text-sm text-foreground italic mb-1">{word.example}</p>
                <p className="text-xs text-muted-foreground">{word.exampleTranslation}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Bottom Actions */}
        {isCollected && (
          <Card className="mt-8 p-6 bg-gradient-to-br from-success/10 to-primary/10 border-success/20">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-success/20">
                  <CheckCircle className="h-6 w-6 text-success" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">已加入你的收藏</h4>
                  <p className="text-sm text-muted-foreground">
                    這 {pack.totalWords} 個單字已加入複習池
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/practice/vocabulary/collections")}>
                  查看收藏列表
                </Button>
                <Button onClick={() => navigate("/practice/vocabulary/srs")}>開始複習</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VocabularyPackDetail;
