import { useState, useEffect, useRef } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Pencil, Trash2, List, Key, ArrowLeft, Upload, X, Image as ImageIcon, Star, GripVertical, FileSpreadsheet, Download, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

interface PackImage {
  id: string;
  pack_id: string;
  image_url: string;
  is_cover: boolean;
  sort_order: number;
}

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
  cover_image?: PackImage | null;
}

interface PackFormData {
  title: string;
  description: string;
  theme: string;
  difficulty: string;
  is_public: boolean;
  is_active: boolean;
}

interface PendingImage {
  id: string;
  file: File;
  preview: string;
  is_cover: boolean;
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

  // Image management
  const [existingImages, setExistingImages] = useState<PackImage[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  // Download vocabulary template
  function downloadTemplate() {
    const template = [
      ['word', 'definition', 'part_of_speech', 'phonetic', 'example_sentence'],
      ['climate change', '氣候變遷', 'n.', '/ˈklaɪmət tʃeɪndʒ/', 'Climate change is affecting weather patterns worldwide.'],
      ['sustainable', '可持續的', 'adj.', '/səˈsteɪnəbəl/', 'We need to find sustainable solutions.'],
      ['renewable', '可再生的', 'adj.', '/rɪˈnjuːəbəl/', 'Solar power is a renewable energy source.'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(template);
    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, // word
      { wch: 15 }, // definition
      { wch: 15 }, // part_of_speech
      { wch: 25 }, // phonetic
      { wch: 50 }, // example_sentence
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '單字範本');
    XLSX.writeFile(wb, '單字包上傳範本.xlsx');
    toast({ title: '範本已下載' });
  }

  useEffect(() => {
    fetchPacks();
  }, []);

  async function fetchPacks() {
    setLoading(true);

    // Fetch packs with cover image
    const { data, error } = await supabase
      .from('packs')
      .select(`
        *,
        cover_image:pack_images!pack_id(id, image_url, is_cover, sort_order)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: '載入失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      // Process to get only cover image
      const packsWithCover = (data || []).map(pack => ({
        ...pack,
        cover_image: Array.isArray(pack.cover_image)
          ? pack.cover_image.find((img: PackImage) => img.is_cover) || pack.cover_image[0] || null
          : null
      }));
      setPacks(packsWithCover);
    }
    setLoading(false);
  }

  async function fetchPackImages(packId: string) {
    const { data, error } = await supabase
      .from('pack_images')
      .select('*')
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    if (error) {
      toast({
        title: '載入圖片失敗',
        description: error.message,
        variant: 'destructive',
      });
      return [];
    }
    return data || [];
  }

  function openCreateDialog() {
    setEditingPack(null);
    setFormData(initialFormData);
    setExistingImages([]);
    setPendingImages([]);
    setImagesToDelete([]);
    setDialogOpen(true);
  }

  async function openEditDialog(pack: Pack) {
    setEditingPack(pack);
    setFormData({
      title: pack.title,
      description: pack.description || '',
      theme: pack.theme || '',
      difficulty: pack.difficulty || '',
      is_public: pack.is_public,
      is_active: pack.is_active,
    });

    // Fetch existing images
    const images = await fetchPackImages(pack.id);
    setExistingImages(images);
    setPendingImages([]);
    setImagesToDelete([]);
    setDialogOpen(true);
  }

  function openDeleteDialog(pack: Pack) {
    setPackToDelete(pack);
    setDeleteDialogOpen(true);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const newPendingImages: PendingImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: '請選擇圖片檔案',
          variant: 'destructive',
        });
        continue;
      }

      // Validate file size (max 5MB for infographics)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: `${file.name} 超過 5MB 限制`,
          variant: 'destructive',
        });
        continue;
      }

      const isFirstImage = existingImages.length === 0 && pendingImages.length === 0 && newPendingImages.length === 0;

      newPendingImages.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        is_cover: isFirstImage, // First image is cover by default
      });
    }

    setPendingImages([...pendingImages, ...newPendingImages]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function removePendingImage(id: string) {
    const image = pendingImages.find(img => img.id === id);
    if (image) {
      URL.revokeObjectURL(image.preview);
      const remaining = pendingImages.filter(img => img.id !== id);

      // If removed image was cover, set first remaining as cover
      if (image.is_cover && remaining.length > 0) {
        remaining[0].is_cover = true;
      }

      setPendingImages(remaining);
    }
  }

  function removeExistingImage(id: string) {
    const image = existingImages.find(img => img.id === id);
    if (image) {
      setImagesToDelete([...imagesToDelete, id]);
      const remaining = existingImages.filter(img => img.id !== id);

      // If removed image was cover, set first remaining as cover
      if (image.is_cover && remaining.length > 0) {
        remaining[0].is_cover = true;
        // Update in database will happen on save
      }

      setExistingImages(remaining);
    }
  }

  function setCoverImage(id: string, type: 'existing' | 'pending') {
    if (type === 'existing') {
      setExistingImages(existingImages.map(img => ({
        ...img,
        is_cover: img.id === id
      })));
      setPendingImages(pendingImages.map(img => ({
        ...img,
        is_cover: false
      })));
    } else {
      setPendingImages(pendingImages.map(img => ({
        ...img,
        is_cover: img.id === id
      })));
      setExistingImages(existingImages.map(img => ({
        ...img,
        is_cover: false
      })));
    }
  }

  async function uploadImages(packId: string): Promise<boolean> {
    if (pendingImages.length === 0 && imagesToDelete.length === 0 && !existingImages.some(img => img.is_cover)) {
      return true;
    }

    setUploadingImages(true);

    try {
      // Delete removed images
      for (const imageId of imagesToDelete) {
        const image = await supabase
          .from('pack_images')
          .select('image_url')
          .eq('id', imageId)
          .single();

        if (image.data?.image_url) {
          const fileName = image.data.image_url.split('/').pop();
          if (fileName) {
            await supabase.storage.from('pack-images').remove([fileName]);
          }
        }

        await supabase.from('pack_images').delete().eq('id', imageId);
      }

      // Update existing images (cover status)
      for (const img of existingImages) {
        await supabase
          .from('pack_images')
          .update({ is_cover: img.is_cover, sort_order: existingImages.indexOf(img) })
          .eq('id', img.id);
      }

      // Upload new images
      const startOrder = existingImages.length;
      for (let i = 0; i < pendingImages.length; i++) {
        const pending = pendingImages[i];
        const fileExt = pending.file.name.split('.').pop();
        const fileName = `${packId}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('pack-images')
          .upload(fileName, pending.file);

        if (uploadError) {
          toast({
            title: '圖片上傳失敗',
            description: uploadError.message,
            variant: 'destructive',
          });
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('pack-images')
          .getPublicUrl(fileName);

        // Insert into pack_images table
        await supabase.from('pack_images').insert({
          pack_id: packId,
          image_url: publicUrl,
          is_cover: pending.is_cover,
          sort_order: startOrder + i,
        });
      }

      return true;
    } catch (err) {
      toast({
        title: '圖片處理失敗',
        description: err instanceof Error ? err.message : '未知錯誤',
        variant: 'destructive',
      });
      return false;
    } finally {
      setUploadingImages(false);
    }
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
      // Update pack
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
        setSubmitting(false);
        return;
      }

      // Handle images
      await uploadImages(editingPack.id);

      toast({ title: '更新成功' });
      setDialogOpen(false);
      fetchPacks();
    } else {
      // Create pack
      const { data, error } = await supabase
        .from('packs')
        .insert(packData)
        .select('id')
        .single();

      if (error || !data) {
        toast({
          title: '建立失敗',
          description: error?.message,
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      // Handle images
      await uploadImages(data.id);

      toast({ title: '建立成功' });
      setDialogOpen(false);
      fetchPacks();
    }

    setSubmitting(false);
  }

  async function handleDelete() {
    if (!packToDelete) return;

    // Delete all images from storage
    const images = await fetchPackImages(packToDelete.id);
    for (const img of images) {
      const fileName = img.image_url.split('/').pop();
      if (fileName) {
        await supabase.storage.from('pack-images').remove([`${packToDelete.id}/${fileName}`]);
      }
    }

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

  const allImages = [
    ...existingImages.map(img => ({ ...img, type: 'existing' as const })),
    ...pendingImages.map(img => ({
      id: img.id,
      image_url: img.preview,
      is_cover: img.is_cover,
      type: 'pending' as const
    })),
  ];

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">單字包管理</h1>
          <p className="text-muted-foreground">管理所有單字包</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          下載 Excel 範本
        </Button>
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

      {/* Usage Guide */}
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>使用說明：</strong>
          1. 點擊「下載 Excel 範本」取得單字上傳格式 →
          2. 填寫單字資料後，點擊單字包的「單字管理」→
          3. 點擊「批次上傳」上傳 Excel 檔案
        </AlertDescription>
      </Alert>

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
                <TableHead className="w-[60px]">封面</TableHead>
                <TableHead>標題</TableHead>
                <TableHead>主題</TableHead>
                <TableHead>難度</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>建立時間</TableHead>
                <TableHead className="w-[200px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.map((pack) => (
                <TableRow key={pack.id}>
                  <TableCell>
                    {pack.cover_image?.image_url ? (
                      <img
                        src={pack.cover_image.image_url}
                        alt={pack.title}
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
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
                        <Button variant="outline" size="sm" title="管理單字 & 批次上傳">
                          <FileSpreadsheet className="h-4 w-4 mr-1" />
                          單字管理
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="編輯單字包"
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              {/* Image Gallery */}
              <div className="space-y-2">
                <Label>圖片（Infographic / 封面）</Label>
                <div className="border rounded-lg p-4 space-y-3">
                  {/* Image Grid */}
                  {allImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-3">
                      {allImages.map((img) => (
                        <div
                          key={img.id}
                          className={`relative group rounded-lg overflow-hidden border-2 ${
                            img.is_cover ? 'border-primary' : 'border-transparent'
                          }`}
                        >
                          <img
                            src={img.image_url}
                            alt="Pack image"
                            className="w-full aspect-square object-cover"
                          />
                          {/* Cover badge */}
                          {img.is_cover && (
                            <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              封面
                            </div>
                          )}
                          {/* Actions overlay */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            {!img.is_cover && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setCoverImage(img.id, img.type)}
                                title="設為封面"
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                img.type === 'existing'
                                  ? removeExistingImage(img.id)
                                  : removePendingImage(img.id)
                              }
                              title="刪除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload Button */}
                  <div
                    className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">點擊上傳圖片</span>
                    <span className="text-xs text-muted-foreground mt-1">支援多選，每張最大 5MB</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageSelect}
                  />

                  {allImages.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      共 {allImages.length} 張圖片。點擊 ⭐ 設為封面，滑鼠移到圖片上可刪除。
                    </p>
                  )}
                </div>
              </div>

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
              <Button type="submit" disabled={submitting || uploadingImages}>
                {(submitting || uploadingImages) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
              刪除「{packToDelete?.title}」將同時刪除所有相關的單字、圖片和
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
