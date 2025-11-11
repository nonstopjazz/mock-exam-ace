import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { useExamStore } from "@/store/examStore";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Clock, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MOCK_EXAM_PAPER } from "@/data/mock-exam";
import { Question } from "@/types/exam";

const ExamNew = () => {
  const navigate = useNavigate();
  const {
    examPaper,
    answers,
    startTime,
    timeRemaining,
    currentAttemptId,
    currentQuestionIndex,
    startExam,
    setAnswer,
    setCurrentQuestionIndex,
    submitExam,
    updateTimeRemaining,
  } = useExamStore();

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  // Initialize exam on mount
  useEffect(() => {
    if (!startTime) {
      startExam(MOCK_EXAM_PAPER);
    }
  }, []);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const timer = setInterval(() => {
      updateTimeRemaining(timeRemaining - 1);
      if (timeRemaining <= 1) {
        handleSubmit();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  if (!examPaper) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p>載入中...</p>
        </div>
      </Layout>
    );
  }

  // 扁平化所有題目
  const allQuestions: Question[] = examPaper.sections.flatMap((section) => section.questions);
  const currentQuestion = allQuestions[currentQuestionIndex];

  const progress = ((currentQuestionIndex + 1) / allQuestions.length) * 100;
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = () => {
    submitExam();
    navigate(`/exam/result/${currentAttemptId}`);
  };

  const handleAnswerChange = (answer: any) => {
    setAnswer(currentQuestion.id, answer);
  };

  // 計算答題數量
  const answeredCount = Object.keys(answers).length;

  return (
    <Layout showFooter={false}>
      <div className="container mx-auto px-4 py-8">
        {/* Header with Timer */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2">{examPaper.title}</h1>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-base px-4 py-2">
                第 {currentQuestionIndex + 1} / {allQuestions.length} 題
              </Badge>
              <Progress value={progress} className="w-48" />
            </div>
          </div>

          <div
            className={`flex items-center gap-2 text-lg font-semibold ${
              timeRemaining < 600 ? "text-destructive" : "text-primary"
            }`}
          >
            <Clock className="h-5 w-5" />
            <span>{formatTime(timeRemaining)}</span>
          </div>
        </div>

        {/* Question Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">
                {currentQuestion.type === 'multiple-choice' && '單選題'}
                {currentQuestion.type === 'cloze' && '克漏字'}
                {currentQuestion.type === 'fill-in-blank' && '文意選填'}
                {currentQuestion.type === 'sentence-ordering' && '篇章結構'}
                {currentQuestion.type === 'reading' && '閱讀測驗'}
                {currentQuestion.type === 'hybrid' && '混合題'}
                {currentQuestion.type === 'translation' && '翻譯'}
                {currentQuestion.type === 'essay' && '作文'}
              </CardTitle>
              <Badge>{currentQuestion.points} 分</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <QuestionRenderer
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              onAnswerChange={handleAnswerChange}
            />
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
            disabled={currentQuestionIndex === 0}
          >
            上一題
          </Button>

          <div className="text-sm text-muted-foreground">
            已作答：{answeredCount} / {allQuestions.length}
          </div>

          <div className="flex gap-3">
            {currentQuestionIndex < allQuestions.length - 1 ? (
              <Button onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}>
                下一題
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={() => setShowSubmitDialog(true)}
                className="bg-success hover:bg-success/90"
              >
                交卷
              </Button>
            )}
          </div>
        </div>

        {/* Submit Confirmation Dialog */}
        <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-warning" />
                確認交卷？
              </AlertDialogTitle>
              <AlertDialogDescription>
                你已完成 {answeredCount} / {allQuestions.length} 題。
                交卷後將無法修改答案，確定要提交嗎？
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit}>確認交卷</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default ExamNew;
