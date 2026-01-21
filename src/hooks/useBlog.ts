import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { APP_PRODUCT } from '@/config/product';

// Types matching the DB schema
export interface BlogCategory {
  id: string;
  label: string;
  sort_order: number;
}

export interface BlogPostDB {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  author_name: string;
  author_avatar: string | null;
  author_email: string | null;
  category: string;
  tags: string[];
  product_tags: string[]; // 產品標籤：gsat, toeic, kids, general
  published_at: string | null;
  read_time: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  og_image: string | null;
}

// Frontend-compatible type (matching mock-blog.ts interface)
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: {
    name: string;
    avatar: string;
  };
  category: string;
  tags: string[];
  publishedAt: string;
  readTime: number;
  // SEO fields (optional)
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  ogImage?: string;
}

// Transform DB row to frontend format
function transformPost(dbPost: BlogPostDB): BlogPost {
  return {
    id: dbPost.id,
    slug: dbPost.slug,
    title: dbPost.title,
    excerpt: dbPost.excerpt || '',
    content: dbPost.content,
    coverImage: dbPost.cover_image || '/placeholder.svg',
    author: {
      name: dbPost.author_name,
      avatar: dbPost.author_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=joe',
    },
    category: dbPost.category,
    tags: dbPost.tags || [],
    publishedAt: dbPost.published_at || dbPost.created_at,
    readTime: dbPost.read_time || 5,
    seoTitle: dbPost.seo_title || undefined,
    seoDescription: dbPost.seo_description || undefined,
    seoKeywords: dbPost.seo_keywords || undefined,
    ogImage: dbPost.og_image || undefined,
  };
}

// Hook to fetch all published blog posts (filtered by current product)
export function useBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 取得目前產品的標籤（小寫）
      const productTag = APP_PRODUCT.toLowerCase();

      const { data, error: fetchError } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('is_published', true)
        .or(`product_tags.cs.{${productTag}},product_tags.cs.{general}`)
        .order('published_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching blog posts:', fetchError);
        setError(fetchError.message);
        setPosts([]);
        return;
      }

      const transformedPosts = (data || []).map(transformPost);
      setPosts(transformedPosts);
    } catch (err) {
      console.error('Exception fetching blog posts:', err);
      setError('載入文章失敗');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, error, refetch: fetchPosts };
}

// Hook to fetch a single blog post by slug (filtered by current product)
export function useBlogPost(slug: string | undefined) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    const fetchPost = async () => {
      setLoading(true);
      setError(null);

      try {
        const productTag = APP_PRODUCT.toLowerCase();

        const { data, error: fetchError } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('slug', slug)
          .eq('is_published', true)
          .or(`product_tags.cs.{${productTag}},product_tags.cs.{general}`)
          .single();

        if (fetchError) {
          console.error('Error fetching blog post:', fetchError);
          setError('找不到此文章');
          setPost(null);
          return;
        }

        setPost(transformPost(data));
      } catch (err) {
        console.error('Exception fetching blog post:', err);
        setError('載入文章失敗');
        setPost(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  return { post, loading, error };
}

// Hook to fetch related posts (filtered by current product)
export function useRelatedPosts(postId: string | undefined, category: string | undefined, limit: number = 3) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId || !category) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const fetchRelated = async () => {
      setLoading(true);

      try {
        const productTag = APP_PRODUCT.toLowerCase();

        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('is_published', true)
          .eq('category', category)
          .neq('id', postId)
          .or(`product_tags.cs.{${productTag}},product_tags.cs.{general}`)
          .order('published_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('Error fetching related posts:', error);
          setPosts([]);
          return;
        }

        setPosts((data || []).map(transformPost));
      } catch (err) {
        console.error('Exception fetching related posts:', err);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRelated();
  }, [postId, category, limit]);

  return { posts, loading };
}

// Hook to fetch blog categories
export function useBlogCategories() {
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('blog_categories')
          .select('*')
          .order('sort_order', { ascending: true });

        if (error) {
          console.error('Error fetching categories:', error);
          setCategories([]);
          return;
        }

        setCategories(data || []);
      } catch (err) {
        console.error('Exception fetching categories:', err);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  // Add "all" option for frontend filtering
  const categoriesWithAll = [
    { id: 'all', label: '全部', sort_order: 0 },
    ...categories,
  ];

  return { categories: categoriesWithAll, loading };
}

// Admin hook for CRUD operations
export function useBlogAdmin() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<BlogPostDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all posts (including drafts) for admin
  const fetchAllPosts = useCallback(async () => {
    if (!user) {
      setPosts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('blog_posts')
        .select('*')
        .order('updated_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching admin posts:', fetchError);
        setError(fetchError.message);
        setPosts([]);
        return;
      }

      setPosts(data || []);
    } catch (err) {
      console.error('Exception fetching admin posts:', err);
      setError('載入文章失敗');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAllPosts();
  }, [fetchAllPosts]);

  // Create new post
  const createPost = async (post: Partial<BlogPostDB>) => {
    if (!user) return { error: 'Not authenticated', data: null };

    const { data, error } = await supabase
      .from('blog_posts')
      .insert([{
        ...post,
        author_email: user.email,
      }])
      .select()
      .single();

    if (error) {
      return { error: error.message, data: null };
    }

    setPosts(prev => [data, ...prev]);
    return { error: null, data };
  };

  // Update existing post
  const updatePost = async (id: string, updates: Partial<BlogPostDB>) => {
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('blog_posts')
      .update(updates)
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    setPosts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    return { error: null };
  };

  // Delete post
  const deletePost = async (id: string) => {
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    setPosts(prev => prev.filter(p => p.id !== id));
    return { error: null };
  };

  // Toggle publish status
  const togglePublish = async (id: string, isPublished: boolean) => {
    const updates: Partial<BlogPostDB> = {
      is_published: isPublished,
    };

    // Set published_at when publishing for the first time
    if (isPublished) {
      const post = posts.find(p => p.id === id);
      if (post && !post.published_at) {
        updates.published_at = new Date().toISOString();
      }
    }

    return updatePost(id, updates);
  };

  // Upload image to storage
  const uploadImage = async (file: File, folder: string = 'posts'): Promise<{ url: string | null; error: string | null }> => {
    if (!user) return { url: null, error: 'Not authenticated' };

    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('blog-images')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { url: null, error: uploadError.message };
    }

    const { data: { publicUrl } } = supabase.storage
      .from('blog-images')
      .getPublicUrl(fileName);

    return { url: publicUrl, error: null };
  };

  return {
    posts,
    loading,
    error,
    refetch: fetchAllPosts,
    createPost,
    updatePost,
    deletePost,
    togglePublish,
    uploadImage,
  };
}

// Calculate read time based on content length
export function calculateReadTime(content: string): number {
  // Approximately 500 Chinese characters per minute
  return Math.max(1, Math.ceil(content.length / 500));
}

// =============================================
// Statistics Types
// =============================================

export interface BlogPostStats {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  category: string;
  createdAt: string;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  bookmarkCount: number;
  commentCount: number;
  shareCount: number;
}

export interface BlogOverviewStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  totalViews: number;
  totalLikes: number;
  totalBookmarks: number;
  totalComments: number;
  totalShares: number;
  categoryBreakdown: { category: string; count: number }[];
  topPosts: BlogPostStats[];
}

// =============================================
// Hook: useBlogStats - 文章統計
// =============================================

export function useBlogStats() {
  const [stats, setStats] = useState<BlogOverviewStats | null>(null);
  const [postStats, setPostStats] = useState<BlogPostStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch post stats from view
      const { data: statsData, error: statsError } = await supabase
        .from('blog_post_stats')
        .select('*')
        .order('view_count', { ascending: false });

      if (statsError) {
        console.error('Error fetching blog stats:', statsError);
        setError(statsError.message);
        return;
      }

      const transformedStats: BlogPostStats[] = (statsData || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        isPublished: s.is_published,
        category: s.category,
        createdAt: s.created_at,
        publishedAt: s.published_at,
        viewCount: s.view_count || 0,
        likeCount: s.like_count || 0,
        bookmarkCount: s.bookmark_count || 0,
        commentCount: s.comment_count || 0,
        shareCount: s.share_count || 0,
      }));

      setPostStats(transformedStats);

      // Calculate overview stats
      const published = transformedStats.filter(p => p.isPublished);
      const drafts = transformedStats.filter(p => !p.isPublished);

      // Category breakdown
      const categoryMap = new Map<string, number>();
      transformedStats.forEach(p => {
        categoryMap.set(p.category, (categoryMap.get(p.category) || 0) + 1);
      });
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, count]) => ({
        category,
        count,
      }));

      const overview: BlogOverviewStats = {
        totalPosts: transformedStats.length,
        publishedPosts: published.length,
        draftPosts: drafts.length,
        totalViews: transformedStats.reduce((sum, p) => sum + p.viewCount, 0),
        totalLikes: transformedStats.reduce((sum, p) => sum + p.likeCount, 0),
        totalBookmarks: transformedStats.reduce((sum, p) => sum + p.bookmarkCount, 0),
        totalComments: transformedStats.reduce((sum, p) => sum + p.commentCount, 0),
        totalShares: transformedStats.reduce((sum, p) => sum + p.shareCount, 0),
        categoryBreakdown,
        topPosts: transformedStats.slice(0, 5),
      };

      setStats(overview);
    } catch (err) {
      console.error('Exception fetching blog stats:', err);
      setError('載入統計失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, postStats, loading, error, refetch: fetchStats };
}

// =============================================
// Hook: useBlogInteractions - 文章互動功能
// =============================================

export function useBlogInteractions(postId: string | undefined) {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch current user's interaction status
  useEffect(() => {
    if (!postId) {
      setLoading(false);
      return;
    }

    const fetchInteractionStatus = async () => {
      setLoading(true);

      // Get like count
      const { count: likes } = await supabase
        .from('blog_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      setLikeCount(likes || 0);

      // Check if current user liked/bookmarked
      if (user) {
        const { data: likeData } = await supabase
          .from('blog_likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .single();

        setIsLiked(!!likeData);

        const { data: bookmarkData } = await supabase
          .from('blog_bookmarks')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .single();

        setIsBookmarked(!!bookmarkData);
      }

      setLoading(false);
    };

    fetchInteractionStatus();
  }, [postId, user]);

  // Record page view
  const recordView = useCallback(async () => {
    if (!postId) return;

    await supabase.from('blog_page_views').insert({
      post_id: postId,
      user_id: user?.id || null,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    });
  }, [postId, user]);

  // Toggle like
  const toggleLike = useCallback(async () => {
    if (!postId || !user) return { error: '請先登入' };

    if (isLiked) {
      // Unlike
      const { error } = await supabase
        .from('blog_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (!error) {
        setIsLiked(false);
        setLikeCount(prev => Math.max(0, prev - 1));
      }
      return { error: error?.message || null };
    } else {
      // Like
      const { error } = await supabase
        .from('blog_likes')
        .insert({ post_id: postId, user_id: user.id });

      if (!error) {
        setIsLiked(true);
        setLikeCount(prev => prev + 1);
      }
      return { error: error?.message || null };
    }
  }, [postId, user, isLiked]);

  // Toggle bookmark
  const toggleBookmark = useCallback(async () => {
    if (!postId || !user) return { error: '請先登入' };

    if (isBookmarked) {
      // Remove bookmark
      const { error } = await supabase
        .from('blog_bookmarks')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (!error) {
        setIsBookmarked(false);
      }
      return { error: error?.message || null, removed: true };
    } else {
      // Add bookmark
      const { error } = await supabase
        .from('blog_bookmarks')
        .insert({ post_id: postId, user_id: user.id });

      if (!error) {
        setIsBookmarked(true);
      }
      return { error: error?.message || null, removed: false };
    }
  }, [postId, user, isBookmarked]);

  // Record share
  const recordShare = useCallback(async (platform: string) => {
    if (!postId) return;

    await supabase.from('blog_shares').insert({
      post_id: postId,
      user_id: user?.id || null,
      platform,
    });
  }, [postId, user]);

  return {
    isLiked,
    isBookmarked,
    likeCount,
    loading,
    recordView,
    toggleLike,
    toggleBookmark,
    recordShare,
  };
}

// =============================================
// Hook: useUserBookmarks - 使用者收藏清單
// =============================================

export function useUserBookmarks() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBookmarks([]);
      setLoading(false);
      return;
    }

    const fetchBookmarks = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('blog_bookmarks')
        .select(`
          post_id,
          blog_posts (*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching bookmarks:', error);
        setBookmarks([]);
      } else {
        const posts = (data || [])
          .map((b: any) => b.blog_posts)
          .filter(Boolean)
          .map(transformPost);
        setBookmarks(posts);
      }

      setLoading(false);
    };

    fetchBookmarks();
  }, [user]);

  return { bookmarks, loading };
}
