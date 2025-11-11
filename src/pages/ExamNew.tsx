import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { AnswerMap } from "@/components/exam/AnswerMap";
import { useExamStore } from "@/store/examStore";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Clock, AlertCircle, Save } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

const ExamNew = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
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
    pauseAllTimers,
    resumeAllTimers,
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

  // 監聽頁面可見性變化（切換標籤/最小化）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseAllTimers();
      } else {
        resumeAllTimers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pauseAllTimers, resumeAllTimers]);

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

  const handleSaveProgress = () => {
    // TODO: Call API to save progress
    console.log('=== 暫存作答 (Mock) ===');
    console.log({
      attemptId: currentAttemptId,
      answers,
      currentQuestionIndex,
      timeRemaining,
    });
    
    toast({
      title: "已暫存",
      description: "作答進度已自動儲存",
    });
  };

  // 計算答題數量
  const getAnsweredCount = () => {
    return allQuestions.filter((q) => {
      const answer = answers[q.id];
      if (answer === undefined || answer === null) return false;
      
      // 檢查不同題型
      if (typeof answer === 'object') {
        return Object.keys(answer).length > 0;
      }
      
      if (typeof answer === 'string') {
        return answer.trim().length > 0;
      }
      
      return true;
    }).length;
  };

  const answeredCount = getAnsweredCount();

  return (
    <Layout showFooter={false}>
      <div className="container mx-auto px-4 py-6">
        {/* Header with Timer */}
        <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-card p-4 rounded-lg border">
          <div className="flex-1">
            <h1 className="text-xl font-bold mb-2">{examPaper.title}</h1>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-sm px-3 py-1">
                第 {currentQuestionIndex + 1} / {allQuestions.length} 題
              </Badge>
              <Progress value={progress} className="w-32 lg:w-48" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveProgress}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              暫存
            </Button>
            <div
              className={`flex items-center gap-2 text-lg font-semibold px-4 py-2 rounded-lg ${
                timeRemaining < 600 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
              }`}
            >
              <Clock className="h-5 w-5" />
              <span>{formatTime(timeRemaining)}</span>
            </div>
          </div>
        </div>

        {/* Main Content: Question + Answer Map */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Left: Question */}
          <div>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
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
            <div className="flex justify-between items-center mt-6">
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
          </div>

          {/* Right: Answer Map */}
          <div className="hidden lg:block">
            <AnswerMap
              questions={allQuestions}
              currentIndex={currentQuestionIndex}
              answers={answers}
              onQuestionClick={setCurrentQuestionIndex}
            />
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
