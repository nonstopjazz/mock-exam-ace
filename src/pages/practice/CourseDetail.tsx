import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Play, CheckCircle2, Lock, Clock, BookOpen } from "lucide-react";

interface Video {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  locked: boolean;
}

interface Week {
  id: string;
  weekNumber: number;
  title: string;
  description: string;
  videos: Video[];
}

// 模擬課程數據
const courseData = {
  "1": {
    id: "1",
    title: "TOEIC 金色證書衝刺班",
    description: "系統化學習 TOEIC 考試技巧，全面提升聽力和閱讀能力，目標 900+ 分數。",
    level: "進階",
    totalWeeks: 8,
    totalVideos: 32,
    completedVideos: 12,
    instructor: "王老師",
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        title: "TOEIC 考試概覽與學習策略",
        description: "了解 TOEIC 考試結構、評分標準，建立有效的學習計畫。",
        videos: [
          { id: "v1", title: "TOEIC 考試介紹", duration: "15:30", completed: true, locked: false },
          { id: "v2", title: "聽力測驗題型分析", duration: "22:45", completed: true, locked: false },
          { id: "v3", title: "閱讀測驗題型分析", duration: "20:15", completed: true, locked: false },
          { id: "v4", title: "制定個人學習計畫", duration: "18:00", completed: true, locked: false },
        ]
      },
      {
        id: "w2",
        weekNumber: 2,
        title: "聽力技巧 Part 1-2",
        description: "掌握照片描述和應答問題的解題技巧。",
        videos: [
          { id: "v5", title: "Part 1: 照片描述技巧", duration: "25:30", completed: true, locked: false },
          { id: "v6", title: "Part 1: 常見陷阱與練習", duration: "30:00", completed: true, locked: false },
          { id: "v7", title: "Part 2: 應答問題解題法", duration: "28:45", completed: true, locked: false },
          { id: "v8", title: "Part 2: 實戰演練", duration: "32:15", completed: true, locked: false },
        ]
      },
      {
        id: "w3",
        weekNumber: 3,
        title: "聽力技巧 Part 3-4",
        description: "提升對話和簡短獨白的理解能力。",
        videos: [
          { id: "v9", title: "Part 3: 對話理解策略", duration: "26:20", completed: true, locked: false },
          { id: "v10", title: "Part 3: 關鍵字捕捉技巧", duration: "24:50", completed: true, locked: false },
          { id: "v11", title: "Part 4: 獨白聽力技巧", duration: "27:30", completed: true, locked: false },
          { id: "v12", title: "Part 3-4: 綜合練習", duration: "35:00", completed: true, locked: false },
        ]
      },
      {
        id: "w4",
        weekNumber: 4,
        title: "閱讀技巧 Part 5-6",
        description: "強化文法和段落填空能力。",
        videos: [
          { id: "v13", title: "Part 5: 文法重點複習", duration: "30:00", completed: false, locked: false },
          { id: "v14", title: "Part 5: 快速解題技巧", duration: "25:45", completed: false, locked: false },
          { id: "v15", title: "Part 6: 段落填空策略", duration: "28:30", completed: false, locked: false },
          { id: "v16", title: "Part 5-6: 實戰練習", duration: "32:00", completed: false, locked: false },
        ]
      },
      {
        id: "w5",
        weekNumber: 5,
        title: "閱讀技巧 Part 7",
        description: "提升閱讀理解速度與準確度。",
        videos: [
          { id: "v17", title: "Part 7: 單篇閱讀技巧", duration: "27:15", completed: false, locked: false },
          { id: "v18", title: "Part 7: 雙篇閱讀策略", duration: "29:40", completed: false, locked: false },
          { id: "v19", title: "Part 7: 三篇閱讀攻略", duration: "31:20", completed: false, locked: false },
          { id: "v20", title: "閱讀速度提升訓練", duration: "26:50", completed: false, locked: false },
        ]
      },
      {
        id: "w6",
        weekNumber: 6,
        title: "商務英語詞彙強化",
        description: "掌握 TOEIC 高頻商務詞彙與用法。",
        videos: [
          { id: "v21", title: "辦公室常用詞彙", duration: "24:30", completed: false, locked: true },
          { id: "v22", title: "商業往來用語", duration: "26:15", completed: false, locked: true },
          { id: "v23", title: "金融財務詞彙", duration: "25:40", completed: false, locked: true },
          { id: "v24", title: "詞彙記憶法", duration: "22:00", completed: false, locked: true },
        ]
      },
      {
        id: "w7",
        weekNumber: 7,
        title: "模擬測驗與解析",
        description: "完整模擬考試體驗，分析錯誤並改進。",
        videos: [
          { id: "v25", title: "模擬測驗 1 - 聽力", duration: "45:00", completed: false, locked: true },
          { id: "v26", title: "模擬測驗 1 - 閱讀", duration: "75:00", completed: false, locked: true },
          { id: "v27", title: "模擬測驗 1 - 詳細解析", duration: "60:00", completed: false, locked: true },
          { id: "v28", title: "錯誤類型分析與改進", duration: "30:00", completed: false, locked: true },
        ]
      },
      {
        id: "w8",
        weekNumber: 8,
        title: "考前衝刺與應試策略",
        description: "最後衝刺，掌握考試時間管理與心理調適。",
        videos: [
          { id: "v29", title: "時間管理技巧", duration: "20:00", completed: false, locked: true },
          { id: "v30", title: "猜題策略與技巧", duration: "22:30", completed: false, locked: true },
          { id: "v31", title: "考前心理準備", duration: "18:45", completed: false, locked: true },
          { id: "v32", title: "考試當天注意事項", duration: "15:20", completed: false, locked: true },
        ]
      }
    ] as Week[]
  }
};

const CourseDetail = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const course = courseData[courseId as keyof typeof courseData];

  if (!course) {
    return (
      <div className="container py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">課程不存在</h2>
          <Button onClick={() => navigate("/courses")} className="mt-4">
            返回課程列表
          </Button>
        </div>
      </div>
    );
  }

  const progressPercentage = (course.completedVideos / course.totalVideos) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b">
        <div className="container py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/courses")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回課程列表
          </Button>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="secondary">{course.level}</Badge>
                <span className="text-sm text-muted-foreground">授課講師：{course.instructor}</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-3">{course.title}</h1>
              <p className="text-muted-foreground mb-4">{course.description}</p>

              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="text-foreground">{course.totalWeeks} 週課程</span>
                </div>
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" />
                  <span className="text-foreground">{course.totalVideos} 支影片</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-foreground">已完成 {course.completedVideos} 支</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">課程進度</span>
                  <span className="text-sm font-semibold text-foreground">
                    {progressPercentage.toFixed(0)}%
                  </span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Course Curriculum */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>課程大綱</CardTitle>
                <CardDescription>
                  按週次循序漸進學習，完成每週所有影片後解鎖下一週內容
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible defaultValue="w1" className="w-full">
                  {course.weeks.map((week) => {
                    const weekCompleted = week.videos.every(v => v.completed);
                    const weekInProgress = week.videos.some(v => v.completed) && !weekCompleted;
                    const completedCount = week.videos.filter(v => v.completed).length;

                    return (
                      <AccordionItem key={week.id} value={week.id}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-start gap-3 text-left w-full">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                              weekCompleted ? 'bg-primary text-primary-foreground' :
                              weekInProgress ? 'bg-primary/20 text-primary' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {week.weekNumber}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-foreground mb-1">{week.title}</h3>
                              <p className="text-sm text-muted-foreground mb-2">{week.description}</p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{week.videos.length} 支影片</span>
                                <span>•</span>
                                <span>已完成 {completedCount}/{week.videos.length}</span>
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pl-13 space-y-2">
                            {week.videos.map((video, index) => (
                              <div key={video.id}>
                                <button
                                  onClick={() => !video.locked && setSelectedVideo(video)}
                                  disabled={video.locked}
                                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                                    video.locked
                                      ? 'opacity-50 cursor-not-allowed'
                                      : 'hover:bg-accent cursor-pointer'
                                  } ${selectedVideo?.id === video.id ? 'bg-accent' : ''}`}
                                >
                                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                    video.completed ? 'bg-primary/20 text-primary' :
                                    video.locked ? 'bg-muted text-muted-foreground' :
                                    'bg-primary/10 text-primary'
                                  }`}>
                                    {video.locked ? (
                                      <Lock className="h-4 w-4" />
                                    ) : video.completed ? (
                                      <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                      <Play className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div className="flex-1 text-left">
                                    <div className="font-medium text-sm text-foreground">
                                      {index + 1}. {video.title}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                      <Clock className="h-3 w-3" />
                                      <span>{video.duration}</span>
                                      {video.completed && (
                                        <>
                                          <span>•</span>
                                          <span className="text-primary">已完成</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </button>
                                {index < week.videos.length - 1 && (
                                  <Separator className="my-2" />
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          </div>

          {/* Video Player */}
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">影片播放</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedVideo ? (
                    <div className="space-y-4">
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                        <div className="text-center space-y-2">
                          <Play className="h-12 w-12 text-muted-foreground mx-auto" />
                          <p className="text-sm text-muted-foreground">影片播放器</p>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">{selectedVideo.title}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{selectedVideo.duration}</span>
                          {selectedVideo.completed && (
                            <>
                              <span>•</span>
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                              <span className="text-primary">已完成</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button className="w-full">
                        {selectedVideo.completed ? '重新觀看' : '標記為已完成'}
                      </Button>
                    </div>
                  ) : (
                    <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Play className="h-12 w-12 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">請選擇影片開始學習</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
