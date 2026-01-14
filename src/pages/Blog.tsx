import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, Search, User, ChevronRight, BookOpen, TrendingUp, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useBlogPosts, useBlogCategories, BlogPost } from "@/hooks/useBlog";

const Blog = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Fetch real data from Supabase
  const { posts: allPosts, loading: postsLoading, error: postsError } = useBlogPosts();
  const { categories, loading: categoriesLoading } = useBlogCategories();

  // Filter posts based on search and category
  const filteredPosts = useMemo(() => {
    return allPosts.filter((post) => {
      const matchesSearch =
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = selectedCategory === "all" || post.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [allPosts, searchQuery, selectedCategory]);

  // Featured post (first post)
  const featuredPost = allPosts[0];
  const remainingPosts = filteredPosts.filter((post) => featuredPost && post.id !== featuredPost.id);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getCategoryLabel = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.label || categoryId;
  };

  // Loading state
  if (postsLoading || categoriesLoading) {
    return (
      <Layout>
        <section className="relative bg-gradient-to-br from-primary/10 via-secondary/5 to-background py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <Skeleton className="mx-auto mb-4 h-6 w-32" />
              <Skeleton className="mx-auto mb-6 h-12 w-3/4" />
              <Skeleton className="mx-auto mb-8 h-6 w-2/3" />
            </div>
          </div>
        </section>
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-video w-full" />
                  <CardHeader>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-full" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  // Error state
  if (postsError) {
    return (
      <Layout>
        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h1 className="mb-4 text-2xl font-bold">載入失敗</h1>
            <p className="text-muted-foreground">{postsError}</p>
          </div>
        </section>
      </Layout>
    );
  }

  // Empty state (no posts in database)
  if (allPosts.length === 0) {
    return (
      <Layout>
        <section className="relative bg-gradient-to-br from-primary/10 via-secondary/5 to-background py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="secondary" className="mb-4">
                <BookOpen className="mr-1 h-3 w-3" />
                學測英文學習專欄
              </Badge>
              <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                學習<span className="gradient-text">技巧</span>與
                <span className="gradient-text">攻略</span>
              </h1>
              <p className="mb-8 text-lg text-muted-foreground md:text-xl">
                文章即將推出，敬請期待！
              </p>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary/10 via-secondary/5 to-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              <BookOpen className="mr-1 h-3 w-3" />
              學測英文學習專欄
            </Badge>
            <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              學習<span className="gradient-text">技巧</span>與
              <span className="gradient-text">攻略</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground md:text-xl">
              探索有效的學習方法、單字記憶技巧、文法解析和應考策略，
              幫助你在學測英文拿到理想成績。
            </p>

            {/* Search Bar */}
            <div className="relative mx-auto max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜尋文章..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute left-4 top-20 h-20 w-20 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-32 w-32 rounded-full bg-secondary/10 blur-3xl" />
      </section>

      {/* Category Tabs */}
      <section className="border-b bg-card/50">
        <div className="container mx-auto px-4">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="h-auto w-full justify-start gap-2 rounded-none border-0 bg-transparent p-0 py-4 overflow-x-auto flex-nowrap">
              {categories.map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
                >
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </section>

      {/* Featured Post */}
      {selectedCategory === "all" && !searchQuery && featuredPost && (
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="mb-6 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">精選文章</h2>
            </div>

            <Card
              className="group cursor-pointer overflow-hidden border-2 transition-all hover:border-primary hover:shadow-xl"
              onClick={() => navigate(`/blog/${featuredPost.slug}`)}
            >
              <div className="grid md:grid-cols-2">
                {/* Image */}
                <div className="relative aspect-video md:aspect-auto overflow-hidden">
                  <img
                    src={featuredPost.coverImage}
                    alt={featuredPost.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent md:bg-gradient-to-r" />
                  <Badge className="absolute left-4 top-4 bg-primary">
                    {getCategoryLabel(featuredPost.category)}
                  </Badge>
                </div>

                {/* Content */}
                <div className="flex flex-col justify-center p-6 md:p-8">
                  <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(featuredPost.publishedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {featuredPost.readTime} 分鐘閱讀
                    </span>
                  </div>

                  <h3 className="mb-4 text-2xl font-bold transition-colors group-hover:text-primary md:text-3xl">
                    {featuredPost.title}
                  </h3>

                  <p className="mb-6 line-clamp-3 text-muted-foreground">
                    {featuredPost.excerpt}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={featuredPost.author.avatar}
                        alt={featuredPost.author.name}
                        className="h-8 w-8 rounded-full"
                      />
                      <span className="text-sm font-medium">{featuredPost.author.name}</span>
                    </div>

                    <Button variant="ghost" className="gap-1">
                      閱讀更多
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* Blog Posts Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {selectedCategory === "all" && !searchQuery && (
            <h2 className="mb-8 text-xl font-semibold">最新文章</h2>
          )}

          {filteredPosts.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-lg text-muted-foreground">找不到符合條件的文章</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
              >
                清除篩選條件
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(selectedCategory === "all" && !searchQuery ? remainingPosts : filteredPosts).map(
                (post) => (
                  <BlogPostCard
                    key={post.id}
                    post={post}
                    onClick={() => navigate(`/blog/${post.slug}`)}
                    getCategoryLabel={getCategoryLabel}
                    formatDate={formatDate}
                  />
                )
              )}
            </div>
          )}
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="bg-gradient-to-br from-primary to-secondary py-16 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold">訂閱學習電子報</h2>
          <p className="mb-8 text-lg opacity-90">
            每週收到最新的學習技巧、單字攻略和備考資訊
          </p>
          <div className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
            <Input
              placeholder="輸入你的 Email"
              type="email"
              className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/60"
            />
            <Button variant="secondary" className="whitespace-nowrap">
              立即訂閱
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
};

// Blog Post Card Component
interface BlogPostCardProps {
  post: BlogPost;
  onClick: () => void;
  getCategoryLabel: (categoryId: string) => string;
  formatDate: (dateString: string) => string;
}

const BlogPostCard = ({ post, onClick, getCategoryLabel, formatDate }: BlogPostCardProps) => {
  return (
    <Card
      className="group cursor-pointer overflow-hidden border-2 transition-all hover:border-primary hover:shadow-lg"
      onClick={onClick}
    >
      {/* Cover Image */}
      <div className="relative aspect-video overflow-hidden">
        <img
          src={post.coverImage}
          alt={post.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <Badge className="absolute left-3 top-3">{getCategoryLabel(post.category)}</Badge>
      </div>

      <CardHeader className="pb-2">
        {/* Meta */}
        <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(post.publishedAt)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {post.readTime} 分鐘
          </span>
        </div>

        <CardTitle className="line-clamp-2 text-lg transition-colors group-hover:text-primary">
          {post.title}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <CardDescription className="line-clamp-2">{post.excerpt}</CardDescription>

        {/* Tags */}
        <div className="mt-4 flex flex-wrap gap-1">
          {post.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Author */}
        <div className="mt-4 flex items-center gap-2 border-t pt-4">
          <img src={post.author.avatar} alt={post.author.name} className="h-6 w-6 rounded-full" />
          <span className="text-sm text-muted-foreground">{post.author.name}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default Blog;
