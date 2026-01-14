import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

// Hook to fetch all published blog posts
export function useBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('is_published', true)
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

// Hook to fetch a single blog post by slug
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
        const { data, error: fetchError } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('slug', slug)
          .eq('is_published', true)
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

// Hook to fetch related posts
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
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('is_published', true)
          .eq('category', category)
          .neq('id', postId)
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
