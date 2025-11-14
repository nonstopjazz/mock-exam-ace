import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate, useParams } from "react-router-dom";
import { useExamStore } from "@/store/examStore";
import { MOCK_EXAM_PAPER } from "@/data/mock-exam";
import { Trophy, Clock, CheckCircle2, XCircle, BookMarked, BarChart3 } from "lucide-react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useState, useMemo } from 'react';
import { Question } from '@/types/exam';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// TODO: 未來從 API 依 attemptId 拉取資料
// GET /api/exam/result/:attemptId
// Response: { score, breakdown, timings, wrongAnswers, analysis }

const ExamResult = () => {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { answers, examPaper, getTimingSummary } = useExamStore();
  
  const [timingMode, setTimingMode] = useState<'total' | 'average'>('total');

  // 使用 mock 試卷進行判分
  const paper = examPaper || MOCK_EXAM_PAPER;
  const allQuestions = paper.sections.flatMap((s) => s.questions);
  const timingSummary = getTimingSummary();

  // Mock 判分邏輯
  const grading = useMemo(() => {
    let totalScore = 0;
    let maxScore = 0;
    const wrongAnswers: Array<{
      question: Question;
      questionNumber: number;
      studentAnswer: any;
      correctAnswer: any;
      points: number;
    }> = [];

    const sectionScores: Record<string, { score: number; maxScore: number; title: string }> = {};

    // 題型時間統計
    const typeTimings: Record<string, { total: number; count: number }> = {};

    allQuestions.forEach((question, index) => {
      maxScore += question.points;
      const studentAnswer = answers[question.id];
      let isCorrect = false;
      let earnedPoints = 0;

      // 收集時間統計
      const timing = timingSummary.find((t) => t.questionId === question.id);
      const timeSpent = timing?.timeSpent || 0;
      
      if (!typeTimings[question.type]) {
        typeTimings[question.type] = { total: 0, count: 0 };
      }
      typeTimings[question.type].total += timeSpent;
      typeTimings[question.type].count += 1;

      // 判分（僅選擇題自動判分，非選題給部分分數 mock）
      switch (question.type) {
        case 'multiple-choice':
          isCorrect = studentAnswer === question.correctAnswer;
          earnedPoints = isCorrect ? question.points : 0;
          if (!isCorrect) {
            wrongAnswers.push({
              question,
              questionNumber: index + 1,
              studentAnswer: studentAnswer || '未作答',
              correctAnswer: question.correctAnswer,
              points: question.points,
            });
          }
          break;

        case 'cloze':
        case 'reading':
        case 'hybrid':
          let correctCount = 0;
          let totalSubQuestions = question.questions.length;
          
          question.questions.forEach((subQ: any) => {
            const subAnswer = studentAnswer?.[subQ.questionNumber || subQ.blankNumber];
            if (subAnswer === subQ.correctAnswer) {
              correctCount++;
            }
          });
          
          earnedPoints = (correctCount / totalSubQuestions) * question.points;
          isCorrect = correctCount === totalSubQuestions;
          
          if (!isCorrect) {
            wrongAnswers.push({
              question,
              questionNumber: index + 1,
              studentAnswer: studentAnswer || {},
              correctAnswer: question.questions.map((sq: any) => sq.correctAnswer),
              points: question.points,
            });
          }
          break;

        case 'fill-in-blank':
        case 'sentence-ordering':
          let correctBlanks = 0;
          const totalBlanks = question.blanks.length;
          
          question.blanks.forEach((blank: any) => {
            const blankAnswer = studentAnswer?.[blank.blankNumber];
            if (blankAnswer === blank.correctAnswer) {
              correctBlanks++;
            }
          });
          
          earnedPoints = (correctBlanks / totalBlanks) * question.points;
          isCorrect = correctBlanks === totalBlanks;
          
          if (!isCorrect) {
            wrongAnswers.push({
              question,
              questionNumber: index + 1,
              studentAnswer: studentAnswer || {},
              correctAnswer: question.blanks.map((b: any) => b.correctAnswer),
              points: question.points,
            });
          }
          break;

        case 'translation':
          // Mock: 給予部分分數（實際需 AI 判分）
          earnedPoints = studentAnswer ? question.points * 0.6 : 0;
          if (earnedPoints < question.points) {
            wrongAnswers.push({
              question,
              questionNumber: index + 1,
              studentAnswer: studentAnswer || '未作答',
              correctAnswer: question.correctAnswer,
              points: question.points,
            });
          }
          break;

        case 'essay':
          // Mock: 給予部分分數（實際需 AI 判分）
          earnedPoints = studentAnswer ? question.points * 0.7 : 0;
          if (earnedPoints < question.points) {
            wrongAnswers.push({
              question,
              questionNumber: index + 1,
              studentAnswer: studentAnswer || '未作答',
              correctAnswer: '需人工或 AI 批改',
              points: question.points,
            });
          }
          break;
      }

      totalScore += earnedPoints;

      // 統計各區段分數
      const section = paper.sections.find((s) =>
        s.questions.some((q) => q.id === question.id)
      );
      if (section) {
        if (!sectionScores[section.sectionId]) {
          sectionScores[section.sectionId] = {
            score: 0,
            maxScore: 0,
            title: section.title,
          };
        }
        sectionScores[section.sectionId].score += earnedPoints;
        sectionScores[section.sectionId].maxScore += question.points;
      }
    });

    return {
      totalScore: Math.round(totalScore),
      maxScore,
      correctCount: allQuestions.length - wrongAnswers.length,
      wrongCount: wrongAnswers.length,
      wrongAnswers,
      sectionScores,
      typeTimings,
    };
  }, [answers, paper, allQuestions, timingSummary]);

  // 準備題型耗時圖表資料
  const typeLabels: Record<string, string> = {
    'multiple-choice': '單選題',
    'cloze': '克漏字',
    'fill-in-blank': '文意選填',
    'sentence-ordering': '篇章結構',
    'reading': '閱讀測驗',
    'hybrid': '混合題',
    'translation': '翻譯',
    'essay': '作文',
  };

  const timingChartData = {
    labels: Object.keys(grading.typeTimings).map((type) => typeLabels[type] || type),
    datasets: [
      {
        label: timingMode === 'total' ? '總計耗時 (秒)' : '平均耗時 (秒)',
        data: Object.values(grading.typeTimings).map((t) =>
          timingMode === 'total' ? t.total : Math.round(t.total / t.count)
        ),
        backgroundColor: 'hsl(var(--primary))',
      },
    ],
  };

  const getScoreColor = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 90) return 'text-success';
    if (percentage >= 70) return 'text-primary';
    if (percentage >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const handleAddToTraining = () => {
    // TODO: Call API to add wrong questions to training list
    console.log('=== 加入訓練清單 (Mock) ===');
    console.log({
      attemptId,
      wrongQuestionIds: grading.wrongAnswers.map((w) => w.question.id),
    });
    alert('已加入訓練清單！（Mock）');
  };

  return (
    <Layout>
      <div className="bg-gradient-to-br from-primary/5 via-secondary/5 to-background py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <Trophy className="h-8 w-8" />
            </div>
            <h1 className="mb-2 text-2xl sm:text-3xl md:text-4xl font-bold">考試完成！</h1>
            <p className="text-muted-foreground">模擬考試 ID: {attemptId}</p>
          </div>

          {/* Score Overview */}
          <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-2 border-primary">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground">總分</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl sm:text-3xl md:text-4xl font-bold ${getScoreColor(grading.totalScore, grading.maxScore)}`}>
                  {grading.totalScore}
                </div>
                <p className="text-sm text-muted-foreground">/ {grading.maxScore} 分</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  答對題數
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-success">
                  {grading.correctCount}
                </div>
                <p className="text-sm text-muted-foreground">/ {allQuestions.length} 題</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  答錯題數
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-destructive">
                  {grading.wrongCount}
                </div>
                <p className="text-sm text-muted-foreground">題</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-accent" />
                  總作答時間
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold">
                  {Math.floor(timingSummary.reduce((sum, t) => sum + t.timeSpent, 0) / 60)}
                </div>
                <p className="text-sm text-muted-foreground">分鐘</p>
              </CardContent>
            </Card>
          </div>

          {/* Section Scores */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>各題型分數</CardTitle>
              <CardDescription>各區段得分明細</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(grading.sectionScores).map(([sectionId, data]) => (
                  <div key={sectionId} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium">{data.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {((data.score / data.maxScore) * 100).toFixed(1)}% 正確率
                      </p>
                    </div>
                    <div className={`text-2xl font-bold ${getScoreColor(data.score, data.maxScore)}`}>
                      {Math.round(data.score)} / {data.maxScore}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Timing Chart */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    各題型耗時分析
                  </CardTitle>
                  <CardDescription>了解你在各題型的時間分配</CardDescription>
                </div>
                <Tabs value={timingMode} onValueChange={(v) => setTimingMode(v as 'total' | 'average')}>
                  <TabsList>
                    <TabsTrigger value="total">總計</TabsTrigger>
                    <TabsTrigger value="average">平均</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <Bar
                data={timingChartData}
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
            </CardContent>
          </Card>

          {/* Wrong Answers List */}
          {grading.wrongAnswers.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-destructive" />
                      錯題清單
                    </CardTitle>
                    <CardDescription>
                      共 {grading.wrongAnswers.length} 題需要複習
                    </CardDescription>
                  </div>
                  <Button onClick={handleAddToTraining} className="gap-2">
                    <BookMarked className="h-4 w-4" />
                    加入訓練清單
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {grading.wrongAnswers.map((wrong, index) => (
                    <div
                      key={wrong.question.id}
                      className="p-4 border rounded-lg bg-muted/30 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="destructive">第 {wrong.questionNumber} 題</Badge>
                          <Badge variant="outline">
                            {typeLabels[wrong.question.type] || wrong.question.type}
                          </Badge>
                          <Badge variant="secondary">{wrong.points} 分</Badge>
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm">
                        <div>
                          <span className="font-medium text-muted-foreground">題目：</span>
                          <span className="ml-2">
                            {wrong.question.type === 'multiple-choice'
                              ? wrong.question.question
                              : `${typeLabels[wrong.question.type]}題組`}
                          </span>
                        </div>

                        <div>
                          <span className="font-medium text-destructive">你的答案：</span>
                          <span className="ml-2 text-destructive">
                            {typeof wrong.studentAnswer === 'object'
                              ? JSON.stringify(wrong.studentAnswer)
                              : wrong.studentAnswer}
                          </span>
                        </div>

                        <div>
                          <span className="font-medium text-success">正確答案：</span>
                          <span className="ml-2 text-success">
                            {Array.isArray(wrong.correctAnswer)
                              ? wrong.correctAnswer.join(', ')
                              : wrong.correctAnswer}
                          </span>
                        </div>

                        {/* TODO: 解析佔位 */}
                        <div className="pt-2 border-t">
                          <span className="font-medium text-muted-foreground">解析：</span>
                          <p className="mt-1 text-muted-foreground italic">
                            （待串接 API 提供詳細解析與學習建議）
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
