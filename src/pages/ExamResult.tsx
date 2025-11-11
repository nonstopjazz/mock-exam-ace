import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/shared/ChartContainer";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams } from "react-router-dom";
import { Trophy, TrendingUp, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// TODO: Fetch from API based on attemptId
const MOCK_RESULT = {
  score: 85,
  totalQuestions: 50,
  correctAnswers: 42,
  timeSpent: 98, // minutes
  percentage: 84,
  categoryScores: {
    vocabulary: 90,
    grammar: 82,
    reading: 85,
    cloze: 80,
  },
};

const ExamResult = () => {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const scoreData = {
    labels: ['答對', '答錯'],
    datasets: [
      {
        data: [MOCK_RESULT.correctAnswers, MOCK_RESULT.totalQuestions - MOCK_RESULT.correctAnswers],
        backgroundColor: ['hsl(var(--success))', 'hsl(var(--destructive))'],
        borderWidth: 0,
      },
    ],
  };

  const categoryData = {
    labels: ['字彙', '文法', '閱讀', '綜合測驗'],
    datasets: [
      {
        label: '分數',
        data: [
          MOCK_RESULT.categoryScores.vocabulary,
          MOCK_RESULT.categoryScores.grammar,
          MOCK_RESULT.categoryScores.reading,
          MOCK_RESULT.categoryScores.cloze,
        ],
        backgroundColor: 'hsl(var(--primary))',
      },
    ],
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-success';
    if (score >= 70) return 'text-primary';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Layout>
      <div className="bg-gradient-to-br from-primary/5 via-secondary/5 to-background py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <Trophy className="h-8 w-8" />
            </div>
            <h1 className="mb-2 text-4xl font-bold">考試完成！</h1>
            <p className="text-muted-foreground">模擬考試 ID: {attemptId}</p>
          </div>

          {/* Score Overview */}
          <div className="mb-8 grid gap-6 md:grid-cols-4">
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">總分</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold ${getScoreColor(MOCK_RESULT.score)}`}>
                  {MOCK_RESULT.score}
                </div>
                <p className="text-sm text-muted-foreground">/ 100 分</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  答對題數
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {MOCK_RESULT.correctAnswers}
                </div>
                <p className="text-sm text-muted-foreground">/ {MOCK_RESULT.totalQuestions} 題</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  正確率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {MOCK_RESULT.percentage}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-accent" />
                  作答時間
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {MOCK_RESULT.timeSpent}
                </div>
                <p className="text-sm text-muted-foreground">分鐘</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <ChartContainer title="答題分布" description="答對與答錯比例">
              <div className="mx-auto max-w-xs">
                <Doughnut
                  data={scoreData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        position: 'bottom',
                      },
                    },
                  }}
                />
              </div>
            </ChartContainer>

            <ChartContainer title="分類成績" description="各題型得分分析">
              <Bar
                data={categoryData}
                options={{
                  responsive: true,
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100,
                    },
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                }}
              />
            </ChartContainer>
          </div>

          {/* Recommendations */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>學習建議</CardTitle>
              <CardDescription>根據你的答題表現，我們提供以下建議</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">文法</Badge>
                  <p className="text-sm">
                    文法部分得分 {MOCK_RESULT.categoryScores.grammar} 分，建議加強時態與語態的練習。
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">綜合測驗</Badge>
                  <p className="text-sm">
                    綜合測驗得分 {MOCK_RESULT.categoryScores.cloze} 分，建議多閱讀長篇文章提升理解力。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/exam")}>
              再次練習
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/dashboard")}>
              查看儀表板
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ExamResult;
