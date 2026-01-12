import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { BookOpen, Brain, Layers, Zap, Lock, Clock, Target, Award } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();

  // Phase 0: Available features
  const availableFeatures = [
    {
      icon: Layers,
      title: "Level 2-6 字庫",
      description: "5543 個學測高頻單字，分級學習",
    },
    {
      icon: Brain,
      title: "SRS 智慧複習",
      description: "間隔重複演算法，科學記憶",
    },
    {
      icon: Zap,
      title: "多元練習模式",
      description: "翻轉卡片、快速測驗、進階篩選",
    },
  ];

  // Phase 2: Coming soon features
  const comingSoonFeatures = [
    {
      icon: Clock,
      title: "真實模擬考",
      description: "完整還原學測考試時間與流程",
    },
    {
      icon: Target,
      title: "精準分析",
      description: "詳細的答題數據與弱點分析",
    },
    {
      icon: Award,
      title: "AI 作文批改",
      description: "智能評分與改進建議",
    },
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/5 via-secondary/5 to-background">
        <div className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              學測英文
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {" "}單字練習
              </span>
            </h1>
            <p className="mb-8 text-base sm:text-lg md:text-xl text-muted-foreground">
              5543 個學測高頻單字，Level 2-6 分級字庫，免費開放練習
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="text-base sm:text-lg h-10 sm:h-12 px-6 sm:px-8"
                onClick={() => navigate("/practice/vocabulary")}
              >
                <BookOpen className="mr-2 h-5 w-5" />
                開始練習單字
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Available Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-2xl sm:text-3xl font-bold">免費功能</h2>
            <p className="text-muted-foreground">立即可用的單字學習工具</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {availableFeatures.map((feature, index) => (
              <Card
                key={index}
                className="border-2 transition-all hover:border-primary hover:shadow-lg cursor-pointer"
                onClick={() => navigate("/practice/vocabulary")}
              >
                <CardHeader>
                  <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-2xl sm:text-3xl font-bold text-muted-foreground">即將推出</h2>
            <p className="text-muted-foreground">更多學習功能開發中</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {comingSoonFeatures.map((feature, index) => (
              <Card key={index} className="border-2 border-dashed opacity-60">
                <CardHeader>
                  <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="flex items-center gap-2 text-muted-foreground">
                    {feature.title}
                    <Lock className="h-4 w-4" />
                  </CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-primary to-secondary py-20 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold">準備好開始了嗎？</h2>
          <p className="mb-8 text-lg opacity-90">
            立即開始練習學測高頻單字
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="text-lg h-12 px-8"
            onClick={() => navigate("/practice/vocabulary")}
          >
            <BookOpen className="mr-2 h-5 w-5" />
            前往單字中心
          </Button>
        </div>
      </section>
    </Layout>
  );
};

export default Home;
