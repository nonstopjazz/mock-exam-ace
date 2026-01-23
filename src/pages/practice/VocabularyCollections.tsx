import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookmarkPlus,
  Search,
  Filter,
  ChevronLeft,
  Tag,
  ChevronRight,
  BookOpen,
  Loader2,
  RefreshCw,
  LogIn,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserPacks } from "@/hooks/useUserPacks";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface PublicPack {
  id: string;
  title: string;
  description: string | null;
  theme: string | null;
  skill_type: string | null;
  difficulty: string | null;
  cover_image?: { image_url: string } | null;
}

// 英文能力類型
const SKILL_TYPES = [
  { value: 'all', label: '全部' },
  { value: 'vocabulary', label: '單字' },
  { value: 'writing', label: '寫作' },
  { value: 'reading', label: '閱讀' },
];

const VocabularyCollections = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { packs, loading, error, refetch } = useUserPacks();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkillType, setSelectedSkillType] = useState<string>("all");
  const [selectedTheme, setSelectedTheme] = useState<string>("all");

  // Public packs for non-logged-in users
  const [publicPacks, setPublicPacks] = useState<PublicPack[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);

  // Fetch public packs for preview
  useEffect(() => {
    if (!user && !authLoading) {
      fetchPublicPacks();
    }
  }, [user, authLoading]);

  async function fetchPublicPacks() {
    setLoadingPublic(true);
    const { data, error } = await supabase
      .from('packs')
      .select(`
        id, title, description, theme, skill_type, difficulty,
        cover_image:pack_images!pack_id(image_url)
      `)
      .eq('is_public', true)
      .eq('is_active', true)
      .limit(6);

    if (!error && data) {
      const processed = data.map(pack => ({
        ...pack,
        cover_image: Array.isArray(pack.cover_image) && pack.cover_image.length > 0
          ? pack.cover_image[0]
          : null
      }));
      setPublicPacks(processed);
    }
    setLoadingPublic(false);
  }

  // Get unique themes from packs
  const themes = [
    { value: "all", label: "全部主題" },
    ...Array.from(new Set(packs.map(p => p.theme).filter(Boolean)))
      .map(theme => ({ value: theme!, label: theme! }))
  ];

  const filteredPacks = packs.filter((pack) => {
    const matchesSearch =
      pack.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pack.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesSkillType = selectedSkillType === "all" || pack.skill_type === selectedSkillType;
    const matchesTheme = selectedTheme === "all" || pack.theme === selectedTheme;
    return matchesSearch && matchesSkillType && matchesTheme;
  });

  const totalWords = filteredPacks.reduce((sum, pack) => sum + pack.word_count, 0);

  // Auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  // Guest view (not logged in)
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/practice/vocabulary")}
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
                <h1 className="text-4xl font-bold text-foreground">詞彙收藏</h1>
                <p className="text-muted-foreground">
                  登入後即可收藏並管理你的單字包
                </p>
              </div>
            </div>
          </div>

          {/* Login CTA */}
          <Card className="mb-8 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="p-4 rounded-full bg-primary/20">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    開始收藏你的專屬單字包
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    登入後，你可以透過邀請碼領取單字包、追蹤學習進度、開始 SRS 複習
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                    <Button onClick={() => navigate("/login?returnUrl=/practice/vocabulary/collections")}>
                      <LogIn className="h-4 w-4 mr-2" />
                      登入 / 註冊
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/practice/vocabulary")}>
                      先逛逛單字中心
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Public Packs Preview */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-xl font-semibold text-foreground">精選單字包預覽</h3>
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                示意
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              以下為單字包範例，實際領取需透過邀請碼
            </p>

            {loadingPublic ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : publicPacks.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">目前沒有公開的單字包</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publicPacks.map((pack) => (
                  <Card key={pack.id} className="overflow-hidden hover:shadow-lg transition-shadow relative">
                    {/* Demo Badge */}
                    <div className="absolute top-2 right-2 z-10">
                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50/90 backdrop-blur-sm text-xs">
                        示意
                      </Badge>
                    </div>
                    {/* Cover Image */}
                    {pack.cover_image?.image_url ? (
                      <div className="aspect-video bg-muted overflow-hidden">
                        <img
                          src={pack.cover_image.image_url}
                          alt={pack.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <BookOpen className="h-12 w-12 text-primary/40" />
                      </div>
                    )}
                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {pack.theme && (
                          <Badge variant="outline" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {pack.theme}
                          </Badge>
                        )}
                        {pack.difficulty && (
                          <Badge variant="secondary" className="text-xs">
                            {pack.difficulty}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-lg font-bold text-foreground">{pack.title}</h4>
                      {pack.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {pack.description}
                        </p>
                      )}
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => navigate(`/practice/vocabulary/pack/${pack.id}`)}
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          預覽單字
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* How to Get Packs */}
          <Card className="bg-gradient-to-br from-accent/10 to-primary/10 border-accent/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-accent/20">
                  <BookmarkPlus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">如何取得單字包？</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    單字包透過邀請碼領取：
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>參與我們的社群討論（Discord、Facebook 等）</li>
                    <li>從社群成員或管理員那裡取得邀請碼</li>
                    <li>登入後點擊邀請連結（如 /claim/XXXX）即可領取</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Loading state (logged in)
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">載入收藏中...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-12 text-center">
            <h3 className="text-xl font-semibold text-foreground mb-2">載入失敗</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={refetch}>
              <RefreshCw className="h-4 w-4 mr-2" />
              重試
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Logged in view
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/practice/vocabulary")}
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
                共 {packs.length} 個單字集 • {totalWords} 個單字
              </p>
            </div>
          </div>
        </div>

        {/* Skill Type Tabs */}
        <div className="mb-4">
          <Tabs value={selectedSkillType} onValueChange={setSelectedSkillType}>
            <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0">
              {SKILL_TYPES.map((skill) => (
                <TabsTrigger
                  key={skill.value}
                  value={skill.value}
                  className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {skill.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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

            {/* Refresh */}
            <Button variant="outline" onClick={refetch} className="w-full md:w-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              重新整理
            </Button>
          </div>
        </Card>

        {/* Pack List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 xl:gap-4">
          {filteredPacks.map((pack) => (
            <Card
              key={pack.id}
              className="transition-all duration-200 overflow-hidden hover:shadow-lg"
            >
              {/* Cover Image */}
              {pack.cover_image_url ? (
                <div className="aspect-video xl:h-28 bg-muted overflow-hidden">
                  <img
                    src={pack.cover_image_url}
                    alt={pack.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-video xl:h-28 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <BookOpen className="h-12 w-12 xl:h-8 xl:w-8 text-primary/40" />
                </div>
              )}

              <div className="p-6 xl:p-4 space-y-4 xl:space-y-3">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-2 xl:gap-1 mb-2 flex-wrap">
                    {pack.skill_type && (
                      <Badge className="text-xs">
                        {SKILL_TYPES.find(s => s.value === pack.skill_type)?.label || pack.skill_type}
                      </Badge>
                    )}
                    {pack.theme && (
                      <Badge variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {pack.theme}
                      </Badge>
                    )}
                    {pack.difficulty && (
                      <Badge variant="secondary" className="text-xs">
                        {pack.difficulty}
                      </Badge>
                    )}
                  </div>
                  <h3
                    className="text-xl xl:text-base font-bold text-foreground mb-1 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => navigate(`/practice/vocabulary/pack/${pack.pack_id}`)}
                  >
                    {pack.title}
                  </h3>
                  {pack.description && (
                    <p className="text-sm xl:text-xs text-muted-foreground line-clamp-2">
                      {pack.description}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between p-3 xl:p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-sm xl:text-xs font-medium text-foreground">
                      {pack.word_count} 個單字
                    </span>
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-2 xl:space-y-1">
                  <div className="flex items-center justify-between text-sm xl:text-xs">
                    <span className="text-muted-foreground">學習進度</span>
                    <span className="font-medium text-foreground">{pack.progress}%</span>
                  </div>
                  <div className="h-2 xl:h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${pack.progress}%` }}
                    />
                  </div>
                </div>

                {/* Meta Info */}
                <div className="text-xs text-muted-foreground">
                  收藏時間：{new Date(pack.claimed_at).toLocaleDateString('zh-TW')}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 xl:text-xs xl:h-8"
                    onClick={() => navigate(`/practice/vocabulary/pack/${pack.pack_id}`)}
                  >
                    查看詳情
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 xl:text-xs xl:h-8"
                    onClick={() => navigate("/practice/vocabulary/srs")}
                  >
                    開始複習
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredPacks.length === 0 && (
          <Card className="p-12 text-center">
            <BookmarkPlus className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {packs.length === 0 ? "還沒有收藏任何單字集" : "沒有找到單字集"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {packs.length === 0
                ? "從社群取得邀請碼，領取你的第一個單字包"
                : "嘗試調整搜尋條件或篩選器"}
            </p>
            <Button onClick={() => navigate("/practice/vocabulary")}>前往單字複習中心</Button>
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
                <Button variant="outline" onClick={() => navigate("/practice/vocabulary")}>
                  發現更多單字集
                </Button>
                <Button onClick={() => navigate("/practice/vocabulary/srs")}>
                  開始複習
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* How to Get More Packs */}
        <Card className="mt-6 bg-gradient-to-br from-accent/10 to-primary/10 border-accent/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-accent/20">
                <BookmarkPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">如何取得更多單字包？</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  單字包透過邀請碼領取：
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>參與我們的社群討論（Discord、Facebook 等）</li>
                  <li>從社群成員或管理員那裡取得邀請碼</li>
                  <li>點擊邀請連結（如 /claim/XXXX）即可領取</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VocabularyCollections;
