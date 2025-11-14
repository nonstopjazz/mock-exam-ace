import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { BookOpen, BarChart3, PenTool, Clock, Award, Target } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();

  const features = [
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
                {" "}模擬考系統
              </span>
            </h1>
            <p className="mb-8 text-base sm:text-lg md:text-xl text-muted-foreground">
              真實模擬、精準分析、有效提升 — 你的學測英文得分夥伴
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="text-base sm:text-lg h-10 sm:h-12 px-6 sm:px-8"
                onClick={() => navigate("/exams")}
              >
                <BookOpen className="mr-2 h-5 w-5" />
                選擇試題
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-base sm:text-lg h-10 sm:h-12 px-6 sm:px-8"
                onClick={() => navigate("/dashboard")}
              >
                <BarChart3 className="mr-2 h-5 w-5" />
                檢視儀表板
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-2xl sm:text-3xl font-bold">核心功能</h2>
            <p className="text-muted-foreground">專為學測英文設計的完整解決方案</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 transition-all hover:border-primary hover:shadow-lg">
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

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-primary to-secondary py-20 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold">準備好開始了嗎？</h2>
          <p className="mb-8 text-lg opacity-90">
            立即開始你的第一次模擬考試
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="text-lg h-12 px-8"
            onClick={() => navigate("/exams")}
          >
            <PenTool className="mr-2 h-5 w-5" />
            立即開始
          </Button>
        </div>
      </section>
    </Layout>
  );
};

export default Home;
