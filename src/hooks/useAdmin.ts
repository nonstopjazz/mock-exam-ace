import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface UseAdminResult {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  clearCache: () => void;
}

// Cache duration: 5 minutes
const CACHE_DURATION_MS = 5 * 60 * 1000;

interface AdminCache {
  userId: string;
  isAdmin: boolean;
  timestamp: number;
}

// Module-level cache (shared across hook instances)
let adminCache: AdminCache | null = null;

export function clearAdminCache() {
  adminCache = null;
}

export function useAdmin(): UseAdminResult {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    async function checkAdminStatus() {
      if (authLoading) return;

      // User logged out - clear cache and state
      if (!user) {
        if (lastUserId.current !== null) {
          clearAdminCache();
        }
        lastUserId.current = null;
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Check if we have a valid cache
      const now = Date.now();
      if (
        adminCache &&
        adminCache.userId === user.id &&
        now - adminCache.timestamp < CACHE_DURATION_MS
      ) {
        setIsAdmin(adminCache.isAdmin);
        setLoading(false);
        lastUserId.current = user.id;
        return;
      }

      // Query database
      try {
        const { data, error: queryError } = await supabase
          .from('app_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .single();

        if (queryError && queryError.code !== 'PGRST116') {
          // PGRST116 = no rows found (not an error for our use case)
          setError(queryError.message);
          setIsAdmin(false);
        } else {
          const isAdminResult = !!data;
          setIsAdmin(isAdminResult);

          // Update cache
          adminCache = {
            userId: user.id,
            isAdmin: isAdminResult,
            timestamp: now,
          };
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsAdmin(false);
      } finally {
        lastUserId.current = user.id;
        setLoading(false);
      }
    }

    checkAdminStatus();
  }, [user, authLoading]);

  return {
    isAdmin,
    loading: loading || authLoading,
    error,
    clearCache: clearAdminCache,
  };
}
