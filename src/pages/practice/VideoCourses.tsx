import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play, Search, Filter, Clock, CheckCircle, BookOpen, Award, TrendingUp } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  level: "beginner" | "intermediate" | "advanced";
  category: string;
  progress: number;
  lessons: number;
  completedLessons: number;
  instructor: string;
  type?: "standard" | "drip"; // drip = 需要依序完成單元
}

const mockCourses: Course[] = [
  {
    id: "1",
    title: "英文基礎發音課程",
    description: "從零開始學習正確的英文發音，包含母音、子音、重音與語調",
    thumbnail: "/placeholder.svg",
    duration: "4小時30分",
    level: "beginner",
    category: "發音",
    progress: 65,
    lessons: 12,
    completedLessons: 8,
    instructor: "Emma Chen"
  },
  {
    id: "2",
    title: "商業英文簡報技巧",
    description: "掌握專業簡報用語、投影片設計與問答技巧",
    thumbnail: "/placeholder.svg",
    duration: "3小時15分",
    level: "intermediate",
    category: "商業英文",
    progress: 30,
    lessons: 10,
    completedLessons: 3,
    instructor: "David Wang",
    type: "drip"
  },
  {
    id: "3",
    title: "IELTS 口說衝刺班",
    description: "針對 IELTS 口說考試的完整準備策略與模擬練習",
    thumbnail: "/placeholder.svg",
    duration: "6小時",
    level: "advanced",
    category: "考試準備",
    progress: 0,
    lessons: 15,
    completedLessons: 0,
    instructor: "Sarah Lin"
  },
  {
    id: "4",
    title: "日常生活會話實戰",
    description: "透過情境對話學習實用的日常英文表達",
    thumbnail: "/placeholder.svg",
    duration: "5小時20分",
    level: "intermediate",
    category: "會話",
    progress: 100,
    lessons: 20,
    completedLessons: 20,
    instructor: "Michael Lee"
  },
  {
    id: "5",
    title: "英文文法完全攻略",
    description: "系統化學習英文文法規則，搭配大量例句與練習",
    thumbnail: "/placeholder.svg",
    duration: "8小時45分",
    level: "beginner",
    category: "文法",
    progress: 45,
    lessons: 25,
    completedLessons: 11,
    instructor: "Jennifer Wu"
  },
  {
    id: "6",
    title: "新聞英文聽力訓練",
    description: "透過真實新聞報導提升英文聽力與時事詞彙",
    thumbnail: "/placeholder.svg",
    duration: "4小時",
    level: "advanced",
    category: "聽力",
    progress: 20,
    lessons: 16,
    completedLessons: 3,
    instructor: "Kevin Zhang"
  }
];

const levelColors = {
  beginner: "bg-success/10 text-success border-success/20",
  intermediate: "bg-warning/10 text-warning border-warning/20",
  advanced: "bg-destructive/10 text-destructive border-destructive/20"
};

const levelLabels = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "高級"
};

export default function VideoCourses() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const categories = ["all", "發音", "商業英文", "考試準備", "會話", "文法", "聽力"];
  
  const filteredCourses = mockCourses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         course.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || course.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const stats = {
    totalCourses: mockCourses.length,
    inProgress: mockCourses.filter(c => c.progress > 0 && c.progress < 100).length,
    completed: mockCourses.filter(c => c.progress === 100).length,
    totalHours: mockCourses.reduce((sum, c) => {
      const [hours, mins] = c.duration.match(/\d+/g) || ["0", "0"];
      return sum + parseInt(hours) + parseInt(mins) / 60;
    }, 0)
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-accent">
              <Play className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">影片課程</h1>
              <p className="text-muted-foreground">探索精選的英文學習課程</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalCourses}</p>
                    <p className="text-sm text-muted-foreground">總課程數</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <TrendingUp className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
                    <p className="text-sm text-muted-foreground">進行中</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <CheckCircle className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
                    <p className="text-sm text-muted-foreground">已完成</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-info/10">
                    <Clock className="h-5 w-5 text-info" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{Math.round(stats.totalHours)}h</p>
                    <p className="text-sm text-muted-foreground">總時長</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Search and Filter */}
        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋課程名稱或描述..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background border-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                      className="text-sm"
                    >
                      {category === "all" ? "全部" : category}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Course Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="bg-muted">
            <TabsTrigger value="all">全部課程</TabsTrigger>
            <TabsTrigger value="in-progress">進行中</TabsTrigger>
            <TabsTrigger value="completed">已完成</TabsTrigger>
            <TabsTrigger value="new">尚未開始</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => (
                <Card 
                  key={course.id} 
                  className="group hover:shadow-lg transition-all border-border overflow-hidden cursor-pointer"
                  onClick={() => navigate(course.type === "drip" ? `/drip-course/${course.id}` : `/course/${course.id}`)}
                >
                  <div className="relative">
                    <AspectRatio ratio={16/9} className="bg-muted">
                      <img
                        src={course.thumbnail}
                        alt={course.title}
                        className="object-cover w-full h-full"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <Button
                        size="icon"
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full h-14 w-14 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="h-6 w-6" />
                      </Button>
                      <div className="absolute top-3 right-3 flex gap-2">
                        <Badge className={levelColors[course.level]}>
                          {levelLabels[course.level]}
                        </Badge>
                      </div>
                      <div className="absolute bottom-3 left-3 flex items-center gap-2 text-white text-sm">
                        <Clock className="h-4 w-4" />
                        <span>{course.duration}</span>
                      </div>
                    </AspectRatio>
                  </div>
                  
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-2 text-foreground">
                        {course.title}
                      </CardTitle>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {course.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{course.instructor}</span>
                      <span>{course.completedLessons}/{course.lessons} 課</span>
                    </div>

                    {course.progress > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">進度</span>
                          <span className="font-medium text-foreground">{course.progress}%</span>
                        </div>
                        <Progress value={course.progress} className="h-2" />
                      </div>
                    )}

                    <Button 
                      className="w-full" 
                      variant={course.progress === 100 ? "outline" : "default"}
                      onClick={() => setSelectedCourse(course)}
                    >
                      {course.progress === 0 ? "開始學習" : course.progress === 100 ? "重新觀看" : "繼續學習"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="in-progress" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.filter(c => c.progress > 0 && c.progress < 100).map((course) => (
                <Card key={course.id} className="group hover:shadow-lg transition-all border-border overflow-hidden">
                  <div className="relative">
                    <AspectRatio ratio={16/9} className="bg-muted">
                      <img src={course.thumbnail} alt={course.title} className="object-cover w-full h-full" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <Button
                        size="icon"
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full h-14 w-14 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setSelectedCourse(course)}
                      >
                        <Play className="h-6 w-6" />
                      </Button>
                    </AspectRatio>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg line-clamp-2 text-foreground">{course.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">進度</span>
                        <span className="font-medium text-foreground">{course.progress}%</span>
                      </div>
                      <Progress value={course.progress} className="h-2" />
                    </div>
                    <Button className="w-full" onClick={() => setSelectedCourse(course)}>繼續學習</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.filter(c => c.progress === 100).map((course) => (
                <Card key={course.id} className="border-border overflow-hidden">
                  <div className="relative">
                    <AspectRatio ratio={16/9} className="bg-muted">
                      <img src={course.thumbnail} alt={course.title} className="object-cover w-full h-full" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute top-3 right-3">
                        <div className="p-2 rounded-full bg-success">
                          <Award className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    </AspectRatio>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg line-clamp-2 text-foreground">{course.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" variant="outline" onClick={() => setSelectedCourse(course)}>
                      重新觀看
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="new" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.filter(c => c.progress === 0).map((course) => (
                <Card key={course.id} className="group hover:shadow-lg transition-all border-border overflow-hidden">
                  <div className="relative">
                    <AspectRatio ratio={16/9} className="bg-muted">
                      <img src={course.thumbnail} alt={course.title} className="object-cover w-full h-full" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <Button
                        size="icon"
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full h-14 w-14 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setSelectedCourse(course)}
                      >
                        <Play className="h-6 w-6" />
                      </Button>
                      <Badge className={`${levelColors[course.level]} absolute top-3 right-3`}>
                        {levelLabels[course.level]}
                      </Badge>
                    </AspectRatio>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg line-clamp-2 text-foreground">{course.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" onClick={() => setSelectedCourse(course)}>開始學習</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Course Detail Dialog */}
      <Dialog open={!!selectedCourse} onOpenChange={() => setSelectedCourse(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">{selectedCourse?.title}</DialogTitle>
            <DialogDescription>{selectedCourse?.description}</DialogDescription>
          </DialogHeader>
          
          {selectedCourse && (
            <div className="space-y-6">
              <AspectRatio ratio={16/9} className="bg-black rounded-lg overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Play className="h-16 w-16 mx-auto mb-4" />
                    <p>影片播放器</p>
                  </div>
                </div>
              </AspectRatio>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">講師</p>
                  <p className="font-medium text-foreground">{selectedCourse.instructor}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">時長</p>
                  <p className="font-medium text-foreground">{selectedCourse.duration}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">難度</p>
                  <Badge className={levelColors[selectedCourse.level]}>
                    {levelLabels[selectedCourse.level]}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">課程數</p>
                  <p className="font-medium text-foreground">{selectedCourse.lessons} 課</p>
                </div>
              </div>

              {selectedCourse.progress > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">學習進度</span>
                    <span className="text-sm font-medium text-foreground">{selectedCourse.progress}%</span>
                  </div>
                  <Progress value={selectedCourse.progress} className="h-2" />
                </div>
              )}

              <div className="flex gap-3">
                <Button className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  {selectedCourse.progress === 0 ? "開始學習" : "繼續學習"}
                </Button>
                <Button variant="outline">
                  加入收藏
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
