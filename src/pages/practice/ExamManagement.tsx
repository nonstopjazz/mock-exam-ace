import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

interface Exam {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  duration: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  createdAt: string;
}

const ExamManagement = () => {
  const [exams, setExams] = useState<Exam[]>([
    {
      id: "1",
      title: "多益模擬測驗 - 初級",
      description: "TOEIC 初級程度測驗，適合新手練習",
      questionCount: 100,
      duration: 120,
      difficulty: "beginner",
      createdAt: "2024-01-15",
    },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [formData, setFormData] = useState<Partial<Exam>>({});

  const handleEdit = (exam: Exam) => {
    setSelectedExam(exam);
    setFormData(exam);
    setIsDialogOpen(true);
  };

  const handleDelete = (examId: string) => {
    setExams(exams.filter(e => e.id !== examId));
    toast.success("考試已刪除");
  };

  const handleSave = () => {
    if (selectedExam) {
      setExams(exams.map(e => e.id === selectedExam.id ? { ...e, ...formData } : e));
      toast.success("考試已更新");
    } else {
      const newExam: Exam = {
        id: String(exams.length + 1),
        title: formData.title || "",
        description: formData.description || "",
        questionCount: formData.questionCount || 0,
        duration: formData.duration || 0,
        difficulty: formData.difficulty || "beginner",
        createdAt: new Date().toISOString().split('T')[0],
      };
      setExams([...exams, newExam]);
      toast.success("考試已建立");
    }
    setIsDialogOpen(false);
    setSelectedExam(null);
    setFormData({});
  };

  const getDifficultyLabel = (difficulty: string) => {
    const labels = { beginner: "初級", intermediate: "中級", advanced: "高級" };
    return labels[difficulty as keyof typeof labels];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">模擬考試管理</h1>
          <p className="text-muted-foreground mt-2">上傳與編輯模擬考試題目</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectedExam(null); setFormData({}); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增考試
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedExam ? "編輯考試" : "新增考試"}</DialogTitle>
              <DialogDescription>設定考試的基本資訊</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">考試名稱</Label>
                <Input
                  id="title"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">考試描述</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="questionCount">題目數量</Label>
                  <Input
                    id="questionCount"
                    type="number"
                    value={formData.questionCount || ""}
                    onChange={(e) => setFormData({ ...formData, questionCount: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">時間限制（分鐘）</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration || ""}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
              <Button onClick={handleSave}>儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>考試列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>考試名稱</TableHead>
                <TableHead>題數</TableHead>
                <TableHead>時間</TableHead>
                <TableHead>難度</TableHead>
                <TableHead>建立日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => (
                <TableRow key={exam.id}>
                  <TableCell className="font-medium">{exam.title}</TableCell>
                  <TableCell>{exam.questionCount} 題</TableCell>
                  <TableCell>{exam.duration} 分鐘</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getDifficultyLabel(exam.difficulty)}</Badge>
                  </TableCell>
                  <TableCell>{exam.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(exam)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(exam.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExamManagement;
