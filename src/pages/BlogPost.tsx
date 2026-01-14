import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Share2,
  Bookmark,
  ChevronRight,
  Facebook,
  Twitter,
  Link as LinkIcon,
  Tag,
} from "lucide-react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { getBlogPostBySlug, getRelatedPosts, BLOG_CATEGORIES } from "@/data/mock-blog";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const post = slug ? getBlogPostBySlug(slug) : undefined;
  const relatedPosts = post ? getRelatedPosts(post.id, 3) : [];

  if (!post) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="mb-4 text-3xl font-bold">找不到文章</h1>
          <p className="mb-8 text-muted-foreground">這篇文章可能已經被移除或網址錯誤。</p>
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
    return BLOG_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId;
  };

  const handleShare = (platform: string) => {
    const url = window.location.href;
    const title = post.title;

    switch (platform) {
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, "_blank");
        break;
      case "copy":
        navigator.clipboard.writeText(url);
        toast.success("連結已複製！");
        break;
    }
  };

  const handleBookmark = () => {
    toast.success("文章已加入收藏！");
  };

  // Process markdown-like content to HTML
  const processContent = (content: string) => {
    return content
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold mt-8 mb-4 text-foreground">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-10 mb-6 text-foreground">$1</h2>')
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

                {/* Article Body */}
                <div
                  className="prose prose-lg max-w-none"
                  dangerouslySetInnerHTML={{ __html: processContent(post.content) }}
                />

                <Separator className="my-8" />

                {/* Share Section */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-medium">分享這篇文章：</p>
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
                    <Button variant="outline" size="icon" onClick={() => handleShare("copy")}>
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleBookmark}>
                      <Bookmark className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Sidebar - Desktop */}
              <aside className="hidden lg:block">
                <div className="sticky top-24 space-y-4">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => handleShare("copy")}
                  >
                    <Share2 className="h-4 w-4" />
                    分享文章
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleBookmark}
                  >
                    <Bookmark className="h-4 w-4" />
                    收藏文章
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
