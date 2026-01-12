import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, List, Key, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Pack {
  id: string;
  title: string;
  description: string | null;
  theme: string | null;
  difficulty: string | null;
  is_public: boolean;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

interface PackFormData {
  title: string;
  description: string;
  theme: string;
  difficulty: string;
  is_public: boolean;
  is_active: boolean;
}

const THEMES = ['環境議題', '社會議題', '商務英語', '科技', '健康醫療', '教育', '其他'];
const DIFFICULTIES = ['初級', '中級', '中高級', '高級'];

const initialFormData: PackFormData = {
  title: '',
  description: '',
  theme: '',
  difficulty: '',
  is_public: false,
  is_active: true,
};

export default function PacksAdmin() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [packToDelete, setPackToDelete] = useState<Pack | null>(null);
  const [formData, setFormData] = useState<PackFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPacks();
  }, []);

  async function fetchPacks() {
    setLoading(true);
    const { data, error } = await supabase
      .from('packs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: '載入失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setPacks(data || []);
    }
    setLoading(false);
  }

  function openCreateDialog() {
    setEditingPack(null);
    setFormData(initialFormData);
    setDialogOpen(true);
  }

  function openEditDialog(pack: Pack) {
    setEditingPack(pack);
    setFormData({
      title: pack.title,
      description: pack.description || '',
      theme: pack.theme || '',
      difficulty: pack.difficulty || '',
      is_public: pack.is_public,
      is_active: pack.is_active,
    });
    setDialogOpen(true);
  }

  function openDeleteDialog(pack: Pack) {
    setPackToDelete(pack);
    setDeleteDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast({
        title: '請輸入標題',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    const packData = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      theme: formData.theme || null,
      difficulty: formData.difficulty || null,
      is_public: formData.is_public,
      is_active: formData.is_active,
    };

    if (editingPack) {
      // Update
      const { error } = await supabase
        .from('packs')
        .update(packData)
        .eq('id', editingPack.id);

      if (error) {
        toast({
          title: '更新失敗',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({ title: '更新成功' });
        setDialogOpen(false);
        fetchPacks();
      }
    } else {
      // Create
      const { error } = await supabase.from('packs').insert(packData);

      if (error) {
        toast({
          title: '建立失敗',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({ title: '建立成功' });
        setDialogOpen(false);
        fetchPacks();
      }
    }

    setSubmitting(false);
  }

  async function handleDelete() {
    if (!packToDelete) return;

    const { error } = await supabase
      .from('packs')
      .delete()
      .eq('id', packToDelete.id);

    if (error) {
      toast({
        title: '刪除失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: '刪除成功' });
      fetchPacks();
    }

    setDeleteDialogOpen(false);
    setPackToDelete(null);
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">單字包管理</h1>
          <p className="text-muted-foreground">管理所有單字包</p>
        </div>
        <Link to="/admin/tokens">
          <Button variant="outline">
            <Key className="h-4 w-4 mr-2" />
            Token 管理
          </Button>
        </Link>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新增單字包
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : packs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          尚無單字包，點擊「新增單字包」建立第一個
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>標題</TableHead>
                <TableHead>主題</TableHead>
                <TableHead>難度</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>建立時間</TableHead>
                <TableHead className="w-[150px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.map((pack) => (
                <TableRow key={pack.id}>
                  <TableCell className="font-medium">{pack.title}</TableCell>
                  <TableCell>{pack.theme || '-'}</TableCell>
                  <TableCell>{pack.difficulty || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {pack.is_active ? (
                        <Badge variant="default">啟用</Badge>
                      ) : (
                        <Badge variant="secondary">停用</Badge>
                      )}
                      {pack.is_public && (
                        <Badge variant="outline">公開</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(pack.created_at).toLocaleDateString('zh-TW')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Link to={`/admin/packs/${pack.id}/items`}>
                        <Button variant="ghost" size="icon" title="管理單字">
                          <List className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="編輯"
                        onClick={() => openEditDialog(pack)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="刪除"
                        onClick={() => openDeleteDialog(pack)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPack ? '編輯單字包' : '新增單字包'}
            </DialogTitle>
            <DialogDescription>
              {editingPack ? '修改單字包資訊' : '建立新的單字包'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">標題 *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="例：全球暖化核心詞彙"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="簡短描述這個單字包的內容"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>主題</Label>
                  <Select
                    value={formData.theme}
                    onValueChange={(value) =>
                      setFormData({ ...formData, theme: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇主題" />
                    </SelectTrigger>
                    <SelectContent>
                      {THEMES.map((theme) => (
                        <SelectItem key={theme} value={theme}>
                          {theme}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>難度</Label>
                  <Select
                    value={formData.difficulty}
                    onValueChange={(value) =>
                      setFormData({ ...formData, difficulty: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇難度" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((diff) => (
                        <SelectItem key={diff} value={diff}>
                          {diff}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>公開</Label>
                  <p className="text-sm text-muted-foreground">
                    公開的單字包不需 Token 即可查看
                  </p>
                </div>
                <Switch
                  checked={formData.is_public}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_public: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>啟用</Label>
                  <p className="text-sm text-muted-foreground">
                    停用的單字包無法被領取
                  </p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingPack ? '更新' : '建立'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除「{packToDelete?.title}」將同時刪除所有相關的單字和
              Token。此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
