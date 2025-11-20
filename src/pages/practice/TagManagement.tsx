import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";

interface TagItem {
  id: string;
  name: string;
  color: string;
  category: string;
  usageCount: number;
}

const TagManagement = () => {
  const [tags, setTags] = useState<TagItem[]>([
    { id: "1", name: "文法", color: "#3b82f6", category: "題目類型", usageCount: 120 },
    { id: "2", name: "聽力", color: "#10b981", category: "題目類型", usageCount: 85 },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<TagItem | null>(null);
  const [formData, setFormData] = useState<Partial<TagItem>>({});

  const handleEdit = (tag: TagItem) => {
    setSelectedTag(tag);
    setFormData(tag);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setTags(tags.filter(t => t.id !== id));
    toast.success("標籤已刪除");
  };

  const handleSave = () => {
    if (selectedTag) {
      setTags(tags.map(t => t.id === selectedTag.id ? { ...t, ...formData } : t));
      toast.success("標籤已更新");
    } else {
      const newTag: TagItem = {
        id: String(tags.length + 1),
        name: formData.name || "",
        color: formData.color || "#3b82f6",
        category: formData.category || "",
        usageCount: 0,
      };
      setTags([...tags, newTag]);
      toast.success("標籤已建立");
    }
    setIsDialogOpen(false);
    setSelectedTag(null);
    setFormData({});
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">標籤管理</h1>
          <p className="text-muted-foreground mt-2">管理題目與內容標籤</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectedTag(null); setFormData({}); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增標籤
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedTag ? "編輯標籤" : "新增標籤"}</DialogTitle>
              <DialogDescription>設定標籤資訊</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">標籤名稱</Label>
                <Input
                  id="name"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">分類</Label>
                <Input
                  id="category"
                  value={formData.category || ""}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="例：題目類型、難度等"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">標籤顏色</Label>
                <Input
                  id="color"
                  type="color"
                  value={formData.color || "#3b82f6"}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
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
          <CardTitle>標籤列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>標籤名稱</TableHead>
                <TableHead>分類</TableHead>
                <TableHead>使用次數</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <Badge style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </Badge>
                  </TableCell>
                  <TableCell>{tag.category}</TableCell>
                  <TableCell>{tag.usageCount} 次</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(tag)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(tag.id)}>
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

export default TagManagement;
