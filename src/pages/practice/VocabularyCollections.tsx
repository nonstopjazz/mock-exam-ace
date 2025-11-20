import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BookmarkPlus,
  Search,
  Filter,
  Trash2,
  FolderInput,
  Download,
  ChevronLeft,
  Tag,
  CheckCircle2,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface VocabularyPack {
  id: string;
  title: string;
  theme: string;
  description: string;
  wordCount: number;
  source: string;
  difficulty: string;
  dateCollected: string;
  progress: number;
}

const VocabularyCollections = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const [selectedPacks, setSelectedPacks] = useState<string[]>([]);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [targetCategory, setTargetCategory] = useState("");

  const [collectedPacks] = useState<VocabularyPack[]>([
    {
      id: "1",
      title: "全球暖化",
      theme: "環境議題",
      description: "探討全球暖化相關的核心詞彙，涵蓋氣候變遷、溫室效應、碳排放等概念",
      wordCount: 15,
      source: "環境教育社群",
      difficulty: "中高級",
      dateCollected: "2024-03-15",
      progress: 40,
    },
    {
      id: "2",
      title: "少子化",
      theme: "社會議題",
      description: "討論少子化現象的相關詞彙，涵蓋人口統計、生育率、社會福利等面向",
      wordCount: 12,
      source: "社會學習社群",
      difficulty: "中級",
      dateCollected: "2024-03-14",
      progress: 75,
    },
    {
      id: "3",
      title: "垃圾問題",
      theme: "環境議題",
      description: "聚焦於垃圾處理與環境保護的核心詞彙，包含回收、減廢、循環經濟等概念",
      wordCount: 10,
      source: "環保行動聯盟",
      difficulty: "中級",
      dateCollected: "2024-03-13",
      progress: 20,
    },
  ]);

  const themes = [
    { value: "all", label: "全部主題" },
    { value: "環境議題", label: "環境議題" },
    { value: "社會議題", label: "社會議題" },
    { value: "商務英語", label: "商務英語" },
    { value: "學術英語", label: "學術英語" },
  ];

  const categories = [
    { value: "進行中", label: "進行中" },
    { value: "已完成", label: "已完成" },
    { value: "待複習", label: "待複習" },
  ];

  const filteredPacks = collectedPacks.filter((pack) => {
    const matchesSearch =
      pack.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pack.description.includes(searchQuery);
    const matchesTheme = selectedTheme === "all" || pack.theme === selectedTheme;
    return matchesSearch && matchesTheme;
  });

  const toggleSelectPack = (packId: string) => {
    setSelectedPacks((prev) =>
      prev.includes(packId) ? prev.filter((id) => id !== packId) : [...prev, packId]
    );
  };

  const selectAll = () => {
    if (selectedPacks.length === filteredPacks.length) {
      setSelectedPacks([]);
    } else {
      setSelectedPacks(filteredPacks.map((p) => p.id));
    }
  };

  const handleDelete = () => {
    toast.success(`已移除 ${selectedPacks.length} 個單字集`);
    setSelectedPacks([]);
  };

  const handleMove = () => {
    if (!targetCategory) {
      toast.error("請選擇目標分類");
      return;
    }
    toast.success(`已將 ${selectedPacks.length} 個單字集移至「${targetCategory}」`);
    setSelectedPacks([]);
    setIsMoveDialogOpen(false);
    setTargetCategory("");
  };

  const handleExport = () => {
    const exportData = collectedPacks
      .filter((p) => selectedPacks.includes(p.id))
      .map((p) => `${p.title}\t${p.theme}\t${p.wordCount} 個單字`)
      .join("\n");

    const blob = new Blob([exportData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vocabulary-packs.txt";
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`已匯出 ${selectedPacks.length} 個單字集清單`);
  };

  const totalWords = filteredPacks.reduce((sum, pack) => sum + pack.wordCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/vocabulary")}
            className="mb-4"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回單字複習中心
          </Button>

          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-lg bg-primary/10">
              <BookmarkPlus className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground">我的收藏單字集</h1>
              <p className="text-muted-foreground">
                共 {collectedPacks.length} 個單字集 • {totalWords} 個單字
                {selectedPacks.length > 0 && ` • 已選擇 ${selectedPacks.length} 個`}
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <Card className="p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜尋單字集名稱或描述..."
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

            {/* Select All */}
            <Button variant="outline" onClick={selectAll} className="w-full md:w-auto">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {selectedPacks.length === filteredPacks.length ? "取消全選" : "全選"}
            </Button>
          </div>
        </Card>

        {/* Batch Actions */}
        {selectedPacks.length > 0 && (
          <Card className="p-4 mb-6 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-foreground">
                已選擇 {selectedPacks.length} 個單字集
              </span>
              <div className="flex gap-2 ml-auto">
                <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <FolderInput className="h-4 w-4 mr-2" />
                      移動到
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>移動單字集到其他分類</DialogTitle>
                      <DialogDescription>選擇要移動到的目標分類</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <Select value={targetCategory} onValueChange={setTargetCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="選擇分類" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.value} value={category.value}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>
                          取消
                        </Button>
                        <Button onClick={handleMove}>確認移動</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  匯出
                </Button>

                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  移除
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Pack List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPacks.map((pack) => {
            const isSelected = selectedPacks.includes(pack.id);

            return (
              <Card
                key={pack.id}
                className={`transition-all duration-200 overflow-hidden ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "hover:shadow-lg"
                }`}
              >
                <div className="p-6 space-y-4">
                  {/* Header with Checkbox */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelectPack(pack.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {pack.theme}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {pack.difficulty}
                        </Badge>
                      </div>
                      <h3
                        className="text-xl font-bold text-foreground mb-1 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => navigate(`/vocabulary/pack/${pack.id}`)}
                      >
                        {pack.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {pack.description}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {pack.wordCount} 個單字
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{pack.source}</span>
                  </div>

                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">學習進度</span>
                      <span className="font-medium text-foreground">{pack.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${pack.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="text-xs text-muted-foreground">
                    收藏時間：{pack.dateCollected}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/vocabulary/pack/${pack.id}`)}
                    >
                      查看詳情
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate("/vocabulary/srs")}
                    >
                      開始複習
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredPacks.length === 0 && (
          <Card className="p-12 text-center">
            <BookmarkPlus className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">沒有找到單字集</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedTheme !== "all"
                ? "嘗試調整搜尋條件或篩選器"
                : "開始收藏你喜歡的單字集吧"}
            </p>
            <Button onClick={() => navigate("/vocabulary")}>前往單字複習中心</Button>
          </Card>
        )}

        {/* Quick Actions */}
        {filteredPacks.length > 0 && (
          <Card className="mt-8 p-6 bg-gradient-to-br from-primary/10 to-accent/10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold text-foreground mb-1">
                  準備好開始學習了嗎？
                </h4>
                <p className="text-sm text-muted-foreground">
                  你收藏了 {totalWords} 個單字，現在就開始複習吧
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/vocabulary")}>
                  發現更多單字集
                </Button>
                <Button onClick={() => navigate("/vocabulary/srs")}>
                  開始複習
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VocabularyCollections;
