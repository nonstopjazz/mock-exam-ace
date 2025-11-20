import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Video, Lock, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

interface Video {
  id: string;
  title: string;
  duration: string;
  url: string;
}

interface Week {
  id: string;
  weekNumber: number;
  title: string;
  description: string;
  videos: Video[];
}

interface Course {
  id: string;
  title: string;
  description: string;
  type: "standard" | "drip";
  level: "beginner" | "intermediate" | "advanced";
  instructor: string;
  thumbnail: string;
  weeks: Week[];
}

const CourseManagement = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([
    {
      id: "1",
      title: "完整英語文法速成班",
      description: "從零開始學習英文文法，適合初學者",
      type: "standard",
      level: "beginner",
      instructor: "Prof. Johnson",
      thumbnail: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8",
      weeks: [],
    },
    {
      id: "2",
      title: "進階商務英文實戰",
      description: "系統化學習商務英文，解鎖職場溝通技能",
      type: "drip",
      level: "advanced",
      instructor: "Dr. Smith",
      thumbnail: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40",
      weeks: [],
    },
  ]);

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Course>>({});

  const handleEdit = (course: Course) => {
    setSelectedCourse(course);
    setFormData(course);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (selectedCourse && formData) {
      setCourses(courses.map(c => 
        c.id === selectedCourse.id ? { ...c, ...formData } : c
      ));
      toast.success("課程已更新");
      setIsEditing(false);
      setSelectedCourse(null);
    }
  };

  const handleDelete = (courseId: string) => {
    setCourses(courses.filter(c => c.id !== courseId));
    toast.success("課程已刪除");
  };

  const handleCreate = () => {
    const newCourse: Course = {
      id: String(courses.length + 1),
      title: formData.title || "新課程",
      description: formData.description || "",
      type: (formData.type as "standard" | "drip") || "standard",
      level: (formData.level as "beginner" | "intermediate" | "advanced") || "beginner",
      instructor: formData.instructor || "",
      thumbnail: formData.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3",
      weeks: [],
    };
    setCourses([...courses, newCourse]);
    toast.success("課程已建立");
    setIsEditing(false);
    setFormData({});
  };

  const getCourseTypeLabel = (type: string) => {
    return type === "drip" ? "滴漏式課程" : "標準課程";
  };

  const getLevelLabel = (level: string) => {
    const labels = {
      beginner: "初級",
      intermediate: "中級",
      advanced: "高級",
    };
    return labels[level as keyof typeof labels];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">課程管理</h1>
          <p className="text-muted-foreground mt-2">管理和編輯所有課程內容</p>
        </div>
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectedCourse(null); setFormData({}); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增課程
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedCourse ? "編輯課程" : "新增課程"}</DialogTitle>
              <DialogDescription>
                設定課程的基本資訊和呈現方式
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">課程名稱</Label>
                <Input
                  id="title"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="輸入課程名稱"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">課程描述</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="輸入課程描述"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">課程類型</Label>
                  <Select
                    value={formData.type || "standard"}
                    onValueChange={(value) => setFormData({ ...formData, type: value as "standard" | "drip" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇課程類型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          <span>標準課程</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="drip">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          <span>滴漏式課程</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.type === "drip" 
                      ? "必須依序完成每個單元才能解鎖下一單元" 
                      : "所有單元和影片都可以自由觀看"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="level">課程級別</Label>
                  <Select
                    value={formData.level || "beginner"}
                    onValueChange={(value) => setFormData({ ...formData, level: value as "beginner" | "intermediate" | "advanced" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇級別" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">初級</SelectItem>
                      <SelectItem value="intermediate">中級</SelectItem>
                      <SelectItem value="advanced">高級</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructor">講師名稱</Label>
                <Input
                  id="instructor"
                  value={formData.instructor || ""}
                  onChange={(e) => setFormData({ ...formData, instructor: e.target.value })}
                  placeholder="輸入講師名稱"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thumbnail">課程封面圖片 URL</Label>
                <Input
                  id="thumbnail"
                  value={formData.thumbnail || ""}
                  onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                  placeholder="輸入圖片 URL"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                取消
              </Button>
              <Button onClick={selectedCourse ? handleSave : handleCreate}>
                {selectedCourse ? "儲存變更" : "建立課程"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">全部課程</TabsTrigger>
          <TabsTrigger value="standard">標準課程</TabsTrigger>
          <TabsTrigger value="drip">滴漏式課程</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Card key={course.id} className="overflow-hidden">
                <div className="relative h-40 overflow-hidden">
                  <img 
                    src={course.thumbnail} 
                    alt={course.title}
                    className="w-full h-full object-cover"
                  />
                  <Badge className="absolute top-2 right-2">
                    {getCourseTypeLabel(course.type)}
                  </Badge>
                </div>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{course.title}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {course.description}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{getLevelLabel(course.level)}</Badge>
                    <span className="text-sm text-muted-foreground">{course.instructor}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/practice/course-management/${course.id}/edit`)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    編輯
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDelete(course.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="standard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.filter(c => c.type === "standard").map((course) => (
              <Card key={course.id} className="overflow-hidden">
                <div className="relative h-40 overflow-hidden">
                  <img 
                    src={course.thumbnail} 
                    alt={course.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {course.description}
                  </CardDescription>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{getLevelLabel(course.level)}</Badge>
                    <span className="text-sm text-muted-foreground">{course.instructor}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/practice/course-management/${course.id}/edit`)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    編輯
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDelete(course.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="drip" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.filter(c => c.type === "drip").map((course) => (
              <Card key={course.id} className="overflow-hidden">
                <div className="relative h-40 overflow-hidden">
                  <img 
                    src={course.thumbnail} 
                    alt={course.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {course.description}
                  </CardDescription>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{getLevelLabel(course.level)}</Badge>
                    <span className="text-sm text-muted-foreground">{course.instructor}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/practice/course-management/${course.id}/edit`)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    編輯
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDelete(course.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>課程類型說明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-start">
            <div className="p-3 rounded-lg bg-primary/10">
              <Video className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">標準課程</h3>
              <p className="text-sm text-muted-foreground mt-1">
                所有單元和影片都可以自由觀看，學員可以按照自己的節奏學習。適合自主性高的學員。
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                範例：<a href="/course/1" className="text-primary hover:underline">/course/1</a>
              </p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="p-3 rounded-lg bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">滴漏式課程</h3>
              <p className="text-sm text-muted-foreground mt-1">
                必須依序完成每個單元才能解鎖下一單元，確保學員循序漸進學習。適合需要系統化引導的課程。
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                範例：<a href="/drip-course/2" className="text-primary hover:underline">/drip-course/2</a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CourseManagement;
