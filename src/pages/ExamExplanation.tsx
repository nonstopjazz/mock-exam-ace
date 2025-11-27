import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExplanationHeader } from '@/components/exam/explanation/ExplanationHeader';
import { ExplanationPassage } from '@/components/exam/explanation/ExplanationPassage';
import { ExplanationQuestion } from '@/components/exam/explanation/ExplanationQuestion';
import { ExplanationText } from '@/components/exam/explanation/ExplanationText';
import { ExplanationVideo } from '@/components/exam/explanation/ExplanationVideo';
import { ExplanationNavigation } from '@/components/exam/explanation/ExplanationNavigation';
import { Question, QuestionExplanation } from '@/types/exam';
import { toast } from 'sonner';

// 模擬數據 - 實際使用時應從 API 或 store 獲取
const mockExplanations = new Map<string, QuestionExplanation>([
  [
    'q1',
    {
      questionId: 'q1',
      coreConceptTitle: '核心概念',
      coreConcept: '本題考查動詞時態的正確使用。在描述過去發生且已完成的動作時，應使用過去簡單式。',
      keywordsTitle: '關鍵字',
      keywords: ['過去簡單式', '時態', '動詞變化', '語法結構'],
      detailedAnalysisTitle: '詳細解析',
      detailedAnalysis: `
<p><strong>第一步：理解題意</strong></p>
<p>題目描述的是一個過去發生的事件，因此需要使用過去式。</p>

<p><strong>第二步：分析選項</strong></p>
<ul>
  <li><strong>(A) went</strong> - 過去簡單式，正確 ✓</li>
  <li><strong>(B) go</strong> - 現在式，不符合時態</li>
  <li><strong>(C) will go</strong> - 未來式，不符合時態</li>
  <li><strong>(D) going</strong> - 動名詞，缺少助動詞</li>
</ul>

<p><strong>第三步：驗證答案</strong></p>
<p>將選項 (A) 代入句子，語意通順且文法正確。</p>
      `,
      videoEnabled: true,
      videoUrl: 'https://example.com/video1.mp4',
      videoTitle: '影片講解',
    },
  ],
]);

const mockQuestions: Question[] = [
  {
    id: 'q1',
    type: 'multiple-choice',
    question: 'She _____ to school yesterday.',
    options: [
      { label: 'A', text: 'went' },
      { label: 'B', text: 'go' },
      { label: 'C', text: 'will go' },
      { label: 'D', text: 'going' },
    ],
    correctAnswer: 'A',
    points: 1,
  },
];

const mockStudentAnswers = new Map([['q1', 'B']]);

export default function ExamExplanation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const questionIndexParam = searchParams.get('question');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(
    questionIndexParam ? parseInt(questionIndexParam) : 0
  );
  const [isAdmin] = useState(false); // 實際應從用戶狀態獲取

  // 實際使用時應從 props 或 store 獲取
  const questions = mockQuestions;
  const explanations = mockExplanations;
  const studentAnswers = mockStudentAnswers;

  const currentQuestion = questions[currentQuestionIndex];
  const currentExplanation = explanations.get(currentQuestion?.id);
  const studentAnswer = studentAnswers.get(currentQuestion?.id);

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleBackToResults = () => {
    navigate('/exam-result');
  };

  const handleUploadVideo = (file: File) => {
    console.log('Uploading video:', file.name);
    toast.success('影片上傳成功！');
    // 實際上傳邏輯
  };

  const handleToggleVideo = (enabled: boolean) => {
    console.log('Toggle video:', enabled);
    toast.success(enabled ? '影片已啟用' : '影片已隱藏');
    // 實際切換邏輯
  };

  // 獲取題幹內容（根據題型）
  const getPassage = () => {
    if (currentQuestion.type === 'cloze') {
      return currentQuestion.passage;
    }
    if (currentQuestion.type === 'reading') {
      return currentQuestion.passage;
    }
    if (currentQuestion.type === 'fill-in-blank') {
      return currentQuestion.passage;
    }
    if (currentQuestion.type === 'sentence-ordering') {
      return currentQuestion.passage;
    }
    if (currentQuestion.type === 'hybrid') {
      return currentQuestion.passage;
    }
    return undefined;
  };

  const getPassageTitle = () => {
    if (currentQuestion.type === 'cloze') return '克漏字文章';
    if (currentQuestion.type === 'reading') return currentQuestion.title || '閱讀文章';
    if (currentQuestion.type === 'fill-in-blank') return '文意選填文章';
    if (currentQuestion.type === 'sentence-ordering') return '篇章結構文章';
    if (currentQuestion.type === 'hybrid') return '混合題文章';
    return '題幹';
  };

  if (!currentQuestion) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">找不到題目資料</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto py-6 px-4 max-w-4xl space-y-6">
        {/* 頁面標題區 */}
        <ExplanationHeader
          question={currentQuestion}
          questionNumber={currentQuestionIndex + 1}
        />

        {/* 題幹區 */}
        <ExplanationPassage passage={getPassage()} title={getPassageTitle()} />

        {/* 題目本體與選項 */}
        <ExplanationQuestion question={currentQuestion} studentAnswer={studentAnswer} />

        {/* 詳解文字 */}
        <ExplanationText explanation={currentExplanation} />

        {/* 影片講解 */}
        <ExplanationVideo
          explanation={currentExplanation}
          isAdmin={isAdmin}
          onUploadVideo={handleUploadVideo}
          onToggleVideo={handleToggleVideo}
        />
      </div>

      {/* 導航按鈕（固定在底部） */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t">
        <div className="container mx-auto max-w-4xl">
          <ExplanationNavigation
            currentQuestionIndex={currentQuestionIndex}
            totalQuestions={questions.length}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onBackToResults={handleBackToResults}
          />
        </div>
      </div>
    </div>
  );
}
