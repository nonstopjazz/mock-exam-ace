import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Save, ArrowLeft, Trash2, GripVertical, Video as VideoIcon, Lock, Edit2 } from "lucide-react";
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

const CourseEdit = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();

  // Mock data - 實際應該從資料庫讀取
  const [course, setCourse] = useState<Course>({
    id: courseId || "1",
    title: "完整英語文法速成班",
    description: "從零開始學習英文文法，適合初學者",
    type: "standard",
    level: "beginner",
    instructor: "Prof. Johnson",
    thumbnail: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8",
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        title: "基礎文法入門",
        description: "了解英文文法的基本概念",
        videos: [
          { id: "v1", title: "什麼是文法？", duration: "15:30", url: "" },
          { id: "v2", title: "句子的基本結構", duration: "20:45", url: "" },
        ],
      },
      {
        id: "w2",
        weekNumber: 2,
        title: "動詞時態",
        description: "掌握各種動詞時態的用法",
        videos: [
          { id: "v3", title: "現在式", duration: "18:20", url: "" },
          { id: "v4", title: "過去式", duration: "22:10", url: "" },
        ],
      },
    ],
  });

  const [editingWeek, setEditingWeek] = useState<Week | null>(null);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [isWeekDialogOpen, setIsWeekDialogOpen] = useState(false);
  const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
  const [currentWeekId, setCurrentWeekId] = useState<string>("");

  const handleSaveCourse = () => {
    // 這裡應該保存到資料庫
    toast.success("課程已保存");
    navigate("/course-management");
  };

  const handleAddWeek = () => {
    const newWeek: Week = {
      id: `w${Date.now()}`,
      weekNumber: course.weeks.length + 1,
      title: editingWeek?.title || "新單元",
      description: editingWeek?.description || "",
      videos: [],
    };
    setCourse({ ...course, weeks: [...course.weeks, newWeek] });
    setEditingWeek(null);
    setIsWeekDialogOpen(false);
    toast.success("單元已新增");
  };

  const handleUpdateWeek = () => {
    if (!editingWeek) return;
    
    setCourse({
      ...course,
      weeks: course.weeks.map((w) => (w.id === editingWeek.id ? editingWeek : w)),
    });
    setEditingWeek(null);
    setIsWeekDialogOpen(false);
    toast.success("單元已更新");
  };

  const handleDeleteWeek = (weekId: string) => {
    setCourse({
      ...course,
      weeks: course.weeks.filter((w) => w.id !== weekId),
    });
    toast.success("單元已刪除");
  };

  const handleAddVideo = () => {
    if (!editingVideo || !currentWeekId) return;

    const newVideo: Video = {
      id: `v${Date.now()}`,
      title: editingVideo.title || "新影片",
      duration: editingVideo.duration || "00:00",
      url: editingVideo.url || "",
    };

    setCourse({
      ...course,
      weeks: course.weeks.map((w) =>
        w.id === currentWeekId ? { ...w, videos: [...w.videos, newVideo] } : w
      ),
    });
    setEditingVideo(null);
    setIsVideoDialogOpen(false);
    toast.success("影片已新增");
  };

  const handleUpdateVideo = () => {
    if (!editingVideo || !currentWeekId) return;

    setCourse({
      ...course,
      weeks: course.weeks.map((w) =>
        w.id === currentWeekId
          ? {
              ...w,
              videos: w.videos.map((v) => (v.id === editingVideo.id ? editingVideo : v)),
            }
          : w
      ),
    });
    setEditingVideo(null);
    setIsVideoDialogOpen(false);
    toast.success("影片已更新");
  };

  const handleDeleteVideo = (weekId: string, videoId: string) => {
    setCourse({
      ...course,
      weeks: course.weeks.map((w) =>
        w.id === weekId ? { ...w, videos: w.videos.filter((v) => v.id !== videoId) } : w
      ),
    });
    toast.success("影片已刪除");
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/course-management")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">編輯課程</h1>
            <p className="text-muted-foreground mt-1">設定課程內容和結構</p>
          </div>
        </div>
        <Button onClick={handleSaveCourse}>
          <Save className="h-4 w-4 mr-2" />
          保存課程
        </Button>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>基本資訊</CardTitle>
          <CardDescription>設定課程的基本資訊</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">課程名稱</Label>
              <Input
                id="title"
                value={course.title}
                onChange={(e) => setCourse({ ...course, title: e.target.value })}
                placeholder="輸入課程名稱"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructor">講師名稱</Label>
              <Input
                id="instructor"
                value={course.instructor}
                onChange={(e) => setCourse({ ...course, instructor: e.target.value })}
                placeholder="輸入講師名稱"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">課程描述</Label>
            <Textarea
              id="description"
              value={course.description}
              onChange={(e) => setCourse({ ...course, description: e.target.value })}
              placeholder="輸入課程描述"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">課程類型</Label>
              <Select
                value={course.type}
                onValueChange={(value) => setCourse({ ...course, type: value as "standard" | "drip" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">
                    <div className="flex items-center gap-2">
                      <VideoIcon className="h-4 w-4" />
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">課程級別</Label>
              <Select
                value={course.level}
                onValueChange={(value) =>
                  setCourse({ ...course, level: value as "beginner" | "intermediate" | "advanced" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">初級</SelectItem>
                  <SelectItem value="intermediate">中級</SelectItem>
                  <SelectItem value="advanced">高級</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="thumbnail">封面圖片 URL</Label>
              <Input
                id="thumbnail"
                value={course.thumbnail}
                onChange={(e) => setCourse({ ...course, thumbnail: e.target.value })}
                placeholder="圖片 URL"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Course Structure */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>課程結構</CardTitle>
              <CardDescription>管理課程的單元和影片內容</CardDescription>
            </div>
            <Dialog open={isWeekDialogOpen} onOpenChange={setIsWeekDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingWeek({
                      id: "",
                      weekNumber: course.weeks.length + 1,
                      title: "",
                      description: "",
                      videos: [],
                    });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  新增單元
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingWeek?.id ? "編輯單元" : "新增單元"}</DialogTitle>
                  <DialogDescription>設定單元的基本資訊</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>單元編號</Label>
                    <Input
                      type="number"
                      value={editingWeek?.weekNumber || 1}
                      onChange={(e) =>
                        setEditingWeek(
                          editingWeek
                            ? { ...editingWeek, weekNumber: parseInt(e.target.value) }
                            : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>單元標題</Label>
                    <Input
                      value={editingWeek?.title || ""}
                      onChange={(e) =>
                        setEditingWeek(editingWeek ? { ...editingWeek, title: e.target.value } : null)
                      }
                      placeholder="輸入單元標題"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>單元描述</Label>
                    <Textarea
                      value={editingWeek?.description || ""}
                      onChange={(e) =>
                        setEditingWeek(
                          editingWeek ? { ...editingWeek, description: e.target.value } : null
                        )
                      }
                      placeholder="輸入單元描述"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsWeekDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={editingWeek?.id ? handleUpdateWeek : handleAddWeek}>
                    {editingWeek?.id ? "更新" : "新增"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {course.weeks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>尚未新增任何單元</p>
              <p className="text-sm mt-2">點擊「新增單元」按鈕開始建立課程內容</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {course.weeks.map((week) => (
                <AccordionItem key={week.id} value={week.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-4 flex-1">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                      <Badge variant="outline">第 {week.weekNumber} 週</Badge>
                      <div className="text-left flex-1">
                        <p className="font-semibold">{week.title}</p>
                        <p className="text-sm text-muted-foreground">{week.videos.length} 支影片</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{week.description}</p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingWeek(week);
                              setIsWeekDialogOpen(true);
                            }}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            編輯單元
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteWeek(week.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Videos List */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>影片列表</Label>
                          <Dialog open={isVideoDialogOpen} onOpenChange={setIsVideoDialogOpen}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCurrentWeekId(week.id);
                                  setEditingVideo({ id: "", title: "", duration: "", url: "" });
                                }}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                新增影片
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>{editingVideo?.id ? "編輯影片" : "新增影片"}</DialogTitle>
                                <DialogDescription>設定影片資訊</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label>影片標題</Label>
                                  <Input
                                    value={editingVideo?.title || ""}
                                    onChange={(e) =>
                                      setEditingVideo(
                                        editingVideo ? { ...editingVideo, title: e.target.value } : null
                                      )
                                    }
                                    placeholder="輸入影片標題"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>影片時長</Label>
                                  <Input
                                    value={editingVideo?.duration || ""}
                                    onChange={(e) =>
                                      setEditingVideo(
                                        editingVideo ? { ...editingVideo, duration: e.target.value } : null
                                      )
                                    }
                                    placeholder="例如: 15:30"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>影片 URL</Label>
                                  <Input
                                    value={editingVideo?.url || ""}
                                    onChange={(e) =>
                                      setEditingVideo(
                                        editingVideo ? { ...editingVideo, url: e.target.value } : null
                                      )
                                    }
                                    placeholder="輸入影片連結"
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsVideoDialogOpen(false)}>
                                  取消
                                </Button>
                                <Button onClick={editingVideo?.id ? handleUpdateVideo : handleAddVideo}>
                                  {editingVideo?.id ? "更新" : "新增"}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {week.videos.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            尚未新增影片
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {week.videos.map((video, index) => (
                              <div
                                key={video.id}
                                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <VideoIcon className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1">
                                  <p className="font-medium text-sm">
                                    {index + 1}. {video.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{video.duration}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setCurrentWeekId(week.id);
                                      setEditingVideo(video);
                                      setIsVideoDialogOpen(true);
                                    }}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteVideo(week.id, video.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CourseEdit;
