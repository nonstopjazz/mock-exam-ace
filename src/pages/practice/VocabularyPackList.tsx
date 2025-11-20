import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Search,
  Filter,
  Link as LinkIcon,
  Eye,
  Plus,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  Shield,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface VocabularyPack {
  id: string;
  title: string;
  theme: string;
  description: string;
  wordCount: number;
  difficulty: string;
  author: string;
  datePublished: string;
  isPublished: boolean;
  viewCount: number;
  collectCount: number;
}

const VocabularyPackList = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");

  // 模擬所有可用的單字包數據
  const [allPacks] = useState<VocabularyPack[]>([
    {
      id: "1",
      title: "全球暖化",
      theme: "環境議題",
      description: "探討全球暖化相關的核心詞彙，包含氣候變遷、溫室效應、碳排放等重要概念",
      wordCount: 15,
      difficulty: "中高級",
      author: "環境學習小組",
      datePublished: "2024-03-15",
      isPublished: true,
      viewCount: 234,
      collectCount: 45,
    },
    {
      id: "2",
      title: "少子化",
      theme: "社會議題",
      description: "討論少子化現象的相關詞彙，涵蓋人口統計、生育率、社會福利等面向",
      wordCount: 12,
      difficulty: "中級",
      author: "社會議題研究組",
      datePublished: "2024-03-14",
      isPublished: true,
      viewCount: 189,
      collectCount: 38,
    },
    {
      id: "3",
      title: "垃圾問題",
      theme: "環境議題",
      description: "聚焦於垃圾處理與環境保護的核心詞彙，包含回收、減廢、循環經濟等概念",
      wordCount: 10,
      difficulty: "中級",
      author: "綠色生活推廣組",
      datePublished: "2024-03-13",
      isPublished: true,
      viewCount: 156,
      collectCount: 29,
    },
    {
      id: "4",
      title: "人工智慧與科技",
      theme: "科技議題",
      description: "涵蓋AI、機器學習、深度學習等現代科技的專業詞彙",
      wordCount: 20,
      difficulty: "高級",
      author: "科技教育團隊",
      datePublished: "2024-03-10",
      isPublished: true,
      viewCount: 312,
      collectCount: 67,
    },
    {
      id: "5",
      title: "健康飲食",
      theme: "健康議題",
      description: "關於營養、飲食習慣、健康生活的核心詞彙",
      wordCount: 18,
      difficulty: "初級",
      author: "健康生活推廣組",
      datePublished: "2024-03-08",
      isPublished: false,
      viewCount: 78,
      collectCount: 12,
    },
  ]);

  const themes = [
    { value: "all", label: "全部主題" },
    { value: "環境議題", label: "環境議題" },
    { value: "社會議題", label: "社會議題" },
    { value: "科技議題", label: "科技議題" },
    { value: "健康議題", label: "健康議題" },
    { value: "商務英語", label: "商務英語" },
    { value: "學術英語", label: "學術英語" },
  ];

  const difficulties = [
    { value: "all", label: "全部難度" },
    { value: "初級", label: "初級" },
    { value: "中級", label: "中級" },
    { value: "中高級", label: "中高級" },
    { value: "高級", label: "高級" },
  ];

  const filteredPacks = allPacks.filter((pack) => {
    const matchesSearch =
      pack.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pack.description.includes(searchQuery) ||
      pack.author.includes(searchQuery);
    const matchesTheme = selectedTheme === "all" || pack.theme === selectedTheme;
    const matchesDifficulty = selectedDifficulty === "all" || pack.difficulty === selectedDifficulty;
    return matchesSearch && matchesTheme && matchesDifficulty;
  });

  const copyPackLink = (packId: string) => {
    const link = `${window.location.origin}/practice/vocabulary/pack/${packId}`;
    navigator.clipboard.writeText(link);
    toast.success("連結已複製到剪貼簿");
  };

  const handleViewPack = (packId: string) => {
    navigate(`/practice/vocabulary/pack/${packId}`);
  };

  const handleTogglePublish = (packId: string) => {
    toast.success("已更新發布狀態");
  };

  const handleDelete = (packId: string, title: string) => {
    if (confirm(`確定要刪除「${title}」單字集嗎？`)) {
      toast.success("已刪除單字集");
    }
  };

  const publishedCount = allPacks.filter((p) => p.isPublished).length;
  const totalWords = allPacks.reduce((sum, pack) => sum + pack.wordCount, 0);
  const totalViews = allPacks.reduce((sum, pack) => sum + pack.viewCount, 0);
  const totalCollects = allPacks.reduce((sum, pack) => sum + pack.collectCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground">單字包管理</h1>
              <p className="text-muted-foreground">管理所有單字包並分享給社群成員</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{allPacks.length}</div>
                  <div className="text-sm text-muted-foreground">總單字包數</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-success">{publishedCount}</div>
                  <div className="text-sm text-muted-foreground">已發布</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{totalViews}</div>
                  <div className="text-sm text-muted-foreground">總瀏覽次數</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{totalCollects}</div>
                  <div className="text-sm text-muted-foreground">總收藏次數</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <Card className="p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜尋單字包名稱、描述或作者..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Theme Filter */}
            <Select value={selectedTheme} onValueChange={setSelectedTheme}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="選擇主題" />
              </SelectTrigger>
              <SelectContent>
                {themes.map((theme) => (
                  <SelectItem key={theme.value} value={theme.value}>
                    {theme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Difficulty Filter */}
            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="選擇難度" />
              </SelectTrigger>
              <SelectContent>
                {difficulties.map((difficulty) => (
                  <SelectItem key={difficulty.value} value={difficulty.value}>
                    {difficulty.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Add New Button */}
            <Button className="w-full md:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              新增單字包
            </Button>
          </div>
        </Card>

        {/* Pack Table */}
        <Card>
          <CardHeader>
            <CardTitle>單字包列表</CardTitle>
            <CardDescription>
              共 {filteredPacks.length} 個單字包
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>標題</TableHead>
                  <TableHead>主題</TableHead>
                  <TableHead>難度</TableHead>
                  <TableHead className="text-center">單字數</TableHead>
                  <TableHead className="text-center">瀏覽</TableHead>
                  <TableHead className="text-center">收藏</TableHead>
                  <TableHead className="text-center">狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPacks.map((pack) => (
                  <TableRow key={pack.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-foreground">{pack.title}</div>
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {pack.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{pack.theme}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{pack.difficulty}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{pack.wordCount}</TableCell>
                    <TableCell className="text-center">{pack.viewCount}</TableCell>
                    <TableCell className="text-center">{pack.collectCount}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={pack.isPublished ? "default" : "secondary"}>
                        {pack.isPublished ? "已發布" : "草稿"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyPackLink(pack.id)}
                          title="複製連結"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewPack(pack.id)}
                          title="查看詳情"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            /* TODO: Implement edit */
                          }}
                          title="編輯"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(pack.id, pack.title)}
                          title="刪除"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Empty State */}
            {filteredPacks.length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">沒有找到單字包</h3>
                <p className="text-muted-foreground">嘗試調整搜尋條件或篩選器</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <LinkIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">如何分享單字包給社群成員</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  1. 點擊「複製連結」按鈕複製單字包的專屬連結
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  2. 將連結分享到社群平台（Discord、Facebook 等）
                </p>
                <p className="text-sm text-muted-foreground">
                  3. 使用者點擊連結後可以查看單字包並加入收藏
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VocabularyPackList;
