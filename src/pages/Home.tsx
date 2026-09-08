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
import { usePhase, useHomeFeatureFlags } from "@/contexts/PhaseContext";
import { HOME_FEATURES, isHomeFeatureVisible } from "@/config/homeFeatures";
import { DevPhaseSwitcher } from "@/components/dev/DevPhaseSwitcher";
import { APP_PRODUCT, PRODUCT_CONFIG } from "@/config/product";

// 產品專屬文案
const PRODUCT_COPY = {
  GSAT: {
    examName: '學測',
    wordCount: '7000',
    vocabDescription: '7000 個學測高頻單字，SRS 智慧複習、閃卡、測驗',
    examDescription: '完整還原學測考試時間與流程',
    heroSubtitle: '7000 個學測高頻單字，Level 1-5 分級字庫，免費開放練習',
    examSubtitle: '真實模擬、精準分析、有效提升 — 你的學測英文得分夥伴',
    ctaText: '立即開始練習學測高頻單字',
  },
  TOEIC: {
    examName: '多益',
    wordCount: '5543',
    vocabDescription: '5543 個多益高頻單字，SRS 智慧複習、閃卡、測驗',
    examDescription: '完整還原多益考試時間與流程',
    heroSubtitle: '5543 個多益高頻單字，Level 2-6 分級字庫，免費開放練習',
    examSubtitle: '真實模擬、精準分析、有效提升 — 你的多益英文得分夥伴',
    ctaText: '立即開始練習多益高頻單字',
  },
  KIDS: {
    examName: '兒童',
    wordCount: '2000',
    vocabDescription: '2000 個基礎單字，遊戲化學習、閃卡、測驗',
    examDescription: '有趣的英語閱讀練習',
    heroSubtitle: '2000 個基礎單字，Level 1-3 分級字庫，免費開放練習',
    examSubtitle: '快樂學習、輕鬆進步 — 孩子的英語學習好夥伴',
    ctaText: '立即開始練習基礎單字',
  },
};

const copy = PRODUCT_COPY[APP_PRODUCT];

/**
 * 卡片的圖示與描述。
 *
 * 「有哪些卡、順序、屬於哪個 Phase」在 src/config/homeFeatures.ts —— 那份目錄
 * 與 /admin/settings 的開關共用。這裡只補上呈現需要的東西：描述會依站別換字，
 * 所以留在這一頁。
 */
const FEATURE_PRESENTATION: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  vocabulary: { icon: Layers, description: copy.vocabDescription },
  collections: { icon: Heart, description: "瀏覽公開單字包，透過邀請碼領取主題字庫" },
  exams: { icon: Clock, description: copy.examDescription },
  dashboard: { icon: BarChart3, description: "詳細的答題數據與弱點分析" },
  essay: { icon: PenTool, description: "智能評分與改進建議" },
};

interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  path?: string;
  phase: 0 | 1 | 2;
}

const Home = () => {
  const navigate = useNavigate();
  const currentPhase = usePhase();

  const homeFeatureFlags = useHomeFeatureFlags();

  /*
   * 兩道關卡：Phase 決定「功能開了沒」，管理員的開關決定「首頁要不要露出」。
   * 開關只能關掉，不能越過 Phase 打開 —— 否則學生會點進「即將推出」的頁面。
   */
  const availableFeatures: Feature[] = HOME_FEATURES.filter((f) =>
    isHomeFeatureVisible(f.key, currentPhase, f.phase, homeFeatureFlags),
  ).map((f) => ({
    icon: FEATURE_PRESENTATION[f.key].icon,
    title: f.title,
    description: FEATURE_PRESENTATION[f.key].description,
    path: f.path,
    phase: f.phase,
  }));

  // Dynamic hero content based on phase
  const heroContent = {
    0: {
      highlight: "單字練習",
      subtitle: copy.heroSubtitle,
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
      subtitle: copy.examSubtitle,
      cta: "選擇試題",
      ctaPath: "/exams",
    },
  }[currentPhase];

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
            <h1 className="mb-6 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              {copy.examName}英文
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
              {currentPhase >= 2 && (
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
              {currentPhase === 0 ? "免費功能" : currentPhase === 1 ? "會員功能" : "完整功能"}
            </h2>
            <p className="text-muted-foreground">
              {currentPhase === 0
                ? "立即可用的單字學習工具"
                : currentPhase === 1
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
            {currentPhase === 2
              ? "立即開始你的第一次模擬考試"
              : copy.ctaText}
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
