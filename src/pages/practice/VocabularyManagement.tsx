import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

const VocabularyManagement = () => {
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([
    { id: "1", word: "abandon", translation: "放棄", category: "動詞", difficulty: "intermediate" },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VocabularyItem | null>(null);
  const [formData, setFormData] = useState<Partial<VocabularyItem>>({});

  const handleEdit = (item: VocabularyItem) => {
    setSelectedItem(item);
    setFormData(item);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setVocabulary(vocabulary.filter(v => v.id !== id));
    toast.success("單字已刪除");
  };

  const handleSave = () => {
    if (selectedItem) {
      setVocabulary(vocabulary.map(v => v.id === selectedItem.id ? { ...v, ...formData } : v));
      toast.success("單字已更新");
    } else {
      const newItem: VocabularyItem = {
        id: String(vocabulary.length + 1),
        word: formData.word || "",
        translation: formData.translation || "",
        category: formData.category || "",
        difficulty: formData.difficulty || "beginner",
      };
      setVocabulary([...vocabulary, newItem]);
      toast.success("單字已建立");
    }
    setIsDialogOpen(false);
    setSelectedItem(null);
    setFormData({});
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">單字複習管理</h1>
          <p className="text-muted-foreground mt-2">管理單字複習題目與題庫</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectedItem(null); setFormData({}); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增單字
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedItem ? "編輯單字" : "新增單字"}</DialogTitle>
              <DialogDescription>設定單字資訊</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="word">單字</Label>
                <Input
                  id="word"
                  value={formData.word || ""}
                  onChange={(e) => setFormData({ ...formData, word: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="translation">中文翻譯</Label>
                <Input
                  id="translation"
                  value={formData.translation || ""}
                  onChange={(e) => setFormData({ ...formData, translation: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">分類</Label>
                <Input
                  id="category"
                  value={formData.category || ""}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
          <CardTitle>單字列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>單字</TableHead>
                <TableHead>翻譯</TableHead>
                <TableHead>分類</TableHead>
                <TableHead>難度</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vocabulary.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.word}</TableCell>
                  <TableCell>{item.translation}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.difficulty}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
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

export default VocabularyManagement;
