import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Loader2,
  Plus,
  Trash2,
  ArrowLeft,
  Copy,
  Shuffle,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Pack {
  id: string;
  title: string;
}

interface InviteToken {
  id: string;
  pack_id: string;
  token: string;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  packs: Pack;
}

interface TokenFormData {
  pack_id: string;
  token: string;
  max_uses: string;
  expires_at: string;
  is_active: boolean;
}

const initialFormData: TokenFormData = {
  pack_id: '',
  token: '',
  max_uses: '',
  expires_at: '',
  is_active: true,
};

function generateRandomToken(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function TokensAdmin() {
  const [tokens, setTokens] = useState<InviteToken[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<InviteToken | null>(null);
  const [formData, setFormData] = useState<TokenFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPacks();
    fetchTokens();
  }, []);

  async function fetchPacks() {
    const { data, error } = await supabase
      .from('packs')
      .select('id, title')
      .order('title');

    if (error) {
      console.error('Failed to fetch packs:', error);
    } else {
      setPacks(data || []);
    }
  }

  async function fetchTokens() {
    setLoading(true);
    const { data, error } = await supabase
      .from('invite_tokens')
      .select(`
        *,
        packs:pack_id (id, title)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: '載入失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setTokens(data || []);
    }
    setLoading(false);
  }

  function openCreateDialog() {
    setFormData({
      ...initialFormData,
      token: generateRandomToken(),
    });
    setDialogOpen(true);
  }

  function openDeleteDialog(token: InviteToken) {
    setTokenToDelete(token);
    setDeleteDialogOpen(true);
  }

  function handleGenerateToken() {
    setFormData({ ...formData, token: generateRandomToken() });
  }

  async function handleCopyLink(token: string) {
    const url = `${window.location.origin}/claim/${token}`;
    await navigator.clipboard.writeText(url);
    toast({ title: '已複製連結' });
  }

  async function handleCopyToken(token: string) {
    await navigator.clipboard.writeText(token);
    toast({ title: '已複製 Token' });
  }

  async function handleToggleActive(token: InviteToken) {
    const { error } = await supabase
      .from('invite_tokens')
      .update({ is_active: !token.is_active })
      .eq('id', token.id);

    if (error) {
      toast({
        title: '更新失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      fetchTokens();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.pack_id) {
      toast({
        title: '請選擇單字包',
        variant: 'destructive',
      });
      return;
    }
    if (!formData.token.trim()) {
      toast({
        title: '請輸入 Token',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    const tokenData = {
      pack_id: formData.pack_id,
      token: formData.token.trim().toUpperCase(),
      max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
      expires_at: formData.expires_at || null,
      is_active: formData.is_active,
    };

    const { error } = await supabase.from('invite_tokens').insert(tokenData);

    if (error) {
      toast({
        title: '建立失敗',
        description: error.code === '23505' ? 'Token 已存在' : error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: '建立成功' });
      setDialogOpen(false);
      fetchTokens();
    }

    setSubmitting(false);
  }

  async function handleDelete() {
    if (!tokenToDelete) return;

    const { error } = await supabase
      .from('invite_tokens')
      .delete()
      .eq('id', tokenToDelete.id);

    if (error) {
      toast({
        title: '刪除失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: '刪除成功' });
      fetchTokens();
    }

    setDeleteDialogOpen(false);
    setTokenToDelete(null);
  }

  function getTokenStatus(token: InviteToken): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    if (!token.is_active) {
      return { label: '已停用', variant: 'secondary' };
    }
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      return { label: '已過期', variant: 'destructive' };
    }
    if (token.max_uses && token.current_uses >= token.max_uses) {
      return { label: '已用盡', variant: 'destructive' };
    }
    return { label: '啟用中', variant: 'default' };
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
          <h1 className="text-2xl font-bold">Token 管理</h1>
          <p className="text-muted-foreground">管理單字包邀請碼</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新增 Token
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          尚無 Token，點擊「新增 Token」建立邀請碼
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead>單字包</TableHead>
                <TableHead>使用次數</TableHead>
                <TableHead>過期時間</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>建立時間</TableHead>
                <TableHead className="w-[150px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => {
                const status = getTokenStatus(token);
                return (
                  <TableRow key={token.id}>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {token.token}
                      </code>
                    </TableCell>
                    <TableCell>{token.packs?.title || '-'}</TableCell>
                    <TableCell>
                      {token.current_uses}
                      {token.max_uses ? ` / ${token.max_uses}` : ' / ∞'}
                    </TableCell>
                    <TableCell>
                      {token.expires_at
                        ? new Date(token.expires_at).toLocaleDateString('zh-TW')
                        : '永不過期'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(token.created_at).toLocaleDateString('zh-TW')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="複製連結"
                          onClick={() => handleCopyLink(token.token)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="複製 Token"
                          onClick={() => handleCopyToken(token.token)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={token.is_active ? '停用' : '啟用'}
                          onClick={() => handleToggleActive(token)}
                        >
                          <Switch
                            checked={token.is_active}
                            className="pointer-events-none"
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="刪除"
                          onClick={() => openDeleteDialog(token)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增 Token</DialogTitle>
            <DialogDescription>
              建立新的邀請碼讓使用者領取單字包
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>單字包 *</Label>
                <Select
                  value={formData.pack_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, pack_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇單字包" />
                  </SelectTrigger>
                  <SelectContent>
                    {packs.map((pack) => (
                      <SelectItem key={pack.id} value={pack.id}>
                        {pack.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="token">Token *</Label>
                <div className="flex gap-2">
                  <Input
                    id="token"
                    value={formData.token}
                    onChange={(e) =>
                      setFormData({ ...formData, token: e.target.value.toUpperCase() })
                    }
                    placeholder="ABCD1234"
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateToken}
                    title="產生亂數"
                  >
                    <Shuffle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_uses">最大使用次數</Label>
                  <Input
                    id="max_uses"
                    type="number"
                    value={formData.max_uses}
                    onChange={(e) =>
                      setFormData({ ...formData, max_uses: e.target.value })
                    }
                    placeholder="留空為無限"
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires_at">過期時間</Label>
                  <Input
                    id="expires_at"
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) =>
                      setFormData({ ...formData, expires_at: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>啟用</Label>
                  <p className="text-sm text-muted-foreground">
                    停用的 Token 無法被使用
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
                建立
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
              刪除 Token「{tokenToDelete?.token}」後無法復原。
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
