import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/shared/ChartContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Award, Clock, Target } from "lucide-react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

// TODO: Fetch from API
const MOCK_STATS = {
  totalExams: 12,
  averageScore: 82,
  bestScore: 95,
  totalTime: 1180, // minutes
  recentExams: [
    { id: 1, date: '2025-01-15', score: 85, time: 98 },
    { id: 2, date: '2025-01-10', score: 78, time: 102 },
    { id: 3, date: '2025-01-05', score: 82, time: 95 },
  ],
};

const Dashboard = () => {
  const progressData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        label: '平均分數',
        data: [75, 78, 82, 85],
        borderColor: 'hsl(var(--primary))',
        backgroundColor: 'hsl(var(--primary) / 0.1)',
        tension: 0.4,
      },
    ],
  };

  const categoryComparisonData = {
    labels: ['字彙', '文法', '閱讀', '綜合測驗'],
    datasets: [
      {
        label: '你的成績',
        data: [85, 78, 88, 80],
        backgroundColor: 'hsl(var(--primary))',
      },
      {
        label: '平均成績',
        data: [75, 72, 80, 75],
        backgroundColor: 'hsl(var(--muted))',
      },
    ],
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">學習儀表板</h1>
          <p className="text-muted-foreground">追蹤你的學習進度與成績表現</p>
        </div>

        {/* Stats Overview */}
        <div className="mb-8 grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">總模考次數</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{MOCK_STATS.totalExams}</div>
              <p className="text-xs text-muted-foreground">累積練習</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">平均分數</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{MOCK_STATS.averageScore}</div>
              <p className="text-xs text-success">+5% 較上週</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">最高分數</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{MOCK_STATS.bestScore}</div>
              <p className="text-xs text-muted-foreground">個人記錄</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">總練習時間</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.floor(MOCK_STATS.totalTime / 60)}h</div>
              <p className="text-xs text-muted-foreground">{MOCK_STATS.totalTime % 60}m</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <Tabs defaultValue="progress" className="mb-8">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="progress">進度追蹤</TabsTrigger>
            <TabsTrigger value="comparison">能力分析</TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="mt-6">
            <ChartContainer
              title="成績趨勢"
              description="最近四週的平均分數變化"
            >
              <Line
                data={progressData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100,
                    },
                  },
                }}
              />
            </ChartContainer>
          </TabsContent>

          <TabsContent value="comparison" className="mt-6">
            <ChartContainer
              title="能力對比"
              description="各題型表現 vs 平均水準"
            >
              <Bar
                data={categoryComparisonData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'bottom',
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100,
                    },
                  },
                }}
              />
            </ChartContainer>
          </TabsContent>
        </Tabs>

        {/* Recent Exams */}
        <Card>
          <CardHeader>
            <CardTitle>近期考試記錄</CardTitle>
            <CardDescription>最近三次模擬考試的成績</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {MOCK_STATS.recentExams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">{exam.date}</div>
                    <Badge variant={exam.score >= 80 ? 'default' : 'secondary'}>
                      {exam.score} 分
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{exam.time} 分鐘</span>
                    <Button variant="outline" size="sm">
                      查看詳情
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
