import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";

interface Achievement {
  id: string;
  title: string;
  description: string;
  requirement: string;
  reward: number;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

const AchievementManagement = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([
    {
      id: "1",
      title: "初次嘗試",
      description: "完成第一次測驗",
      requirement: "完成任意一次測驗",
      reward: 50,
      icon: "🎯",
      rarity: "common",
    },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [formData, setFormData] = useState<Partial<Achievement>>({});

  const handleEdit = (achievement: Achievement) => {
    setSelectedAchievement(achievement);
    setFormData(achievement);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setAchievements(achievements.filter(a => a.id !== id));
    toast.success("成就已刪除");
  };

  const handleSave = () => {
    if (selectedAchievement) {
      setAchievements(achievements.map(a => a.id === selectedAchievement.id ? { ...a, ...formData } : a));
      toast.success("成就已更新");
    } else {
      const newAchievement: Achievement = {
        id: String(achievements.length + 1),
        title: formData.title || "",
        description: formData.description || "",
        requirement: formData.requirement || "",
        reward: formData.reward || 0,
        icon: formData.icon || "🏆",
        rarity: formData.rarity || "common",
      };
      setAchievements([...achievements, newAchievement]);
      toast.success("成就已建立");
    }
    setIsDialogOpen(false);
    setSelectedAchievement(null);
    setFormData({});
  };

  const getRarityColor = (rarity: string) => {
    const colors = {
      common: "bg-gray-500",
      rare: "bg-blue-500",
      epic: "bg-purple-500",
      legendary: "bg-orange-500",
    };
    return colors[rarity as keyof typeof colors];
  };

  const getRarityLabel = (rarity: string) => {
    const labels = {
      common: "普通",
      rare: "稀有",
      epic: "史詩",
      legendary: "傳說",
    };
    return labels[rarity as keyof typeof labels];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">成就管理</h1>
          <p className="text-muted-foreground mt-2">設定成就條件與獎勵</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectedAchievement(null); setFormData({}); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增成就
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedAchievement ? "編輯成就" : "新增成就"}</DialogTitle>
              <DialogDescription>設定成就資訊</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">成就名稱</Label>
                <Input
                  id="title"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">成就描述</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requirement">完成條件</Label>
                <Input
                  id="requirement"
                  value={formData.requirement || ""}
                  onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reward">獎勵寶石</Label>
                  <Input
                    id="reward"
                    type="number"
                    value={formData.reward || ""}
                    onChange={(e) => setFormData({ ...formData, reward: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icon">圖示</Label>
                  <Input
                    id="icon"
                    value={formData.icon || ""}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="輸入 emoji"
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
        {achievements.map((achievement) => (
          <Card key={achievement.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{achievement.icon}</span>
                  <CardTitle className="text-lg">{achievement.title}</CardTitle>
                </div>
                <Badge className={getRarityColor(achievement.rarity)}>
                  {getRarityLabel(achievement.rarity)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{achievement.description}</p>
              <div className="text-sm">
                <span className="font-medium">條件：</span>
                <span className="text-muted-foreground">{achievement.requirement}</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">獎勵：</span>
                <span className="text-primary">{achievement.reward} 💎</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(achievement)}>
                  <Edit className="h-4 w-4 mr-2" />
                  編輯
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(achievement.id)}>
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

export default AchievementManagement;
