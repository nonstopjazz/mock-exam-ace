import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Map } from "lucide-react";
import { toast } from "sonner";

interface Quest {
  id: string;
  title: string;
  description: string;
  requiredScore: number;
  reward: number;
  unlocked: boolean;
}

const QuestMapManagement = () => {
  const [quests, setQuests] = useState<Quest[]>([
    { id: "1", title: "初學者之路", description: "完成10道初級題目", requiredScore: 10, reward: 50, unlocked: true },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [formData, setFormData] = useState<Partial<Quest>>({});

  const handleEdit = (quest: Quest) => {
    setSelectedQuest(quest);
    setFormData(quest);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setQuests(quests.filter(q => q.id !== id));
    toast.success("任務已刪除");
  };

  const handleSave = () => {
    if (selectedQuest) {
      setQuests(quests.map(q => q.id === selectedQuest.id ? { ...q, ...formData } : q));
      toast.success("任務已更新");
    } else {
      const newQuest: Quest = {
        id: String(quests.length + 1),
        title: formData.title || "",
        description: formData.description || "",
        requiredScore: formData.requiredScore || 0,
        reward: formData.reward || 0,
        unlocked: formData.unlocked || false,
      };
      setQuests([...quests, newQuest]);
      toast.success("任務已建立");
    }
    setIsDialogOpen(false);
    setSelectedQuest(null);
    setFormData({});
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">任務地圖管理</h1>
          <p className="text-muted-foreground mt-2">設定任務關卡與獎勵</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectedQuest(null); setFormData({}); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增任務
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedQuest ? "編輯任務" : "新增任務"}</DialogTitle>
              <DialogDescription>設定任務資訊</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">任務名稱</Label>
                <Input
                  id="title"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">任務描述</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="requiredScore">完成條件</Label>
                  <Input
                    id="requiredScore"
                    type="number"
                    value={formData.requiredScore || ""}
                    onChange={(e) => setFormData({ ...formData, requiredScore: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reward">獎勵寶石</Label>
                  <Input
                    id="reward"
                    type="number"
                    value={formData.reward || ""}
                    onChange={(e) => setFormData({ ...formData, reward: parseInt(e.target.value) })}
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {quests.map((quest) => (
          <Card key={quest.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Map className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{quest.title}</CardTitle>
                </div>
                <Badge variant={quest.unlocked ? "default" : "secondary"}>
                  {quest.unlocked ? "已開放" : "未開放"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{quest.description}</p>
              <div className="flex justify-between text-sm">
                <span>完成條件: {quest.requiredScore}</span>
                <span className="text-primary">獎勵: {quest.reward} 💎</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(quest)}>
                  <Edit className="h-4 w-4 mr-2" />
                  編輯
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(quest.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default QuestMapManagement;
