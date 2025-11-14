import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { TrendingUp, Clock, Target, BookOpen, BarChart3, Brain, Info } from "lucide-react";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import {
  MOCK_GRAMMAR_TOPICS,
  MOCK_QUESTION_TYPE_SCORES,
  MOCK_EXAM_HISTORY,
  MOCK_VOCABULARY_LEVELS,
  MOCK_QUESTION_TYPE_TIMING,
} from '@/data/mock-analytics';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// TODO: 未來從 API 拉取分析數據
// GET /api/analytics/summary?userId={uid}&days={7|30|90}&questionType={type}&topic={topic}

const Dashboard = () => {
  const navigate = useNavigate();
  
  // 篩選狀態
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [timingMode, setTimingMode] = useState<'total' | 'average'>('average');
  const [expandedTiming, setExpandedTiming] = useState<string | null>(null);

  // ===== 1. 文法主題同心圓圖 =====
  const prepareGrammarDoughnutData = () => {
    // 內圈：主題
    const mainTopics = MOCK_GRAMMAR_TOPICS.map((t) => t.mainTopic);
    const mainAccuracies = MOCK_GRAMMAR_TOPICS.map((t) => {
      const avg =
        t.subTopics.reduce((sum, st) => sum + st.accuracy, 0) / t.subTopics.length;
      return Math.round(avg);
    });

    // 外圈：子題
    const subTopics: string[] = [];
    const subAccuracies: number[] = [];
    const subTooltips: string[] = [];

    MOCK_GRAMMAR_TOPICS.forEach((topic) => {
      topic.subTopics.forEach((sub) => {
        subTopics.push(`${topic.mainTopic}: ${sub.name}`);
        subAccuracies.push(sub.accuracy);
        subTooltips.push(
          `${sub.recentPerformance}\n常錯：${sub.commonMistakes.join('、')}\n${sub.suggestion}`
        );
      });
    });

    return {
      labels: [...mainTopics, ...subTopics],
      datasets: [
        {
          label: '主題正確率',
          data: mainAccuracies,
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',   // 藍色
            'rgba(168, 85, 247, 0.8)',   // 紫色
            'rgba(236, 72, 153, 0.8)',   // 粉色
            'rgba(34, 197, 94, 0.8)',    // 綠色
            'rgba(251, 146, 60, 0.8)',   // 橙色
          ],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
        {
          label: '子題正確率',
          data: [...Array(mainTopics.length).fill(0), ...subAccuracies],
          backgroundColor: [
            ...Array(mainTopics.length).fill('transparent'),
            ...subAccuracies.map((acc) => {
              if (acc >= 85) return 'rgba(34, 197, 94, 0.75)';   // 優秀
              if (acc >= 70) return 'rgba(59, 130, 246, 0.75)';  // 良好
              if (acc >= 60) return 'rgba(251, 191, 36, 0.75)';  // 加強
              return 'rgba(239, 68, 68, 0.75)';                   // 待改善
            }),
          ],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
      tooltips: [...Array(mainTopics.length).fill(''), ...subTooltips],
    };
  };

  const grammarData = prepareGrammarDoughnutData();

  // ===== 2. 各題型得分比率 =====
  const questionTypeScoreData = {
    labels: MOCK_QUESTION_TYPE_SCORES.map((q) => q.typeName),
    datasets: [
      {
        label: '得分率 (%)',
        data: MOCK_QUESTION_TYPE_SCORES.map((q) => q.accuracy),
        backgroundColor: MOCK_QUESTION_TYPE_SCORES.map((q) => {
          if (q.accuracy >= 85) return 'hsl(var(--success))';
          if (q.accuracy >= 70) return 'hsl(var(--primary))';
          if (q.accuracy >= 60) return 'hsl(var(--warning))';
          return 'hsl(var(--destructive))';
        }),
      },
    ],
  };

  // ===== 3. 歷次模考總分 =====
  const examHistoryData = {
    labels: MOCK_EXAM_HISTORY.map((e) => e.date),
    datasets: [
      {
        label: '總分',
        data: MOCK_EXAM_HISTORY.map((e) => e.score),
        borderColor: 'hsl(var(--primary))',
        backgroundColor: 'hsl(var(--primary) / 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  // ===== 4. Level 3-6 單字錯誤比率 =====
  const vocabularyLevelData = {
    labels: MOCK_VOCABULARY_LEVELS.map((v) => `Level ${v.level}`),
    datasets: [
      {
        label: '錯誤率 (%)',
        data: MOCK_VOCABULARY_LEVELS.map((v) => v.errorRate),
        backgroundColor: [
          'hsl(var(--success))',
          'hsl(var(--primary))',
          'hsl(var(--warning))',
          'hsl(var(--destructive))',
        ],
      },
    ],
  };

  // ===== 5. 各題型耗時 =====
  const timingData = {
    labels: MOCK_QUESTION_TYPE_TIMING.map((t) => t.typeName),
    datasets: [
      {
        label: timingMode === 'total' ? '總計耗時 (秒)' : '平均耗時 (秒)',
        data: MOCK_QUESTION_TYPE_TIMING.map((t) =>
          timingMode === 'total' ? t.totalTime : t.averageTime
        ),
        backgroundColor: 'hsl(var(--accent))',
      },
    ],
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">學習儀表板</h1>
          <p className="text-muted-foreground">追蹤你的學習進度與分析弱點</p>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">篩選條件</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium mb-2 block">時間範圍</label>
                <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">最近 7 天</SelectItem>
                    <SelectItem value="30">最近 30 天</SelectItem>
                    <SelectItem value="90">最近 90 天</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">題型</label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部題型</SelectItem>
                    <SelectItem value="multiple-choice">單選題</SelectItem>
                    <SelectItem value="cloze">克漏字</SelectItem>
                    <SelectItem value="fill-in-blank">文意選填</SelectItem>
                    <SelectItem value="sentence-ordering">篇章結構</SelectItem>
                    <SelectItem value="reading">閱讀測驗</SelectItem>
                    <SelectItem value="hybrid">混合題</SelectItem>
                    <SelectItem value="translation">翻譯</SelectItem>
                    <SelectItem value="essay">作文</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">文法主題</label>
                <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部主題</SelectItem>
                    {MOCK_GRAMMAR_TOPICS.map((topic) => (
                      <SelectItem key={topic.mainTopic} value={topic.mainTopic}>
                        {topic.mainTopic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-6 mb-8 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                平均分數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-primary">83.5</div>
              <p className="text-sm text-muted-foreground">/ 100 分</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                最高分數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-success">90</div>
              <p className="text-sm text-muted-foreground">近期最佳</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                總練習次數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">8</div>
              <p className="text-sm text-muted-foreground">次模考</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                總學習時間
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">12.5</div>
              <p className="text-sm text-muted-foreground">小時</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <Tabs defaultValue="grammar" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="grammar">文法分析</TabsTrigger>
            <TabsTrigger value="types">題型得分</TabsTrigger>
            <TabsTrigger value="history">成績趨勢</TabsTrigger>
            <TabsTrigger value="vocabulary">單字分析</TabsTrigger>
            <TabsTrigger value="timing">耗時分析</TabsTrigger>
          </TabsList>

          {/* 1. 文法主題同心圓 */}
          <TabsContent value="grammar">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  文法主題熟練度分析
                </CardTitle>
                <CardDescription>
                  內圈：主題平均；外圈：子題詳細（hover 查看建議）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-xl mx-auto">
                  <Doughnut
                    data={grammarData}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: {
                            generateLabels: (chart) => {
                              return [
                                { text: '≥85% 優秀', fillStyle: 'rgba(34, 197, 94, 0.75)' },
                                { text: '70-84% 良好', fillStyle: 'rgba(59, 130, 246, 0.75)' },
                                { text: '60-69% 需加強', fillStyle: 'rgba(251, 191, 36, 0.75)' },
                                { text: '<60% 待改善', fillStyle: 'rgba(239, 68, 68, 0.75)' },
                              ];
                            },
                          },
                        },
                        tooltip: {
                          callbacks: {
                            afterLabel: (context) => {
                              const idx = context.dataIndex;
                              const tip = grammarData.tooltips[idx];
                              return tip ? tip.split('\n') : [];
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>

                {/* 詳細子題列表 */}
                <div className="mt-8 space-y-4">
                  <h3 className="font-semibold text-lg">詳細建議</h3>
                  {MOCK_GRAMMAR_TOPICS.map((topic) => (
                    <div key={topic.mainTopic} className="border rounded-lg p-4 space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        {topic.mainTopic}
                        <Badge variant="outline">
                          {Math.round(
                            topic.subTopics.reduce((sum, st) => sum + st.accuracy, 0) /
                              topic.subTopics.length
                          )}
                          %
                        </Badge>
                      </h4>
                      <div className="grid gap-2">
                        {topic.subTopics.map((sub) => (
                          <HoverCard key={sub.name}>
                            <HoverCardTrigger asChild>
                              <div className="flex items-center justify-between p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors">
                                <span className="text-sm">{sub.name}</span>
                                <Badge
                                  variant={
                                    sub.accuracy >= 85
                                      ? 'default'
                                      : sub.accuracy >= 70
                                      ? 'secondary'
                                      : 'destructive'
                                  }
                                >
                                  {sub.accuracy}%
                                </Badge>
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80">
                              <div className="space-y-2">
                                <h4 className="font-semibold">{sub.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {sub.recentPerformance}
                                </p>
                                <div>
                                  <p className="text-sm font-medium">常錯樣態：</p>
                                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                                    {sub.commonMistakes.map((m, i) => (
                                      <li key={i}>{m}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="pt-2 border-t">
                                  <p className="text-sm">
                                    <span className="font-medium">建議：</span> {sub.suggestion}
                                  </p>
                                </div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. 各題型得分比率 */}
          <TabsContent value="types">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  各題型得分率分析
                </CardTitle>
                <CardDescription>各題型平均得分率統計</CardDescription>
              </CardHeader>
              <CardContent>
                <Bar
                  data={questionTypeScoreData}
                  options={{
                    responsive: true,
                    scales: {
                      y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                          display: true,
                          text: '得分率 (%)',
                        },
                      },
                    },
                    plugins: {
                      legend: {
                        display: false,
                      },
                    },
                  }}
                />

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {MOCK_QUESTION_TYPE_SCORES.map((q) => (
                    <div
                      key={q.type}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{q.typeName}</p>
                        <p className="text-sm text-muted-foreground">
                          {q.score.toFixed(1)} / {q.maxScore} 分
                        </p>
                      </div>
                      <Badge
                        variant={
                          q.accuracy >= 85
                            ? 'default'
                            : q.accuracy >= 70
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {q.accuracy}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. 歷次模考總分 */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  歷次模考成績趨勢
                </CardTitle>
                <CardDescription>追蹤你的進步軌跡</CardDescription>
              </CardHeader>
              <CardContent>
                <Line
                  data={examHistoryData}
                  options={{
                    responsive: true,
                    scales: {
                      y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                          display: true,
                          text: '分數',
                        },
                      },
                    },
                    plugins: {
                      legend: {
                        display: false,
                      },
                    },
                  }}
                />

                <div className="mt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>考試 ID</TableHead>
                        <TableHead className="text-right">分數</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_EXAM_HISTORY.slice()
                        .reverse()
                        .map((exam) => (
                          <TableRow key={exam.attemptId}>
                            <TableCell>{exam.date}</TableCell>
                            <TableCell className="font-mono text-sm">
                              {exam.attemptId}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {exam.score} / {exam.maxScore}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/exam/result/${exam.attemptId}`)}
                              >
                                查看
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. Level 3-6 單字錯誤比率 */}
          <TabsContent value="vocabulary">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Level 3-6 單字錯誤率分析
                </CardTitle>
                <CardDescription>了解你在不同難度單字的表現</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <Bar
                      data={vocabularyLevelData}
                      options={{
                        responsive: true,
                        scales: {
                          y: {
                            beginAtZero: true,
                            max: 50,
                            title: {
                              display: true,
                              text: '錯誤率 (%)',
                            },
                          },
                        },
                        plugins: {
                          legend: {
                            display: false,
                          },
                        },
                      }}
                    />
                  </div>

                  <div className="space-y-3">
                    {MOCK_VOCABULARY_LEVELS.map((v) => (
                      <div key={v.level} className="p-4 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">Level {v.level}</h4>
                          <Badge
                            variant={
                              v.errorRate < 15
                                ? 'default'
                                : v.errorRate < 30
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {v.errorRate.toFixed(1)}% 錯誤
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p>總測驗單字：{v.totalWords} 個</p>
                          <p>答錯單字：{v.wrongWords} 個</p>
                        </div>
                        <div className="text-sm">
                          {v.errorRate < 15 && (
                            <p className="text-success">✓ 掌握良好，繼續保持！</p>
                          )}
                          {v.errorRate >= 15 && v.errorRate < 30 && (
                            <p className="text-warning">! 建議加強複習此級單字</p>
                          )}
                          {v.errorRate >= 30 && (
                            <p className="text-destructive">
                              !! 需重點加強，建議使用字卡反覆練習
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 5. 各題型耗時 */}
          <TabsContent value="timing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      各題型耗時分析
                    </CardTitle>
                    <CardDescription>了解你在各題型的時間分配</CardDescription>
                  </div>
                  <Tabs
                    value={timingMode}
                    onValueChange={(v) => setTimingMode(v as 'total' | 'average')}
                  >
                    <TabsList>
                      <TabsTrigger value="total">總計</TabsTrigger>
                      <TabsTrigger value="average">平均</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                <Bar
                  data={timingData}
                  options={{
                    responsive: true,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '秒',
                        },
                      },
                    },
                    plugins: {
                      legend: {
                        display: false,
                      },
                    },
                  }}
                />

                {/* 展開明細表格 */}
                <div className="mt-6 space-y-3">
                  {MOCK_QUESTION_TYPE_TIMING.map((timing) => (
                    <Collapsible
                      key={timing.type}
                      open={expandedTiming === timing.type}
                      onOpenChange={(open) =>
                        setExpandedTiming(open ? timing.type : null)
                      }
                    >
                      <div className="border rounded-lg">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            className="w-full justify-between p-4 h-auto"
                          >
                            <div className="flex items-center gap-3">
                              <Info className="h-4 w-4" />
                              <div className="text-left">
                                <p className="font-medium">{timing.typeName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {timingMode === 'total'
                                    ? `總計 ${Math.floor(timing.totalTime / 60)} 分 ${
                                        timing.totalTime % 60
                                      } 秒`
                                    : `平均 ${Math.floor(timing.averageTime / 60)} 分 ${
                                        timing.averageTime % 60
                                      } 秒`}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline">{timing.questionCount} 題</Badge>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-4 pb-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>日期</TableHead>
                                  <TableHead>考試 ID</TableHead>
                                  <TableHead className="text-right">耗時</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {timing.details.map((detail) => (
                                  <TableRow key={detail.attemptId}>
                                    <TableCell>{detail.date}</TableCell>
                                    <TableCell className="font-mono text-sm">
                                      {detail.attemptId}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {Math.floor(detail.time / 60)}:{(detail.time % 60)
                                        .toString()
                                        .padStart(2, '0')}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* CTA */}
        <div className="mt-8 text-center">
          <Button size="lg" onClick={() => navigate('/exam')}>
            開始新的模擬考
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
