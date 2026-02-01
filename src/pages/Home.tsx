import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Brain,
  Layers,
  Zap,
  Clock,
  Target,
  Award,
  Heart,
  BarChart3,
  PenTool,
} from "lucide-react";
import { DevPhaseSwitcher, useSimulatedPhase } from "@/components/dev/DevPhaseSwitcher";

// Feature definition with phase requirements
interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  path?: string;
  phase: 0 | 1 | 2;
}

const Home = () => {
  const navigate = useNavigate();
  const [simulatedPhase] = useSimulatedPhase();

  // All features with their required phase
  const allFeatures: Feature[] = [
    // Phase 0: Vocabulary (public MVP)
    {
      icon: Layers,
      title: "單字複習中心",
      description: "5543 個多益高頻單字，SRS 智慧複習、閃卡、測驗",
      path: "/practice/vocabulary",
      phase: 0,
    },
    {
      icon: Heart,
      title: "詞彙收藏",
      description: "瀏覽公開單字包，透過邀請碼領取主題字庫",
      path: "/practice/vocabulary/collections",
      phase: 0,
    },
    // Phase 2: Premium features (hidden for now)
    {
      icon: Clock,
      title: "真實模擬考",
      description: "完整還原多益考試時間與流程",
      path: "/exams",
      phase: 2,
    },
    {
      icon: BarChart3,
      title: "學習儀表板",
      description: "詳細的答題數據與弱點分析",
      path: "/dashboard",
      phase: 2,
    },
    {
      icon: PenTool,
      title: "AI 作文批改",
      description: "智能評分與改進建議",
      path: "/essay",
      phase: 2,
    },
  ];

  // Filter available features based on simulated phase
  const availableFeatures = allFeatures.filter((f) => f.phase <= simulatedPhase);

  // Dynamic hero content based on phase
  const heroContent = {
    0: {
      highlight: "單字練習",
      subtitle: "5543 個多益高頻單字，Level 2-6 分級字庫，免費開放練習",
      cta: "開始練習單字",
      ctaPath: "/practice/vocabulary",
    },
    1: {
      highlight: "單字學習",
      subtitle: "免費會員專屬功能，收藏你的重點單字",
      cta: "開始學習",
      ctaPath: "/practice/vocabulary",
    },
    2: {
      highlight: "模擬考系統",
      subtitle: "真實模擬、精準分析、有效提升 — 你的多益英文得分夥伴",
      cta: "選擇試題",
      ctaPath: "/exams",
    },
  }[simulatedPhase];

  const handleFeatureClick = (feature: Feature) => {
    if (feature.path) {
      navigate(feature.path);
    }
  };

  return (
    <Layout>
      {/* Dev-only Phase Switcher */}
      <DevPhaseSwitcher />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/5 via-secondary/5 to-background">
        <div className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-3xl text-center">
            {/* Dev mode indicator */}
            {import.meta.env.DEV && (
              <Badge variant="outline" className="mb-4 border-orange-500 text-orange-500">
                DEV: 模擬 Phase {simulatedPhase}
              </Badge>
            )}

            <h1 className="mb-6 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              多益英文
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {" "}{heroContent.highlight}
              </span>
            </h1>
            <p className="mb-8 text-base sm:text-lg md:text-xl text-muted-foreground">
              {heroContent.subtitle}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="text-base sm:text-lg h-10 sm:h-12 px-6 sm:px-8"
                onClick={() => navigate(heroContent.ctaPath)}
              >
                <BookOpen className="mr-2 h-5 w-5" />
                {heroContent.cta}
              </Button>

              {/* Show dashboard button only in Phase 2 */}
              {simulatedPhase >= 2 && (
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base sm:text-lg h-10 sm:h-12 px-6 sm:px-8"
                  onClick={() => navigate("/dashboard")}
                >
                  <BarChart3 className="mr-2 h-5 w-5" />
                  檢視儀表板
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Available Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-2xl sm:text-3xl font-bold">
              {simulatedPhase === 0 ? "免費功能" : simulatedPhase === 1 ? "會員功能" : "完整功能"}
            </h2>
            <p className="text-muted-foreground">
              {simulatedPhase === 0
                ? "立即可用的單字學習工具"
                : simulatedPhase === 1
                  ? "免費會員專屬學習功能"
                  : "Premium 會員完整解鎖"}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {availableFeatures.map((feature, index) => (
              <Card
                key={index}
                className="border-2 transition-all hover:border-primary hover:shadow-lg cursor-pointer"
                onClick={() => handleFeatureClick(feature)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    {feature.phase > 0 && (
                      <Badge variant={feature.phase === 1 ? "secondary" : "default"}>
                        {feature.phase === 1 ? "Free" : "Premium"}
                      </Badge>
                    )}
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
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
            {simulatedPhase === 2
              ? "立即開始你的第一次模擬考試"
              : "立即開始練習多益高頻單字"}
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="text-lg h-12 px-8"
            onClick={() => navigate(heroContent.ctaPath)}
          >
            <BookOpen className="mr-2 h-5 w-5" />
            {heroContent.cta}
          </Button>
        </div>
      </section>
    </Layout>
  );
};

export default Home;
