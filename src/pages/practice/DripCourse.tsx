import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Play, CheckCircle2, Lock, Clock, BookOpen, Award } from "lucide-react";

interface Video {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  description: string;
}

interface Unit {
  id: string;
  unitNumber: number;
  title: string;
  description: string;
  videos: Video[];
  locked: boolean;
  completed: boolean;
}

// 模擬課程數據
const dripCourseData = {
  "2": {
    id: "2",
    title: "商業英文簡報技巧",
    description: "循序漸進掌握專業簡報用語、投影片設計與問答技巧，每完成一個單元才能解鎖下一個。",
    level: "中級",
    instructor: "David Wang",
    totalUnits: 6,
    currentUnit: 2,
    units: [
      {
        id: "u1",
        unitNumber: 1,
        title: "簡報基礎與開場白",
        description: "學習如何有效開場、自我介紹、說明簡報目的與大綱。",
        locked: false,
        completed: true,
        videos: [
          { 
            id: "v1", 
            title: "有效的開場技巧", 
            duration: "18:30", 
            completed: true,
            description: "學習如何用引人入勝的方式開始簡報，包含問題式開場、故事式開場和統計數據開場。"
          },
          { 
            id: "v2", 
            title: "專業的自我介紹", 
            duration: "15:45", 
            completed: true,
            description: "如何在簡報中適當地介紹自己和團隊，建立可信度。"
          },
          { 
            id: "v3", 
            title: "說明簡報大綱", 
            duration: "12:20", 
            completed: true,
            description: "清楚告訴聽眾簡報的結構和主要內容，讓他們有心理準備。"
          }
        ]
      },
      {
        id: "u2",
        unitNumber: 2,
        title: "主體內容呈現技巧",
        description: "掌握如何清晰有邏輯地呈現主要內容，使用轉折語和強調重點。",
        locked: false,
        completed: false,
        videos: [
          { 
            id: "v4", 
            title: "邏輯架構與轉折語", 
            duration: "22:15", 
            completed: true,
            description: "學習使用 firstly, secondly, furthermore 等轉折詞連接內容。"
          },
          { 
            id: "v5", 
            title: "數據呈現與圖表說明", 
            duration: "25:40", 
            completed: true,
            description: "如何有效地解釋圖表、趨勢和統計數據。"
          },
          { 
            id: "v6", 
            title: "強調重點的技巧", 
            duration: "16:50", 
            completed: false,
            description: "使用語調、重複和視覺輔助來強調關鍵訊息。"
          }
        ]
      },
      {
        id: "u3",
        unitNumber: 3,
        title: "視覺輔助與投影片設計",
        description: "學習設計清晰有效的投影片，適當使用圖片、圖表和動畫。",
        locked: true,
        completed: false,
        videos: [
          { 
            id: "v7", 
            title: "投影片設計原則", 
            duration: "20:30", 
            completed: false,
            description: "簡潔、一致、對比等設計基本原則。"
          },
          { 
            id: "v8", 
            title: "顏色與字體選擇", 
            duration: "18:25", 
            completed: false,
            description: "如何選擇適合商業簡報的配色和字型。"
          },
          { 
            id: "v9", 
            title: "有效使用圖表", 
            duration: "23:10", 
            completed: false,
            description: "什麼時候用什麼圖表，如何讓數據視覺化更清楚。"
          }
        ]
      },
      {
        id: "u4",
        unitNumber: 4,
        title: "互動與問答處理",
        description: "學習如何與聽眾互動、處理提問和應對困難問題。",
        locked: true,
        completed: false,
        videos: [
          { 
            id: "v10", 
            title: "鼓勵聽眾參與", 
            duration: "17:40", 
            completed: false,
            description: "使用問題、投票和討論增加互動。"
          },
          { 
            id: "v11", 
            title: "回答問題的技巧", 
            duration: "21:15", 
            completed: false,
            description: "如何專業地回答各種問題，包含你不知道答案的情況。"
          },
          { 
            id: "v12", 
            title: "處理困難聽眾", 
            duration: "19:30", 
            completed: false,
            description: "應對挑戰性問題和敵對態度的策略。"
          }
        ]
      },
      {
        id: "u5",
        unitNumber: 5,
        title: "肢體語言與聲音運用",
        description: "提升簡報表現力，掌握肢體語言、眼神接觸和聲音變化。",
        locked: true,
        completed: false,
        videos: [
          { 
            id: "v13", 
            title: "有效的肢體語言", 
            duration: "20:20", 
            completed: false,
            description: "姿勢、手勢和移動如何影響簡報效果。"
          },
          { 
            id: "v14", 
            title: "眼神接觸技巧", 
            duration: "14:50", 
            completed: false,
            description: "如何在不同規模的聽眾前保持適當的眼神接觸。"
          },
          { 
            id: "v15", 
            title: "聲音的力量", 
            duration: "18:35", 
            completed: false,
            description: "語調、語速、音量和停頓的運用。"
          }
        ]
      },
      {
        id: "u6",
        unitNumber: 6,
        title: "結尾與總結",
        description: "學習如何強而有力地結束簡報，留下深刻印象。",
        locked: true,
        completed: false,
        videos: [
          { 
            id: "v16", 
            title: "有力的結尾技巧", 
            duration: "16:45", 
            completed: false,
            description: "總結重點、呼籲行動和留下難忘印象的方法。"
          },
          { 
            id: "v17", 
            title: "Q&A 時段管理", 
            duration: "19:20", 
            completed: false,
            description: "如何有效管理問答環節，控制時間和結束簡報。"
          },
          { 
            id: "v18", 
            title: "後續追蹤", 
            duration: "15:10", 
            completed: false,
            description: "簡報後的跟進、發送資料和維持連結。"
          }
        ]
      }
    ] as Unit[]
  }
};

const DripCourse = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const course = dripCourseData[courseId as keyof typeof dripCourseData];

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

  const [currentUnitIndex, setCurrentUnitIndex] = useState(course.currentUnit - 1);
  const currentUnit = course.units[currentUnitIndex];
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const completedVideos = currentUnit.videos.filter(v => v.completed).length;
  const totalVideos = currentUnit.videos.length;
  const unitProgress = (completedVideos / totalVideos) * 100;
  const isUnitCompleted = completedVideos === totalVideos;

  const canGoNext = currentUnitIndex < course.units.length - 1 && isUnitCompleted;
  const canGoPrev = currentUnitIndex > 0;

  const handleNext = () => {
    if (canGoNext) {
      setCurrentUnitIndex(currentUnitIndex + 1);
      setSelectedVideo(null);
    }
  };

  const handlePrev = () => {
    if (canGoPrev) {
      setCurrentUnitIndex(currentUnitIndex - 1);
      setSelectedVideo(null);
    }
  };

  const overallProgress = ((course.units.filter(u => u.completed).length + (isUnitCompleted && !currentUnit.completed ? 1 : 0)) / course.totalUnits) * 100;

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

          <div className="flex flex-col lg:flex-row gap-6 items-start">
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
                  <span className="text-foreground">單元 {currentUnitIndex + 1}/{course.totalUnits}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" />
                  <span className="text-foreground">{totalVideos} 支影片</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-foreground">已完成 {completedVideos}/{totalVideos}</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">整體課程進度</span>
                  <span className="text-sm font-semibold text-foreground">
                    {overallProgress.toFixed(0)}%
                  </span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>
            </div>

            {/* Unit Navigation Pills */}
            <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
              {course.units.map((unit, index) => (
                <button
                  key={unit.id}
                  onClick={() => !unit.locked && setCurrentUnitIndex(index)}
                  disabled={unit.locked}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all whitespace-nowrap ${
                    index === currentUnitIndex
                      ? 'bg-primary text-primary-foreground border-primary'
                      : unit.completed
                      ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                      : unit.locked
                      ? 'bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50'
                      : 'bg-background text-foreground border-border hover:bg-accent'
                  }`}
                >
                  {unit.completed ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  ) : unit.locked ? (
                    <Lock className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {unit.unitNumber}
                    </div>
                  )}
                  <span className="text-sm font-medium">單元 {unit.unitNumber}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Current Unit Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Unit Header */}
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-primary border-primary">
                        單元 {currentUnit.unitNumber}
                      </Badge>
                      {currentUnit.completed && (
                        <Badge className="bg-primary/10 text-primary border-primary/20">
                          已完成
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-2xl mb-2">{currentUnit.title}</CardTitle>
                    <CardDescription className="text-base">{currentUnit.description}</CardDescription>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">本單元進度</span>
                    <span className="text-sm font-semibold text-foreground">
                      {unitProgress.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={unitProgress} className="h-2" />
                </div>
              </CardHeader>
            </Card>

            {/* Video List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">課程影片</CardTitle>
                <CardDescription>依序觀看以下影片完成本單元</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentUnit.videos.map((video, index) => (
                  <button
                    key={video.id}
                    onClick={() => setSelectedVideo(video)}
                    className={`w-full flex items-start gap-4 p-4 rounded-lg border transition-all text-left ${
                      selectedVideo?.id === video.id
                        ? 'bg-primary/5 border-primary'
                        : 'bg-background border-border hover:bg-accent'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                      video.completed
                        ? 'bg-primary/20 text-primary'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {video.completed ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-semibold text-foreground">{video.title}</h4>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-shrink-0">
                          <Clock className="h-3 w-3" />
                          <span>{video.duration}</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{video.description}</p>
                      {video.completed && (
                        <Badge variant="outline" className="mt-2 text-primary border-primary/20">
                          已完成
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={handlePrev}
                disabled={!canGoPrev}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                上一單元
              </Button>

              {isUnitCompleted ? (
                canGoNext ? (
                  <Button onClick={handleNext} className="gap-2">
                    下一單元
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button disabled className="gap-2">
                    <Award className="h-4 w-4" />
                    課程完成
                  </Button>
                )
              ) : (
                <Button disabled variant="outline" className="gap-2">
                  完成本單元以解鎖
                  <Lock className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                        <p className="text-sm text-muted-foreground mb-3">{selectedVideo.description}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
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

              {/* Unit Lock Info */}
              {currentUnitIndex < course.units.length - 1 && !isUnitCompleted && (
                <Card className="mt-4 border-warning/20 bg-warning/5">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground mb-1">
                          完成本單元以解鎖下一單元
                        </p>
                        <p className="text-xs text-muted-foreground">
                          還需完成 {totalVideos - completedVideos} 支影片
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DripCourse;
