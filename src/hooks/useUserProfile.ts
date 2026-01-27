import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { APP_PRODUCT, ProductType } from '@/config/product';

// 年級選項依產品類型
export const GRADE_OPTIONS: Record<ProductType, { value: string; label: string }[]> = {
  GSAT: [
    { value: '國一', label: '國一' },
    { value: '國二', label: '國二' },
    { value: '國三', label: '國三' },
    { value: '高一', label: '高一' },
    { value: '高二', label: '高二' },
    { value: '高三', label: '高三' },
    { value: '重考', label: '重考生' },
  ],
  TOEIC: [
    { value: '國一', label: '國一' },
    { value: '國二', label: '國二' },
    { value: '國三', label: '國三' },
    { value: '高一', label: '高一' },
    { value: '高二', label: '高二' },
    { value: '高三', label: '高三' },
    { value: '大學生', label: '大學生' },
    { value: '上班族', label: '上班族' },
    { value: '其他', label: '其他' },
  ],
  KIDS: [
    { value: '小班', label: '小班' },
    { value: '中班', label: '中班' },
    { value: '大班', label: '大班' },
    { value: '小一', label: '小一' },
    { value: '小二', label: '小二' },
    { value: '小三', label: '小三' },
    { value: '小四', label: '小四' },
    { value: '小五', label: '小五' },
    { value: '小六', label: '小六' },
  ],
};

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  product: string;
  grade: string | null;
  school: string | null;
  created_at: string;
  updated_at: string;
}

interface UseUserProfileResult {
  profile: UserProfile | null;
  hasProfile: boolean;
  loading: boolean;
  error: string | null;
  updateProfile: (data: {
    grade?: string;
    displayName?: string;
    school?: string;
  }) => Promise<boolean>;
  refetch: () => Promise<void>;
  gradeOptions: { value: string; label: string }[];
}

export function useUserProfile(): UseUserProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const gradeOptions = GRADE_OPTIONS[APP_PRODUCT] || GRADE_OPTIONS.GSAT;

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setHasProfile(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_user_profile');

      if (rpcError) {
        throw rpcError;
      }

      const result = data as {
        success: boolean;
        error?: string;
        has_profile: boolean;
        profile: UserProfile | null;
      };

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch profile');
      }

      setProfile(result.profile);
      setHasProfile(result.has_profile);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (data: {
      grade?: string;
      displayName?: string;
      school?: string;
    }): Promise<boolean> => {
      if (!user) {
        setError('NOT_AUTHENTICATED');
        return false;
      }

      try {
        setError(null);

        const { data: result, error: rpcError } = await supabase.rpc(
          'upsert_user_profile',
          {
            p_product: APP_PRODUCT.toLowerCase(),
            p_grade: data.grade || null,
            p_display_name: data.displayName || null,
            p_school: data.school || null,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        const response = result as {
          success: boolean;
          error?: string;
          profile: UserProfile;
        };

        if (!response.success) {
          throw new Error(response.error || 'Failed to update profile');
        }

        setProfile(response.profile);
        setHasProfile(true);
        return true;
      } catch (err) {
        console.error('Error updating user profile:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      }
    },
    [user]
  );

  return {
    profile,
    hasProfile,
    loading,
    error,
    updateProfile,
    refetch: fetchProfile,
    gradeOptions,
  };
}

// Admin hook for managing all users
interface AdminUser {
  id: string;
  email: string;
  registered_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  product: string | null;
  grade: string | null;
  school: string | null;
  profile_created_at: string | null;
  profile_updated_at: string | null;
}

interface UserStats {
  total_users: number;
  users_with_profile: number;
  grade_stats: { grade: string; count: number }[];
  product_stats: { product: string; count: number }[];
}

interface UseAdminUsersResult {
  users: AdminUser[];
  total: number;
  stats: UserStats | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  fetchUsers: (options?: {
    product?: string;
    grade?: string;
    limit?: number;
    offset?: number;
  }) => Promise<void>;
  fetchStats: () => Promise<void>;
  exportCSV: () => string;
}

export function useAdminUsers(): UseAdminUsersResult {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('is_admin');
        if (rpcError) {
          console.error('Error checking admin status:', rpcError);
          setIsAdmin(false);
          return;
        }
        setIsAdmin(data === true);
      } catch {
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, [user]);

  const fetchUsers = useCallback(
    async (options?: {
      product?: string;
      grade?: string;
      limit?: number;
      offset?: number;
    }) => {
      if (!isAdmin) {
        setError('UNAUTHORIZED');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: rpcError } = await supabase.rpc(
          'admin_get_all_users',
          {
            p_product: options?.product || null,
            p_grade: options?.grade || null,
            p_limit: options?.limit || 100,
            p_offset: options?.offset || 0,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        const result = data as {
          success: boolean;
          error?: string;
          users: AdminUser[];
          total: number;
        };

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch users');
        }

        setUsers(result.users || []);
        setTotal(result.total);
      } catch (err) {
        console.error('Error fetching users:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [isAdmin]
  );

  const fetchStats = useCallback(async () => {
    if (!isAdmin) {
      setError('UNAUTHORIZED');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc(
        'admin_get_user_stats'
      );

      if (rpcError) {
        throw rpcError;
      }

      const result = data as {
        success: boolean;
        error?: string;
      } & UserStats;

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch stats');
      }

      setStats({
        total_users: result.total_users,
        users_with_profile: result.users_with_profile,
        grade_stats: result.grade_stats || [],
        product_stats: result.product_stats || [],
      });
    } catch (err) {
      console.error('Error fetching user stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const exportCSV = useCallback(() => {
    if (users.length === 0) return '';

    const headers = [
      'Email',
      '顯示名稱',
      '產品',
      '年級',
      '學校',
      '註冊時間',
      '最後登入',
    ];

    const rows = users.map((u) => [
      u.email,
      u.display_name || '',
      u.product || '',
      u.grade || '',
      u.school || '',
      u.registered_at ? new Date(u.registered_at).toLocaleString('zh-TW') : '',
      u.last_sign_in_at
        ? new Date(u.last_sign_in_at).toLocaleString('zh-TW')
        : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return csvContent;
  }, [users]);

  return {
    users,
    total,
    stats,
    loading,
    error,
    isAdmin,
    fetchUsers,
    fetchStats,
    exportCSV,
  };
}
