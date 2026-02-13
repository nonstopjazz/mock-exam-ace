import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Loader2, Plus, Pencil, Trash2, ArrowLeft, GripVertical, Upload, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BatchUploadDialog } from '@/components/admin/BatchUploadDialog';

interface Pack {
  id: string;
  title: string;
}

interface PackItem {
  id: string;
  pack_id: string;
  word: string;
  definition: string | null;
  part_of_speech: string | null;
  example_sentence: string | null;
  phonetic: string | null;
  sort_order: number;
  created_at: string;
}

interface ItemFormData {
  word: string;
  definition: string;
  part_of_speech: string;
  example_sentence: string;
  phonetic: string;
  sort_order: number;
}

const initialFormData: ItemFormData = {
  word: '',
  definition: '',
  part_of_speech: '',
  example_sentence: '',
  phonetic: '',
  sort_order: 0,
};

export default function PackItemsAdmin() {
  const { packId } = useParams<{ packId: string }>();
  const [pack, setPack] = useState<Pack | null>(null);
  const [items, setItems] = useState<PackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PackItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<PackItem | null>(null);
  const [formData, setFormData] = useState<ItemFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [batchUploadOpen, setBatchUploadOpen] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (packId) {
      fetchPack();
      fetchItems();
    }
  }, [packId]);

  async function fetchPack() {
    const { data, error } = await supabase
      .from('packs')
      .select('id, title')
      .eq('id', packId)
      .single();

    if (error) {
      toast({
        title: '載入失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setPack(data);
    }
  }

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from('pack_items')
      .select('*')
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    if (error) {
      toast({
        title: '載入失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }

  function openCreateDialog() {
    setEditingItem(null);
    const nextSortOrder = items.length > 0
      ? Math.max(...items.map(i => i.sort_order)) + 1
      : 1;
    setFormData({ ...initialFormData, sort_order: nextSortOrder });
    setDialogOpen(true);
  }

  function openEditDialog(item: PackItem) {
    setEditingItem(item);
    setFormData({
      word: item.word,
      definition: item.definition || '',
      part_of_speech: item.part_of_speech || '',
      example_sentence: item.example_sentence || '',
      phonetic: item.phonetic || '',
      sort_order: item.sort_order,
    });
    setDialogOpen(true);
  }

  function openDeleteDialog(item: PackItem) {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.word.trim()) {
      toast({
        title: '請輸入單字',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    const itemData = {
      pack_id: packId,
      word: formData.word.trim(),
      definition: formData.definition.trim() || null,
      part_of_speech: formData.part_of_speech.trim() || null,
      example_sentence: formData.example_sentence.trim() || null,
      phonetic: formData.phonetic.trim() || null,
      sort_order: formData.sort_order,
    };

    if (editingItem) {
      // Update
      const { error } = await supabase
        .from('pack_items')
        .update(itemData)
        .eq('id', editingItem.id);

      if (error) {
        toast({
          title: '更新失敗',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({ title: '更新成功' });
        setDialogOpen(false);
        fetchItems();
      }
    } else {
      // Create
      const { error } = await supabase.from('pack_items').insert(itemData);

      if (error) {
        toast({
          title: '建立失敗',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({ title: '建立成功' });
        setDialogOpen(false);
        fetchItems();
      }
    }

    setSubmitting(false);
  }

  async function handleDelete() {
    if (!itemToDelete) return;

    const { error } = await supabase
      .from('pack_items')
      .delete()
      .eq('id', itemToDelete.id);

    if (error) {
      toast({
        title: '刪除失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: '刪除成功' });
      fetchItems();
    }

    setDeleteDialogOpen(false);
    setItemToDelete(null);
  }

  async function handleGenerateAudio() {
    if (!packId) return;
    setGeneratingAudio(true);
    try {
      const res = await fetch('/api/generate-pack-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失敗');
      toast({
        title: '發音生成完成',
        description: `單字發音：生成 ${data.wordGenerated} 個、跳過 ${data.wordSkipped} 個｜例句發音：生成 ${data.exampleGenerated} 個、跳過 ${data.exampleSkipped} 個（共 ${data.total} 個單字）`,
      });
      fetchItems();
    } catch (err: any) {
      toast({
        title: '發音生成失敗',
        description: err.message || '請確認環境變數已設定',
        variant: 'destructive',
      });
    } finally {
      setGeneratingAudio(false);
    }
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/packs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {pack?.title || '單字管理'}
          </h1>
          <p className="text-muted-foreground">
            管理此單字包中的單字 ({items.length} 個)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleGenerateAudio}
            disabled={generatingAudio || items.length === 0}
          >
            {generatingAudio ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4 mr-2" />
            )}
            {generatingAudio ? '生成中...' : '生成發音'}
          </Button>
          <Button variant="outline" onClick={() => setBatchUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            批次上傳
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            新增單字
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          尚無單字，點擊「新增單字」開始建立
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>單字</TableHead>
                <TableHead>詞性</TableHead>
                <TableHead>定義</TableHead>
                <TableHead>音標</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      {index + 1}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{item.word}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.part_of_speech || '-'}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {item.definition || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.phonetic || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="編輯"
                        onClick={() => openEditDialog(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="刪除"
                        onClick={() => openDeleteDialog(item)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? '編輯單字' : '新增單字'}
            </DialogTitle>
            <DialogDescription>
              {editingItem ? '修改單字資訊' : '新增單字到此單字包'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="word">單字 *</Label>
                  <Input
                    id="word"
                    value={formData.word}
                    onChange={(e) =>
                      setFormData({ ...formData, word: e.target.value })
                    }
                    placeholder="climate change"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part_of_speech">詞性</Label>
                  <Input
                    id="part_of_speech"
                    value={formData.part_of_speech}
                    onChange={(e) =>
                      setFormData({ ...formData, part_of_speech: e.target.value })
                    }
                    placeholder="n. / v. / adj."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="definition">定義</Label>
                <Input
                  id="definition"
                  value={formData.definition}
                  onChange={(e) =>
                    setFormData({ ...formData, definition: e.target.value })
                  }
                  placeholder="氣候變遷"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phonetic">音標</Label>
                <Input
                  id="phonetic"
                  value={formData.phonetic}
                  onChange={(e) =>
                    setFormData({ ...formData, phonetic: e.target.value })
                  }
                  placeholder="/ˈklaɪmət tʃeɪndʒ/"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="example_sentence">例句</Label>
                <Textarea
                  id="example_sentence"
                  value={formData.example_sentence}
                  onChange={(e) =>
                    setFormData({ ...formData, example_sentence: e.target.value })
                  }
                  placeholder="Climate change is affecting weather patterns worldwide."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sort_order">排序</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                  }
                  min={0}
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
                {editingItem ? '更新' : '建立'}
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
              刪除「{itemToDelete?.word}」後無法復原。
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

      {/* Batch Upload Dialog */}
      {packId && (
        <BatchUploadDialog
          open={batchUploadOpen}
          onOpenChange={setBatchUploadOpen}
          packId={packId}
          existingCount={items.length}
          onSuccess={() => {
            fetchItems();
            toast({ title: '批次上傳成功' });
          }}
        />
      )}
    </div>
  );
}
