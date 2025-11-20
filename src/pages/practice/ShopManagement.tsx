import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
}

const ShopManagement = () => {
  const [items, setItems] = useState<ShopItem[]>([
    { id: "1", name: "時間延長卡", description: "延長測驗時間10分鐘", price: 100, icon: "⏰" },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [formData, setFormData] = useState<Partial<ShopItem>>({});

  const handleEdit = (item: ShopItem) => {
    setSelectedItem(item);
    setFormData(item);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setItems(items.filter(i => i.id !== id));
    toast.success("道具已刪除");
  };

  const handleSave = () => {
    if (selectedItem) {
      setItems(items.map(i => i.id === selectedItem.id ? { ...i, ...formData } : i));
      toast.success("道具已更新");
    } else {
      const newItem: ShopItem = {
        id: String(items.length + 1),
        name: formData.name || "",
        description: formData.description || "",
        price: formData.price || 0,
        icon: formData.icon || "🎁",
      };
      setItems([...items, newItem]);
      toast.success("道具已建立");
    }
    setIsDialogOpen(false);
    setSelectedItem(null);
    setFormData({});
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">寶石商店管理</h1>
          <p className="text-muted-foreground mt-2">管理商店道具與價格</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectedItem(null); setFormData({}); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增道具
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedItem ? "編輯道具" : "新增道具"}</DialogTitle>
              <DialogDescription>設定道具資訊</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">道具名稱</Label>
                <Input
                  id="name"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">道具描述</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">價格（寶石）</Label>
                  <Input
                    id="price"
                    type="number"
                    value={formData.price || ""}
                    onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) })}
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
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{item.icon}</span>
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                </div>
                <span className="text-primary font-bold">{item.price} 💎</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(item)}>
                  <Edit className="h-4 w-4 mr-2" />
                  編輯
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
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

export default ShopManagement;
