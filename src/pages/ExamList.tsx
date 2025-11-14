import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { PAST_EXAMS, MOCK_EXAMS, ExamListItem } from "@/data/mock-exam-list";
import { Clock, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ExamList = () => {
  const navigate = useNavigate();

  const handleStartExam = (exam: ExamListItem) => {
    // TODO: Load specific exam based on exam.id
    // For now, navigate to the exam page
    navigate('/exam');
  };

  const renderExamCard = (exam: ExamListItem) => (
    <Card key={exam.id} className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2">{exam.title}</CardTitle>
            <CardDescription>{exam.description}</CardDescription>
          </div>
          {!exam.hasContent && (
            <Badge variant="outline" className="ml-2 text-amber-600 border-amber-600">
              僅計時
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6 mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>{exam.duration} 分鐘</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>總分 {exam.totalPoints} 分</span>
          </div>
        </div>
        
        {!exam.hasContent && (
          <Alert className="mb-4 border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-800">
              此為計時模式，請準備好紙本題目再開始
            </AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={() => handleStartExam(exam)}
          className="w-full"
          variant={exam.hasContent ? "default" : "outline"}
        >
          {exam.hasContent ? "開始作答" : "開始計時"}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">選擇試題</h1>
          <p className="text-muted-foreground">
            選擇歷屆試題作答，或使用模擬考題進行計時練習
          </p>
        </div>

        {/* 歷屆試題 Section */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-2">歷屆試題</h2>
            <p className="text-muted-foreground">
              完整的學測歷屆考題，包含所有題目與詳細解析
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PAST_EXAMS.map(renderExamCard)}
          </div>
        </section>

        {/* 模擬考題 Section */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-2">模擬考題</h2>
            <p className="text-muted-foreground">
              各區模擬考試題，提供計時功能與答題統計（需搭配紙本題目）
            </p>
          </div>

          {/* 北模 */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-primary">北區模擬考</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {MOCK_EXAMS.filter(e => e.category === '北模').map(renderExamCard)}
            </div>
          </div>

          {/* 全模 */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-primary">全國模擬考</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {MOCK_EXAMS.filter(e => e.category === '全模').map(renderExamCard)}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default ExamList;
