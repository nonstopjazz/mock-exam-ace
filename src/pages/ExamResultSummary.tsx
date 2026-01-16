import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, FileText, PenLine, MessageSquareText, Image, Layers, BookOpen, Languages, Lightbulb, Palette, TrendingUp } from "lucide-react";
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Mock exam data
const MOCK_EXAMS = [
  { id: "114-gsat", name: "114 學年度學測英文", year: "114" },
  { id: "113-gsat", name: "113 學年度學測英文", year: "113" },
  { id: "112-gsat", name: "112 學年度學測英文", year: "112" },
];

const MOCK_RESULTS: Record<string, ExamResult> = {
  "114-gsat": {
    totalScore: 78,
    maxScore: 100,
    gsatLevel: 13,
    benchmark: "前標",
    summary: "整體表現優異，閱讀理解與單字能力突出，建議加強混合題型的作答策略。",
    reading: {
      vocabulary: { correct: 7, total: 10 },
      cloze: { correct: 6, total: 10 },
      sentenceCompletion: { correct: 8, total: 10 },
      paragraphStructure: { correct: 2, total: 4 },
      readingComprehension: { correct: 8, total: 12 },
    },
    mixed: { score: 8, maxScore: 10 },
    writing: {
      translation: { score: 6, maxScore: 8 },
      essay: { score: 15, maxScore: 20 },
      essayPrompt: "Describe a memorable experience that changed your perspective on life. Explain what happened and how it influenced your thinking.",
    },
    essaySubmission: {
      type: "text",
      content: "One memorable experience that changed my perspective on life was when I volunteered at a local elderly care center last summer. Before this experience, I had always taken my family for granted and rarely thought about the challenges that older people face.\n\nDuring my time there, I met Mrs. Chen, an 85-year-old woman who had been living alone since her husband passed away. Despite her loneliness, she always greeted everyone with a warm smile and shared stories about her youth. She taught me that happiness doesn't come from material possessions but from meaningful connections with others.\n\nThis experience made me realize how important it is to cherish every moment with our loved ones and to show kindness to strangers. Now, I make it a point to call my grandparents every week and volunteer regularly at the center.",
    },
    essayFeedback: {
      overall: "文章結構完整，敘事流暢，能清楚表達經歷對自己的影響。整體表現優異！",
      categories: [
        {
          id: "structure",
          label: "結構",
          icon: "structure",
          color: "primary",
          grade: "A",
          items: ["開頭有效引入主題", "結尾呼應主題，展現個人成長", "段落分明，邏輯清晰"],
        },
        {
          id: "content",
          label: "內容",
          icon: "content",
          color: "success",
          grade: "A+",
          items: ["以具體例子（陳奶奶）支持論點", "可增加更多感官描寫，使場景更生動"],
        },
        {
          id: "grammar",
          label: "文法",
          icon: "grammar",
          color: "warning",
          grade: "B+",
          items: ["正確使用過去完成式 ✓", "第二段轉折處可加強連接詞的使用"],
        },
        {
          id: "vocabulary",
          label: "用詞",
          icon: "vocabulary",
          color: "secondary",
          grade: "B",
          items: ["\"elderly care center\" 可改為 \"senior care facility\" 更正式", "建議使用更多樣的句型結構"],
        },
      ],
    },
  },
  "113-gsat": {
    totalScore: 72,
    maxScore: 100,
    gsatLevel: 12,
    benchmark: "均標",
    summary: "整體表現穩定，閱讀測驗需加強時間分配，寫作方面有進步空間。",
    reading: {
      vocabulary: { correct: 6, total: 10 },
      cloze: { correct: 5, total: 10 },
      sentenceCompletion: { correct: 7, total: 10 },
      paragraphStructure: { correct: 3, total: 4 },
      readingComprehension: { correct: 7, total: 12 },
    },
    mixed: { score: 6, maxScore: 10 },
    writing: {
      translation: { score: 5, maxScore: 8 },
      essay: { score: 13, maxScore: 20 },
      essayPrompt: "Write about a person who has had a significant impact on your life and explain why.",
    },
    essaySubmission: {
      type: "images",
      images: [
        "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=600&h=800&fit=crop",
        "https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&h=800&fit=crop",
      ],
    },
    essayFeedback: {
      overall: "文章描述了一位重要人物對自己的影響，但論述略顯平淡，有進步空間。",
      categories: [
        {
          id: "structure",
          label: "結構",
          icon: "structure",
          color: "primary",
          grade: "B",
          items: ["選擇了明確的主題人物", "結尾部分可以更具體說明影響的應用"],
        },
        {
          id: "content",
          label: "內容",
          icon: "content",
          color: "success",
          grade: "B+",
          items: ["有提及具體的影響事例", "需要更深入探討「為什麼」這個人如此重要", "建議增加更多情感層面的描寫"],
        },
        {
          id: "grammar",
          label: "文法",
          icon: "grammar",
          color: "warning",
          grade: "C+",
          items: ["注意動詞時態一致性", "部分句子過長，建議分割為較短的句子"],
        },
      ],
    },
  },
  "112-gsat": {
    totalScore: 65,
    maxScore: 100,
    gsatLevel: 11,
    benchmark: "後標",
    summary: "基礎能力尚可，需加強綜合測驗與篇章結構的練習，寫作需注意文法正確性。",
    reading: {
      vocabulary: { correct: 5, total: 10 },
      cloze: { correct: 4, total: 10 },
      sentenceCompletion: { correct: 6, total: 10 },
      paragraphStructure: { correct: 2, total: 4 },
      readingComprehension: { correct: 6, total: 12 },
    },
    mixed: { score: 5, maxScore: 10 },
    writing: {
      translation: { score: 4, maxScore: 8 },
      essay: { score: 11, maxScore: 20 },
      essayPrompt: "Discuss the advantages and disadvantages of social media in modern life.",
    },
    essaySubmission: {
      type: "text",
      content: "Social media is very popular today. Many people use Facebook and Instagram every day. I think social media has good and bad things.\n\nThe good thing is we can talk to friends easily. We can also learn news quickly. Many people share interesting things on social media.\n\nBut social media also has problems. Some people spend too much time on it. They don't study or exercise. Also, some information on social media is not true.\n\nIn conclusion, social media is useful but we should use it carefully.",
    },
    essayFeedback: {
      overall: "文章結構基本完整，但內容深度不足，用詞較為簡單，需加強練習。",
      categories: [
        {
          id: "structure",
          label: "結構",
          icon: "structure",
          color: "primary",
          grade: "B",
          items: ["有基本的段落架構", "論點清楚區分優缺點", "結論段落過於簡短，需要更完整的總結"],
        },
        {
          id: "content",
          label: "內容",
          icon: "content",
          color: "success",
          grade: "C+",
          items: ["需要更具體的例子來支持論點", "可以加入個人經驗或觀察來增加說服力"],
        },
        {
          id: "vocabulary",
          label: "用詞",
          icon: "vocabulary",
          color: "secondary",
          grade: "C",
          items: ["用詞過於簡單，建議使用更豐富的詞彙", "\"good and bad things\" 可改為 \"advantages and disadvantages\"", "避免重複使用 \"social media\"，可用 \"it\" 或 \"these platforms\" 替代"],
        },
        {
          id: "grammar",
          label: "文法",
          icon: "grammar",
          color: "warning",
          grade: "C+",
          items: ["\"I think\" 可改為 \"I believe\" 更正式"],
        },
      ],
    },
  },
};

interface ExamResult {
  totalScore: number;
  maxScore: number;
  gsatLevel: number;
  benchmark: "前標" | "均標" | "後標";
  summary: string;
  reading: {
    vocabulary: { correct: number; total: number };
    cloze: { correct: number; total: number };
    sentenceCompletion: { correct: number; total: number };
    paragraphStructure: { correct: number; total: number };
    readingComprehension: { correct: number; total: number };
  };
  mixed: { score: number; maxScore: number };
  writing: {
    translation: { score: number; maxScore: number };
    essay: { score: number; maxScore: number };
    essayPrompt: string;
  };
  essaySubmission: {
    type: "text" | "images";
    content?: string;
    images?: string[];
  };
  essayFeedback: {
    overall: string;
    categories: {
      id: string;
      label: string;
      icon: "structure" | "grammar" | "vocabulary" | "content" | "style";
      color: string;
      grade: "A+" | "A" | "B+" | "B" | "C+" | "C" | "D";
      items: string[];
    }[];
  };
}

// Score ring component
const ScoreRing = ({ 
  percentage, 
  size = 48,
  strokeWidth = 4,
}: { 
  percentage: number; 
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  
  const getColor = () => {
    if (percentage >= 80) return "hsl(var(--success))";
    if (percentage >= 60) return "hsl(var(--primary))";
    if (percentage >= 40) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={getColor()}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
};

// Reading section card
const ReadingCard = ({ 
  title, 
  correct, 
  total,
}: { 
  title: string; 
  correct: number; 
  total: number;
}) => {
  const percentage = Math.round((correct / total) * 100);
  
  return (
    <div className="bg-card border rounded-xl p-4 flex flex-col items-center gap-3 hover:shadow-md transition-shadow">
      <div className="relative">
        <ScoreRing percentage={percentage} size={56} strokeWidth={5} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">{percentage}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold tracking-tight">
          {correct} <span className="text-lg font-normal text-muted-foreground">/ {total}</span>
        </p>
      </div>
    </div>
  );
};

// Benchmark badge
const BenchmarkBadge = ({ benchmark }: { benchmark: "前標" | "均標" | "後標" }) => {
  const variants: Record<string, { bg: string; text: string }> = {
    "前標": { bg: "bg-success/10", text: "text-success" },
    "均標": { bg: "bg-primary/10", text: "text-primary" },
    "後標": { bg: "bg-warning/10", text: "text-warning" },
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${variants[benchmark].bg} ${variants[benchmark].text}`}>
      {benchmark}
    </span>
  );
};

const ExamResultSummary = () => {
  const [selectedExam, setSelectedExam] = useState(MOCK_EXAMS[0].id);
  const result = MOCK_RESULTS[selectedExam];
  const currentExamIndex = MOCK_EXAMS.findIndex((e) => e.id === selectedExam);
  const currentExam = MOCK_EXAMS[currentExamIndex];

  const handlePrevExam = () => {
    if (currentExamIndex > 0) {
      setSelectedExam(MOCK_EXAMS[currentExamIndex - 1].id);
    }
  };

  const handleNextExam = () => {
    if (currentExamIndex < MOCK_EXAMS.length - 1) {
      setSelectedExam(MOCK_EXAMS[currentExamIndex + 1].id);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Exam Switcher */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevExam}
            disabled={currentExamIndex === 0}
            className="shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <Select value={selectedExam} onValueChange={setSelectedExam}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOCK_EXAMS.map((exam) => (
                <SelectItem key={exam.id} value={exam.id}>
                  {exam.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextExam}
            disabled={currentExamIndex === MOCK_EXAMS.length - 1}
            className="shrink-0"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Section 1: Hero - Overall Result */}
        <Card className="mb-6 border-2 overflow-hidden">
          <div className="bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
              {/* Score Circle */}
              <div className="relative shrink-0">
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-8 border-primary/20 flex items-center justify-center bg-card shadow-lg">
                  <div className="text-center">
                    <p className="text-4xl sm:text-5xl font-bold text-primary">{result.totalScore}</p>
                    <p className="text-sm text-muted-foreground">/ {result.maxScore}</p>
                  </div>
                </div>
              </div>
              
              {/* Info */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-3">
                  <Badge variant="secondary" className="text-base px-4 py-1">
                    {result.gsatLevel} 級分
                  </Badge>
                  <BenchmarkBadge benchmark={result.benchmark} />
                </div>
                <h1 className="text-xl sm:text-2xl font-semibold text-foreground mb-3">
                  {currentExam.name}
                </h1>
                <p className="text-muted-foreground leading-relaxed max-w-lg">
                  {result.summary}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Section 2: Reading Sections */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full" />
              選擇題表現
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <ReadingCard 
                title="單字題" 
                correct={result.reading.vocabulary.correct} 
                total={result.reading.vocabulary.total} 
              />
              <ReadingCard 
                title="綜合測驗" 
                correct={result.reading.cloze.correct} 
                total={result.reading.cloze.total} 
              />
              <ReadingCard 
                title="文意選填" 
                correct={result.reading.sentenceCompletion.correct} 
                total={result.reading.sentenceCompletion.total} 
              />
              <ReadingCard 
                title="篇章結構" 
                correct={result.reading.paragraphStructure.correct} 
                total={result.reading.paragraphStructure.total} 
              />
              <ReadingCard 
                title="閱讀測驗" 
                correct={result.reading.readingComprehension.correct} 
                total={result.reading.readingComprehension.total} 
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 3 & 4: Mixed + Writing (Side by Side on larger screens) */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Mixed Questions */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <span className="w-1 h-5 bg-secondary rounded-full" />
                混合題
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-6 py-4">
                <div className="relative">
                  <ScoreRing 
                    percentage={(result.mixed.score / result.mixed.maxScore) * 100} 
                    size={80} 
                    strokeWidth={6} 
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold">{Math.round((result.mixed.score / result.mixed.maxScore) * 100)}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {result.mixed.score} <span className="text-lg font-normal text-muted-foreground">/ {result.mixed.maxScore}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">得分</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Writing Section */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <span className="w-1 h-5 bg-accent rounded-full" />
                寫作題
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-6">
                {/* Scores */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">翻譯題</p>
                      <p className="text-2xl font-bold">
                        {result.writing.translation.score} 
                        <span className="text-base font-normal text-muted-foreground"> / {result.writing.translation.maxScore}</span>
                      </p>
                    </div>
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${(result.writing.translation.score / result.writing.translation.maxScore) * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">作文題</p>
                      <p className="text-2xl font-bold">
                        {result.writing.essay.score} 
                        <span className="text-base font-normal text-muted-foreground"> / {result.writing.essay.maxScore}</span>
                      </p>
                    </div>
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent rounded-full transition-all duration-500"
                        style={{ width: `${(result.writing.essay.score / result.writing.essay.maxScore) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Essay Prompt */}
                <div className="p-4 bg-card border-2 border-dashed border-muted rounded-xl">
                  <div className="flex items-start gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-muted-foreground">作文題目</p>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {result.writing.essayPrompt}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 5: Essay Submission & Feedback */}
        <Card className="mt-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full" />
              作文繳交與批改
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Student Submission */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  {result.essaySubmission.type === "text" ? (
                    <PenLine className="h-4 w-4" />
                  ) : (
                    <Image className="h-4 w-4" />
                  )}
                  <span>學生作答</span>
                </div>
                
                {result.essaySubmission.type === "text" ? (
                  <div className="p-4 bg-muted/30 rounded-xl border max-h-80 overflow-y-auto">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {result.essaySubmission.content}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.essaySubmission.images?.map((img, index) => (
                      <div key={index} className="relative rounded-xl overflow-hidden border bg-muted/30">
                        <img 
                          src={img} 
                          alt={`作文圖片 ${index + 1}`}
                          className="w-full h-auto max-h-60 object-contain"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Feedback */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MessageSquareText className="h-4 w-4" />
                  <span>批改意見</span>
                </div>
                
                {/* Overall feedback */}
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {result.essayFeedback.overall}
                  </p>
                </div>

                {/* Categorized feedback */}
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {result.essayFeedback.categories.map((category) => {
                    const iconMap = {
                      structure: Layers,
                      content: Lightbulb,
                      grammar: Languages,
                      vocabulary: BookOpen,
                      style: Palette,
                    };
                    const colorMap: Record<string, string> = {
                      primary: "bg-primary/10 text-primary border-primary/30",
                      success: "bg-success/10 text-success border-success/30",
                      warning: "bg-warning/10 text-warning border-warning/30",
                      secondary: "bg-secondary/10 text-secondary-foreground border-secondary/30",
                    };
                    const gradeColorMap: Record<string, string> = {
                      "A+": "bg-success text-success-foreground",
                      "A": "bg-success/80 text-success-foreground",
                      "B+": "bg-primary text-primary-foreground",
                      "B": "bg-primary/80 text-primary-foreground",
                      "C+": "bg-warning text-warning-foreground",
                      "C": "bg-warning/80 text-warning-foreground",
                      "D": "bg-destructive text-destructive-foreground",
                    };
                    const Icon = iconMap[category.icon];
                    
                    return (
                      <div key={category.id} className="border rounded-lg overflow-hidden">
                        <div className={`flex items-center justify-between px-3 py-2 ${colorMap[category.color]} border-b`}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold">{category.label}</span>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${gradeColorMap[category.grade]}`}>
                            {category.grade}
                          </span>
                        </div>
                        <ul className="p-3 space-y-1.5 bg-card">
                          {category.items.map((item, idx) => (
                            <li key={idx} className="text-xs text-foreground/80 leading-relaxed flex gap-2">
                              <span className="text-muted-foreground shrink-0">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 6: Historical Trend Chart */}
        <Card className="mt-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <span className="w-1 h-5 bg-secondary rounded-full" />
              <TrendingUp className="h-4 w-4" />
              歷次成績趨勢
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Convert grades to numeric scores for charting
              const gradeToScore = (grade: string): number => {
                const map: Record<string, number> = {
                  "A+": 100, "A": 90, "B+": 80, "B": 70, "C+": 60, "C": 50, "D": 40
                };
                return map[grade] || 0;
              };

              // Build trend data from all exams
              const trendData = MOCK_EXAMS.slice().reverse().map((exam) => {
                const examResult = MOCK_RESULTS[exam.id];
                const categories = examResult.essayFeedback.categories;
                
                const dataPoint: Record<string, string | number> = {
                  name: exam.year + "學測",
                  總分: examResult.totalScore,
                };
                
                categories.forEach((cat) => {
                  dataPoint[cat.label] = gradeToScore(cat.grade);
                });
                
                return dataPoint;
              });

              // Get all unique category labels
              const allCategories = new Set<string>();
              MOCK_EXAMS.forEach((exam) => {
                MOCK_RESULTS[exam.id].essayFeedback.categories.forEach((cat) => {
                  allCategories.add(cat.label);
                });
              });

              const categoryColors: Record<string, string> = {
                "結構": "hsl(var(--primary))",
                "內容": "hsl(var(--success))",
                "文法": "hsl(var(--warning))",
                "用詞": "hsl(var(--secondary))",
              };

              return (
                <div className="space-y-4">
                  {/* Legend explanation */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary" /> A+=100
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary/80" /> A=90
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary/60" /> B+=80
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary/40" /> B=70
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-warning" /> C+=60
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-warning/60" /> C=50
                    </span>
                  </div>

                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={{ stroke: "hsl(var(--border))" }}
                        />
                        <YAxis 
                          domain={[0, 100]} 
                          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={{ stroke: "hsl(var(--border))" }}
                          tickFormatter={(value) => {
                            if (value === 100) return "A+";
                            if (value === 90) return "A";
                            if (value === 80) return "B+";
                            if (value === 70) return "B";
                            if (value === 60) return "C+";
                            if (value === 50) return "C";
                            return "";
                          }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "hsl(var(--card))", 
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px"
                          }}
                          formatter={(value: number) => {
                            if (value === 100) return "A+";
                            if (value === 90) return "A";
                            if (value === 80) return "B+";
                            if (value === 70) return "B";
                            if (value === 60) return "C+";
                            if (value === 50) return "C";
                            if (value === 40) return "D";
                            return value;
                          }}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: "12px" }}
                          iconType="circle"
                        />
                        {Array.from(allCategories).map((cat) => (
                          <Line
                            key={cat}
                            type="monotone"
                            dataKey={cat}
                            stroke={categoryColors[cat] || "hsl(var(--muted-foreground))"}
                            strokeWidth={2}
                            dot={{ r: 4, fill: categoryColors[cat] || "hsl(var(--muted-foreground))" }}
                            activeDot={{ r: 6 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Summary insights */}
                  <div className="grid sm:grid-cols-2 gap-3 pt-2">
                    <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
                      <p className="text-xs font-medium text-success mb-1">📈 進步最多</p>
                      <p className="text-sm text-foreground/80">內容表現從 C+ 提升至 A+，進步 3 個等級</p>
                    </div>
                    <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                      <p className="text-xs font-medium text-warning mb-1">⚠️ 需要加強</p>
                      <p className="text-sm text-foreground/80">文法維持在 B+~C+ 之間，建議加強練習</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ExamResultSummary;
