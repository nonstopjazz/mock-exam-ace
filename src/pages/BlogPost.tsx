import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Share2,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Facebook,
  Twitter,
  Link as LinkIcon,
  Tag,
  AlertCircle,
  Heart,
} from "lucide-react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import { useBlogPost, useRelatedPosts, useBlogCategories, useBlogInteractions } from "@/hooks/useBlog";
import { useAuth } from "@/contexts/AuthContext";
import { TableOfContents } from "@/components/blog/TableOfContents";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch post data from Supabase
  const { post, loading: postLoading, error: postError } = useBlogPost(slug);
  const { posts: relatedPosts, loading: relatedLoading } = useRelatedPosts(post?.id, post?.category, 3);
  const { categories } = useBlogCategories();

  // Interaction hooks
  const {
    isLiked,
    isBookmarked,
    likeCount,
    recordView,
    toggleLike,
    toggleBookmark,
    recordShare,
  } = useBlogInteractions(post?.id);

  // Record page view when post loads
  useEffect(() => {
    if (post?.id) {
      recordView();
    }
  }, [post?.id, recordView]);

  // SEO meta tags
  useEffect(() => {
    if (!post) return;

    const title = post.seoTitle || post.title;
    const description = post.seoDescription || post.excerpt;
    const image = post.ogImage || post.coverImage;
    const url = window.location.href;

    // Update document title
    document.title = `${title} | 學測英文學習`;

    // Helper to create/update meta tag
    const setMeta = (name: string, content: string, property?: boolean) => {
      const attr = property ? 'property' : 'name';
      let tag = document.querySelector(`meta[${attr}="${name}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    // Basic meta tags
    setMeta('description', description);
    if (post.seoKeywords?.length) {
      setMeta('keywords', post.seoKeywords.join(', '));
    }

    // Open Graph
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', 'article', true);
    setMeta('og:url', url, true);
    if (image) {
      setMeta('og:image', image, true);
    }

    // Twitter Card
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    if (image) {
      setMeta('twitter:image', image);
    }

    // Cleanup on unmount
    return () => {
      document.title = '學測英文學習';
    };
  }, [post]);

  // Loading state
  if (postLoading) {
    return (
      <Layout>
        <header className="relative">
          <Skeleton className="h-[40vh] min-h-[300px] w-full" />
          <div className="container mx-auto px-4">
            <div className="relative -mt-32 md:-mt-40">
              <Card className="mx-auto max-w-4xl border-2 shadow-xl">
                <CardHeader className="space-y-4 pb-4">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-6 w-1/2" />
                </CardHeader>
              </Card>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-12">
          <div className="mx-auto max-w-4xl">
            <Card className="p-6 md:p-8 lg:p-10">
              <Skeleton className="mb-4 h-6 w-full" />
              <Skeleton className="mb-4 h-6 w-full" />
              <Skeleton className="mb-4 h-6 w-3/4" />
              <Skeleton className="mb-4 h-6 w-full" />
              <Skeleton className="h-6 w-1/2" />
            </Card>
          </div>
        </div>
      </Layout>
    );
  }

  // Error or not found state
  if (postError || !post) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h1 className="mb-4 text-3xl font-bold">找不到文章</h1>
          <p className="mb-8 text-muted-foreground">
            {postError || "這篇文章可能已經被移除或網址錯誤。"}
          </p>
          <Button onClick={() => navigate("/blog")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回部落格
          </Button>
        </div>
      </Layout>
    );
  }

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

  const handleShare = async (platform: string) => {
    const url = window.location.href;
    const title = post.title;

    // Record share in database
    recordShare(platform);

    switch (platform) {
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, "_blank");
        break;
      case "threads":
        window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(title + "\n\n" + url)}`, "_blank");
        break;
      case "copy":
        navigator.clipboard.writeText(url);
        toast.success("連結已複製！");
        break;
    }
  };

  const handleLike = async () => {
    if (!user) {
      toast.error("請先登入才能按喜歡");
      return;
    }
    const result = await toggleLike();
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(isLiked ? "已取消喜歡" : "已加入喜歡！");
    }
  };

  const handleBookmark = async () => {
    if (!user) {
      toast.error("請先登入才能收藏文章");
      return;
    }
    const result = await toggleBookmark();
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.removed ? "已取消收藏" : "文章已加入收藏！");
    }
  };

  // Generate slug for heading IDs
  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  // Process markdown-like content to HTML
  const processContent = (content: string) => {
    return content
      // Headers with IDs for TOC anchor links
      .replace(/^### (.+)$/gm, (_match, text) => {
        const id = generateSlug(text);
        return `<h3 id="${id}" class="text-xl font-bold mt-8 mb-4 text-foreground scroll-mt-24">${text}</h3>`;
      })
      .replace(/^## (.+)$/gm, (_match, text) => {
        const id = generateSlug(text);
        return `<h2 id="${id}" class="text-2xl font-bold mt-10 mb-6 text-foreground scroll-mt-24">${text}</h2>`;
      })
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
      // Lists
      .replace(/^- (.+)$/gm, '<li class="ml-6 mb-2 list-disc">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-6 mb-2 list-decimal">$2</li>')
      // Blockquotes
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary pl-4 py-2 my-4 bg-primary/5 rounded-r-lg italic">$1</blockquote>')
      // Code inline
      .replace(/`(.+?)`/g, '<code class="bg-muted px-2 py-1 rounded text-sm font-mono">$1</code>')
      // Tables (basic)
      .replace(/\| (.+) \|/g, (match) => {
        const cells = match.split("|").filter((c) => c.trim());
        const isHeader = cells[0].includes("---");
        if (isHeader) return "";
        return `<tr class="border-b">${cells.map((c) => `<td class="px-4 py-2">${c.trim()}</td>`).join("")}</tr>`;
      })
      // Images
      .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" class="rounded-lg my-6 w-full" />')
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>')
      // Paragraphs
      .replace(/^(?!<[hblitao]|$)(.+)$/gm, '<p class="mb-4 leading-relaxed text-muted-foreground">$1</p>')
      // Clean up empty lines
      .replace(/<p class="mb-4 leading-relaxed text-muted-foreground"><\/p>/g, "");
  };

  return (
    <Layout>
      {/* Article Header */}
      <article>
        {/* Hero Section */}
        <header className="relative">
          {/* Cover Image */}
          <div className="relative h-[40vh] min-h-[300px] md:h-[50vh]">
            <img
              src={post.coverImage}
              alt={post.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>

          {/* Content Overlay */}
          <div className="container mx-auto px-4">
            <div className="relative -mt-32 md:-mt-40">
              <Card className="mx-auto max-w-4xl border-2 shadow-xl">
                <CardHeader className="space-y-4 pb-4">
                  {/* Back Button & Category */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/blog")}
                      className="gap-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      返回部落格
                    </Button>
                    <Badge>{getCategoryLabel(post.category)}</Badge>
                  </div>

                  {/* Title */}
                  <h1 className="text-3xl font-bold leading-tight md:text-4xl lg:text-5xl">
                    {post.title}
                  </h1>

                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <img
                        src={post.author.avatar}
                        alt={post.author.name}
                        className="h-10 w-10 rounded-full border-2 border-primary"
                      />
                      <div>
                        <p className="font-medium text-foreground">{post.author.name}</p>
                        <p className="text-xs">作者</p>
                      </div>
                    </div>

                    <Separator orientation="vertical" className="h-8" />

                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(post.publishedAt)}
                    </div>

                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {post.readTime} 分鐘閱讀
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    {post.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>
        </header>

        {/* Article Content */}
        <div className="container mx-auto px-4 py-12">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-8 lg:grid-cols-[1fr,200px]">
              {/* Main Content */}
              <Card className="p-6 md:p-8 lg:p-10">
                {/* Excerpt */}
                <p className="mb-8 text-lg font-medium leading-relaxed text-foreground/80 border-l-4 border-primary pl-4">
                  {post.excerpt}
                </p>

                <Separator className="mb-8" />

                {/* Table of Contents */}
                <TableOfContents content={post.content} />

                {/* Article Body */}
                <div
                  className="prose prose-lg max-w-none"
                  dangerouslySetInnerHTML={{ __html: processContent(post.content) }}
                />

                <Separator className="my-8" />

                {/* Share Section */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <Button
                      variant={isLiked ? "default" : "outline"}
                      size="sm"
                      onClick={handleLike}
                      className={`gap-2 ${isLiked ? "bg-red-500 hover:bg-red-600" : "hover:text-red-500"}`}
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                      <span>{likeCount}</span>
                    </Button>
                    <p className="font-medium text-muted-foreground">分享這篇文章：</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleShare("facebook")}
                      className="hover:bg-[#1877F2] hover:text-white"
                    >
                      <Facebook className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleShare("twitter")}
                      className="hover:bg-[#1DA1F2] hover:text-white"
                    >
                      <Twitter className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleShare("threads")}
                      className="hover:bg-black hover:text-white"
                      title="分享到 Threads"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.17.408-2.243 1.33-3.023.88-.744 2.121-1.158 3.476-1.155l.014.002c.987.009 1.675.097 2.29.304v-1.067c-.003-.018-.003-.095-.003-.181v-.164c-.01-1.166-.095-1.94-.593-2.502-.478-.54-1.27-.784-2.354-.764-1.617.028-2.65.904-3.063 2.603l-2.004-.47c.58-2.661 2.453-4.153 5.084-4.193 1.608-.032 2.934.396 3.838 1.24.929.869 1.35 2.115 1.35 4.03v.182c0 .058.003.115.003.173.363.073.706.17 1.032.293 1.212.456 2.173 1.209 2.783 2.177.654 1.037.915 2.378.715 3.665-.227 1.465-.89 2.712-1.97 3.708-1.19 1.098-2.773 1.8-4.854 2.153-.528.09-1.095.133-1.698.133Zm-.422-8.024c-.373.003-.696.038-.965.104-.792.193-1.268.622-1.298 1.17-.022.392.142.71.487.946.394.27.937.41 1.57.38.896-.047 1.57-.376 2.005-.98.346-.48.576-1.14.688-1.965-.7-.215-1.498-.34-2.457-.355l-.03.001Z"/>
                      </svg>
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleShare("copy")}>
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={isBookmarked ? "default" : "outline"}
                      size="icon"
                      onClick={handleBookmark}
                      className={isBookmarked ? "bg-yellow-500 hover:bg-yellow-600" : ""}
                    >
                      {isBookmarked ? (
                        <BookmarkCheck className="h-4 w-4" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Sidebar - Desktop */}
              <aside className="hidden lg:block">
                <div className="sticky top-24 space-y-4">
                  <Button
                    variant={isLiked ? "default" : "outline"}
                    className={`w-full justify-start gap-2 ${isLiked ? "bg-red-500 hover:bg-red-600" : ""}`}
                    onClick={handleLike}
                  >
                    <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                    喜歡 ({likeCount})
                  </Button>
                  <Button
                    variant={isBookmarked ? "default" : "outline"}
                    className={`w-full justify-start gap-2 ${isBookmarked ? "bg-yellow-500 hover:bg-yellow-600" : ""}`}
                    onClick={handleBookmark}
                  >
                    {isBookmarked ? (
                      <BookmarkCheck className="h-4 w-4" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                    {isBookmarked ? "已收藏" : "收藏文章"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => handleShare("copy")}
                  >
                    <Share2 className="h-4 w-4" />
                    分享文章
                  </Button>
                </div>
              </aside>
            </div>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="bg-muted/30 py-16">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-4xl">
                <h2 className="mb-8 text-2xl font-bold">相關文章</h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedPosts.map((relatedPost) => (
                    <Link key={relatedPost.id} to={`/blog/${relatedPost.slug}`}>
                      <Card className="group h-full cursor-pointer overflow-hidden transition-all hover:border-primary hover:shadow-lg">
                        <div className="relative aspect-video overflow-hidden">
                          <img
                            src={relatedPost.coverImage}
                            alt={relatedPost.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                        <CardHeader className="pb-2">
                          <CardTitle className="line-clamp-2 text-base transition-colors group-hover:text-primary">
                            {relatedPost.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {relatedPost.readTime} 分鐘閱讀
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="py-16">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-4 text-2xl font-bold">開始你的學習之旅</h2>
            <p className="mb-8 text-muted-foreground">
              立即使用 SRS 智慧複習系統，高效記憶學測高頻單字
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" onClick={() => navigate("/practice/vocabulary")}>
                開始練習單字
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/blog")}>
                瀏覽更多文章
              </Button>
            </div>
          </div>
        </section>
      </article>
    </Layout>
  );
};

export default BlogPost;
