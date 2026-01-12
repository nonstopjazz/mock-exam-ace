import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Heart,
  Brain,
  Zap,
  Layers,
  ChevronRight,
  Sparkles,
  Lock,
} from "lucide-react";

const Phase0Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-2">
              <Sparkles className="h-4 w-4 mr-2 inline" />
              學測英文單字練習
            </Badge>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground leading-tight">
              開始你的
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {" "}單字學習之旅
              </span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
              5543 個學測高頻單字，Level 2-6 分級字庫，SRS 智慧複習
            </p>
          </div>
        </div>
      </section>

      {/* Main Features */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid gap-6 md:grid-cols-2">
            {/* 單字複習中心 */}
            <Card
              className="group cursor-pointer border-2 hover:border-primary hover:shadow-xl transition-all duration-300"
              onClick={() => navigate("/practice/vocabulary")}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <BookOpen className="h-8 w-8 text-primary" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-2xl">單字複習中心</CardTitle>
                <CardDescription className="text-base">
                  完整的單字學習工具，隨時練習
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>Level 2-6 分級字庫（5543 字）</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Brain className="h-4 w-4 text-primary" />
                    <span>SRS 間隔重複複習</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Zap className="h-4 w-4 text-primary" />
                    <span>閃卡、快速測驗模式</span>
                  </div>
                </div>
                <Button className="w-full mt-6 group-hover:bg-primary/90">
                  開始複習
                </Button>
              </CardContent>
            </Card>

            {/* 詞彙收藏 */}
            <Card
              className="group cursor-pointer border-2 hover:border-accent hover:shadow-xl transition-all duration-300"
              onClick={() => navigate("/practice/vocabulary/collections")}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-3 rounded-xl bg-accent/10 group-hover:bg-accent/20 transition-colors">
                    <Heart className="h-8 w-8 text-accent" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all" />
                </div>
                <CardTitle className="text-2xl">詞彙收藏</CardTitle>
                <CardDescription className="text-base">
                  瀏覽與領取主題單字包
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-accent" />
                    <span>精選主題單字包預覽</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Heart className="h-4 w-4 text-accent" />
                    <span>透過邀請碼領取專屬字庫</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4 text-accent" />
                    <span>管理你的收藏單字包</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-6 border-accent text-accent hover:bg-accent hover:text-accent-foreground">
                  瀏覽收藏
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-muted-foreground mb-2">
                更多功能即將推出
              </h2>
              <p className="text-sm text-muted-foreground">
                任務地圖、成就系統、寶石商店...敬請期待
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: "🗺️", label: "任務地圖" },
                { icon: "🏆", label: "成就系統" },
                { icon: "💎", label: "寶石商店" },
                { icon: "👤", label: "個人檔案" },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg bg-background/50 border border-dashed border-muted-foreground/30"
                >
                  <span className="text-2xl opacity-50">{item.icon}</span>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    {item.label}
                    <Lock className="h-3 w-3" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Phase0Index;
