import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Loader2, Plus, Pencil, Trash2, ArrowLeft, Upload, Eye, EyeOff,
  Image as ImageIcon, FileText, Settings, ExternalLink,
  Heart, BookmarkIcon, MessageSquare, Share2, TrendingUp, BarChart3
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBlogAdmin, useBlogCategories, useBlogStats, BlogPostDB, calculateReadTime } from '@/hooks/useBlog';
import { BlockNoteEditor } from '@/components/editor/BlockNoteEditor';

// 產品標籤選項
const PRODUCT_TAG_OPTIONS = [
  { value: 'general', label: '通用（所有子站）' },
  { value: 'gsat', label: '學測英文' },
  { value: 'toeic', label: '多益英文' },
  { value: 'kids', label: '兒童英語' },
];

interface PostFormData {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string;
  author_name: string;
  author_avatar: string;
  category: string;
  tags: string;
  product_tags: string[]; // 產品標籤
  is_published: boolean;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

const initialFormData: PostFormData = {
  slug: '',
  title: '',
  excerpt: '',
  content: '',
  cover_image: '',
  author_name: 'Joe老師',
  author_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=joe',
  category: '',
  tags: '',
  product_tags: ['general'], // 預設為通用
  is_published: false,
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
};

export default function BlogAdmin() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPostDB | null>(null);
  const [postToDelete, setPostToDelete] = useState<BlogPostDB | null>(null);
  const [formData, setFormData] = useState<PostFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('content');
  const [previewMode, setPreviewMode] = useState(false);

  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { posts, loading, createPost, updatePost, deletePost, togglePublish, uploadImage, refetch } = useBlogAdmin();
  const { categories } = useBlogCategories();
  const { stats, postStats, loading: statsLoading, refetch: refetchStats } = useBlogStats();
  const { toast } = useToast();

  // Generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  function openCreateDialog() {
    setEditingPost(null);
    setFormData(initialFormData);
    setActiveTab('content');
    setPreviewMode(false);
    setDialogOpen(true);
  }

  function openEditDialog(post: BlogPostDB) {
    setEditingPost(post);
    setFormData({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt || '',
      content: post.content,
      cover_image: post.cover_image || '',
      author_name: post.author_name,
      author_avatar: post.author_avatar || '',
      category: post.category,
      tags: (post.tags || []).join(', '),
      product_tags: post.product_tags || ['general'],
      is_published: post.is_published,
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
      seo_keywords: (post.seo_keywords || []).join(', '),
    });
    setActiveTab('content');
    setPreviewMode(false);
    setDialogOpen(true);
  }

  function openDeleteDialog(post: BlogPostDB) {
    setPostToDelete(post);
    setDeleteDialogOpen(true);
  }

  // Handle cover image upload
  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: '請選擇圖片檔案', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: '圖片大小不能超過 5MB', variant: 'destructive' });
      return;
    }

    const { url, error } = await uploadImage(file, 'covers');
    if (error) {
      toast({ title: '上傳失敗', description: error, variant: 'destructive' });
    } else if (url) {
      setFormData({ ...formData, cover_image: url });
      toast({ title: '封面圖上傳成功' });
    }

    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  }

  // Handle inline image upload (insert at cursor in content)
  async function handleInlineImageUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        toast({ title: '請選擇圖片檔案', variant: 'destructive' });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({ title: '圖片大小不能超過 5MB', variant: 'destructive' });
        return;
      }

      toast({ title: '上傳中...' });
      const { url, error } = await uploadImage(file, 'content');

      if (error) {
        toast({ title: '上傳失敗', description: error, variant: 'destructive' });
        return;
      }

      if (url && contentTextareaRef.current) {
        const textarea = contentTextareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = formData.content;
        const imageMarkdown = `\n![圖片說明](${url})\n`;

        const newContent = text.substring(0, start) + imageMarkdown + text.substring(end);
        setFormData({ ...formData, content: newContent });

        // Set cursor position after insert
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length;
          textarea.focus();
        }, 0);

        toast({ title: '圖片已插入' });
      }
    };
    input.click();
  }

  // Insert markdown formatting
  function insertMarkdown(prefix: string, suffix: string = '') {
    if (!contentTextareaRef.current) return;

    const textarea = contentTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.content;
    const selectedText = text.substring(start, end);

    const newContent = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    setFormData({ ...formData, content: newContent });

    setTimeout(() => {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selectedText.length;
      textarea.focus();
    }, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast({ title: '請輸入標題', variant: 'destructive' });
      return;
    }
    if (!formData.slug.trim()) {
      toast({ title: '請輸入 Slug', variant: 'destructive' });
      return;
    }
    if (!formData.content.trim()) {
      toast({ title: '請輸入內文', variant: 'destructive' });
      return;
    }
    if (!formData.category) {
      toast({ title: '請選擇分類', variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    const postData: Partial<BlogPostDB> = {
      slug: formData.slug.trim(),
      title: formData.title.trim(),
      excerpt: formData.excerpt.trim() || null,
      content: formData.content,
      cover_image: formData.cover_image || null,
      author_name: formData.author_name.trim() || 'Joe老師',
      author_avatar: formData.author_avatar.trim() || null,
      category: formData.category,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      product_tags: formData.product_tags.length > 0 ? formData.product_tags : ['general'],
      is_published: formData.is_published,
      read_time: calculateReadTime(formData.content),
      seo_title: formData.seo_title.trim() || null,
      seo_description: formData.seo_description.trim() || null,
      seo_keywords: formData.seo_keywords.split(',').map(k => k.trim()).filter(Boolean),
    };

    // Set published_at if publishing for first time
    if (formData.is_published && !editingPost?.published_at) {
      postData.published_at = new Date().toISOString();
    }

    if (editingPost) {
      const { error } = await updatePost(editingPost.id, postData);
      if (error) {
        toast({ title: '更新失敗', description: error, variant: 'destructive' });
      } else {
        toast({ title: '更新成功' });
        // 不關閉對話框，讓用戶可以繼續編輯
        refetch();
      }
    } else {
      const { error } = await createPost(postData);
      if (error) {
        toast({ title: '建立失敗', description: error, variant: 'destructive' });
      } else {
        toast({ title: '建立成功' });
        setDialogOpen(false);
        refetch();
      }
    }

    setSubmitting(false);
  }

  async function handleDelete() {
    if (!postToDelete) return;

    const { error } = await deletePost(postToDelete.id);
    if (error) {
      toast({ title: '刪除失敗', description: error, variant: 'destructive' });
    } else {
      toast({ title: '刪除成功' });
    }

    setDeleteDialogOpen(false);
    setPostToDelete(null);
  }

  async function handleTogglePublish(post: BlogPostDB) {
    const { error } = await togglePublish(post.id, !post.is_published);
    if (error) {
      toast({ title: '操作失敗', description: error, variant: 'destructive' });
    } else {
      toast({ title: post.is_published ? '已取消發布' : '已發布' });
      refetch();
    }
  }

  // Simple markdown to HTML for preview
  const renderMarkdown = (content: string) => {
    return content
      .replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold mt-6 mb-3">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-8 mb-4">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li class="ml-6 list-disc">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-6 list-decimal">$2</li>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary pl-4 py-2 my-4 bg-muted italic">$1</blockquote>')
      .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded">$1</code>')
      .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" class="rounded-lg my-4 max-w-full" />')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>')
      .replace(/^(?!<[hblioac]|$)(.+)$/gm, '<p class="mb-3">$1</p>');
  };

  const filteredCategories = categories.filter(c => c.id !== 'all');

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Blog 文章管理</h1>
          <p className="text-muted-foreground">管理部落格文章</p>
        </div>
        <Link to="/blog" target="_blank">
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            查看前台
          </Button>
        </Link>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新增文章
        </Button>
      </div>

      {/* Statistics Dashboard */}
      {!statsLoading && stats && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            統計總覽
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-500/20 p-2">
                    <Eye className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">總瀏覽</p>
                    <p className="text-xl font-bold">{stats.totalViews.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-200/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-500/20 p-2">
                    <Heart className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">總喜歡</p>
                    <p className="text-xl font-bold">{stats.totalLikes.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-200/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-yellow-500/20 p-2">
                    <BookmarkIcon className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">總收藏</p>
                    <p className="text-xl font-bold">{stats.totalBookmarks.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-500/20 p-2">
                    <MessageSquare className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">總留言</p>
                    <p className="text-xl font-bold">{stats.totalComments.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-purple-500/20 p-2">
                    <Share2 className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">總分享</p>
                    <p className="text-xl font-bold">{stats.totalShares.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              共 {stats.totalPosts} 篇文章
            </span>
            <span className="text-green-600">
              {stats.publishedPosts} 已發布
            </span>
            <span className="text-yellow-600">
              {stats.draftPosts} 草稿
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          尚無文章，點擊「新增文章」建立第一篇
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">封面</TableHead>
                <TableHead>標題</TableHead>
                <TableHead>分類</TableHead>
                <TableHead>子站</TableHead>
                <TableHead>互動數據</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>更新時間</TableHead>
                <TableHead className="w-[120px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    {post.cover_image ? (
                      <img
                        src={post.cover_image}
                        alt={post.title}
                        className="w-16 h-10 object-cover rounded"
                      />
                    ) : (
                      <div className="w-16 h-10 bg-muted rounded flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium line-clamp-1">{post.title}</div>
                    <div className="text-xs text-muted-foreground">/{post.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {categories.find(c => c.id === post.category)?.label || post.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(post.product_tags || ['general']).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag === 'general' ? '通用' : tag === 'gsat' ? '學測' : tag === 'toeic' ? '多益' : tag === 'kids' ? '兒童' : tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const stat = postStats.find(s => s.id === post.id);
                      if (!stat) return <span className="text-muted-foreground text-xs">-</span>;
                      return (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1" title="瀏覽">
                            <Eye className="h-3 w-3" /> {stat.viewCount}
                          </span>
                          <span className="flex items-center gap-1 text-red-500" title="喜歡">
                            <Heart className="h-3 w-3" /> {stat.likeCount}
                          </span>
                          <span className="flex items-center gap-1 text-yellow-500" title="收藏">
                            <BookmarkIcon className="h-3 w-3" /> {stat.bookmarkCount}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePublish(post)}
                      className="gap-1"
                    >
                      {post.is_published ? (
                        <>
                          <Eye className="h-3 w-3" />
                          <Badge variant="default">已發布</Badge>
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3 w-3" />
                          <Badge variant="secondary">草稿</Badge>
                        </>
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(post.updated_at).toLocaleDateString('zh-TW')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="編輯"
                        onClick={() => openEditDialog(post)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="刪除"
                        onClick={() => openDeleteDialog(post)}
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
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          onInteractOutside={(e) => {
            // 防止點擊外部關閉對話框（編輯時）
            if (editingPost) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            // 防止按 ESC 關閉對話框（編輯時）
            if (editingPost) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingPost ? '編輯文章' : '新增文章'}
            </DialogTitle>
            <DialogDescription>
              {editingPost ? '修改文章內容' : '建立新的部落格文章'}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content" className="gap-1">
                <FileText className="h-4 w-4" />
                內容
              </TabsTrigger>
              <TabsTrigger value="media" className="gap-1">
                <ImageIcon className="h-4 w-4" />
                媒體
              </TabsTrigger>
              <TabsTrigger value="seo" className="gap-1">
                <Settings className="h-4 w-4" />
                SEO
              </TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto py-4">
                {/* Content Tab */}
                <TabsContent value="content" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">標題 *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => {
                          const title = e.target.value;
                          setFormData({
                            ...formData,
                            title,
                            slug: formData.slug || generateSlug(title)
                          });
                        }}
                        placeholder="文章標題"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slug">Slug (URL) *</Label>
                      <Input
                        id="slug"
                        value={formData.slug}
                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                        placeholder="article-url-slug"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>分類 *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選擇分類" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tags">標籤（逗號分隔）</Label>
                      <Input
                        id="tags"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder="學習技巧, 單字, SRS"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>顯示於哪些子站</Label>
                    <div className="flex flex-wrap gap-3">
                      {PRODUCT_TAG_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            formData.product_tags.includes(option.value)
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.product_tags.includes(option.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  product_tags: [...formData.product_tags, option.value],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  product_tags: formData.product_tags.filter((t) => t !== option.value),
                                });
                              }
                            }}
                            className="sr-only"
                          />
                          <span className={`text-sm ${formData.product_tags.includes(option.value) ? 'font-medium' : ''}`}>
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      選擇「通用」則所有子站都會顯示此文章
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="excerpt">摘要</Label>
                    <Textarea
                      id="excerpt"
                      value={formData.excerpt}
                      onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                      placeholder="文章摘要，顯示在列表頁"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>內文 *</Label>
                    <BlockNoteEditor
                      content={formData.content}
                      onChange={(html) => setFormData({ ...formData, content: html })}
                      onImageUpload={async (file) => {
                        const { url, error } = await uploadImage(file, 'content');
                        if (error) {
                          toast({ title: '圖片上傳失敗', description: error, variant: 'destructive' });
                          return null;
                        }
                        return url;
                      }}
                      placeholder="開始撰寫文章內容..."
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="space-y-0.5">
                      <Label>發布狀態</Label>
                      <p className="text-sm text-muted-foreground">
                        {formData.is_published ? '文章已發布，前台可見' : '草稿狀態，僅後台可見'}
                      </p>
                    </div>
                    <Switch
                      checked={formData.is_published}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                    />
                  </div>
                </TabsContent>

                {/* Media Tab */}
                <TabsContent value="media" className="mt-0 space-y-4">
                  <div className="space-y-2">
                    <Label>封面圖片</Label>
                    <div className="border rounded-lg p-4 space-y-3">
                      {formData.cover_image ? (
                        <div className="relative">
                          <img
                            src={formData.cover_image}
                            alt="Cover"
                            className="w-full max-h-[200px] object-cover rounded-lg"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => setFormData({ ...formData, cover_image: '' })}
                          >
                            移除
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                          onClick={() => coverInputRef.current?.click()}
                        >
                          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                          <span className="text-sm text-muted-foreground">點擊上傳封面圖</span>
                          <span className="text-xs text-muted-foreground mt-1">建議尺寸 1200x630，最大 5MB</span>
                        </div>
                      )}
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCoverUpload}
                      />

                      <div className="text-sm text-muted-foreground">
                        或直接貼上圖片 URL：
                      </div>
                      <Input
                        value={formData.cover_image}
                        onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>作者資訊</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="author_name" className="text-xs">作者名稱</Label>
                        <Input
                          id="author_name"
                          value={formData.author_name}
                          onChange={(e) => setFormData({ ...formData, author_name: e.target.value })}
                          placeholder="Joe老師"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="author_avatar" className="text-xs">頭像 URL</Label>
                        <Input
                          id="author_avatar"
                          value={formData.author_avatar}
                          onChange={(e) => setFormData({ ...formData, author_avatar: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* SEO Tab */}
                <TabsContent value="seo" className="mt-0 space-y-4">
                  <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                    SEO 欄位為選填。若未填寫，將自動使用標題、摘要和封面圖作為 fallback。
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="seo_title">SEO 標題</Label>
                    <Input
                      id="seo_title"
                      value={formData.seo_title}
                      onChange={(e) => setFormData({ ...formData, seo_title: e.target.value })}
                      placeholder={formData.title || '留空則使用文章標題'}
                    />
                    <p className="text-xs text-muted-foreground">
                      建議 50-60 字元。目前：{formData.seo_title.length || formData.title.length} 字元
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="seo_description">SEO 描述</Label>
                    <Textarea
                      id="seo_description"
                      value={formData.seo_description}
                      onChange={(e) => setFormData({ ...formData, seo_description: e.target.value })}
                      placeholder={formData.excerpt || '留空則使用文章摘要'}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      建議 150-160 字元。目前：{formData.seo_description.length || formData.excerpt.length} 字元
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="seo_keywords">SEO 關鍵字（逗號分隔）</Label>
                    <Input
                      id="seo_keywords"
                      value={formData.seo_keywords}
                      onChange={(e) => setFormData({ ...formData, seo_keywords: e.target.value })}
                      placeholder="學測英文, 單字記憶, SRS"
                    />
                  </div>
                </TabsContent>
              </div>

              <DialogFooter className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingPost ? '更新' : '建立'}
                </Button>
              </DialogFooter>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除「{postToDelete?.title}」後將無法復原。
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
