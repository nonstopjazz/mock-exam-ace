import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

// TODO: Fetch from API
const MOCK_QUESTIONS = [
  {
    id: "q1",
    type: "multiple-choice" as const,
    content: "What is the main idea of the passage?",
    options: ["Option A", "Option B", "Option C", "Option D"],
    passage: "This is a sample reading passage for the exam...",
  },
  {
    id: "q2",
    type: "multiple-choice" as const,
    content: "According to the author, which statement is true?",
    options: ["Statement 1", "Statement 2", "Statement 3", "Statement 4"],
  },
];

const Exam = () => {
  const navigate = useNavigate();
  const {
    questions,
    answers,
    startTime,
    timeRemaining,
    currentAttemptId,
    startExam,
    setAnswer,
    submitExam,
    updateTimeRemaining,
  } = useExamStore();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  // Initialize exam on mount
  useEffect(() => {
    if (!startTime) {
      startExam(MOCK_QUESTIONS, 100); // 100 minutes exam
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

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = () => {
    submitExam();
    // TODO: Submit to API
    navigate(`/exam/result/${currentAttemptId}`);
  };

  if (!currentQuestion) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p>載入中...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showFooter={false}>
      <div className="container mx-auto px-4 py-8">
        {/* Header with Timer */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-lg px-4 py-2">
              第 {currentQuestionIndex + 1} / {questions.length} 題
            </Badge>
            <Progress value={progress} className="w-48" />
          </div>
          
          <div className={`flex items-center gap-2 text-lg font-semibold ${timeRemaining < 600 ? 'text-destructive' : 'text-primary'}`}>
            <Clock className="h-5 w-5" />
            <span>{formatTime(timeRemaining)}</span>
          </div>
        </div>

        {/* Question Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">題目 {currentQuestionIndex + 1}</CardTitle>
            {currentQuestion.passage && (
              <CardDescription className="mt-4 whitespace-pre-wrap text-base leading-relaxed">
                {currentQuestion.passage}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <p className="mb-6 text-lg font-medium">{currentQuestion.content}</p>

            {currentQuestion.options && (
              <RadioGroup
                value={answers[currentQuestion.id] || ""}
                onValueChange={(value) => setAnswer(currentQuestion.id, value)}
              >
                <div className="space-y-3">
                  {currentQuestion.options.map((option, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
                    >
                      <RadioGroupItem value={option} id={`option-${index}`} />
                      <Label
                        htmlFor={`option-${index}`}
                        className="flex-1 cursor-pointer text-base"
                      >
                        {option}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
            disabled={currentQuestionIndex === 0}
          >
            上一題
          </Button>

          <div className="flex gap-3">
            {currentQuestionIndex < questions.length - 1 ? (
              <Button
                onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
              >
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
                你已完成 {Object.keys(answers).length} / {questions.length} 題。
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

export default Exam;
