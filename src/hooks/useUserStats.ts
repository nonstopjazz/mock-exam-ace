import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface UserStats {
  streakDays: number;
  totalReviewCount: number;
  totalWordsLearned: number;
  lastStudyDate: string | null;
}

const DEFAULT_STATS: UserStats = {
  streakDays: 0,
  totalReviewCount: 0,
  totalWordsLearned: 0,
  lastStudyDate: null,
};

// localStorage key for non-logged-in users
const LOCAL_STORAGE_KEY = 'vocabulary-stats';

/**
 * Hook for managing user learning statistics
 * - Logged-in users: syncs with database (cross-device)
 * - Non-logged-in users: uses localStorage (local only)
 */
export function useUserStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch stats from database or localStorage
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (user) {
      // Logged-in user: fetch from database
      try {
        const { data, error: fetchError } = await supabase.rpc('get_user_stats');

        if (fetchError) {
          console.error('Error fetching user stats:', fetchError);
          setError(fetchError.message);
          setStats(DEFAULT_STATS);
          return;
        }

        if (data && data.success) {
          setStats({
            streakDays: data.streak_days || 0,
            totalReviewCount: data.total_review_count || 0,
            totalWordsLearned: data.total_words_learned || 0,
            lastStudyDate: data.last_study_date || null,
          });
        } else {
          // No stats yet, use defaults
          setStats(DEFAULT_STATS);
        }
      } catch (err) {
        console.error('Exception fetching user stats:', err);
        setError('載入統計失敗');
        setStats(DEFAULT_STATS);
      }
    } else {
      // Non-logged-in user: use localStorage
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Check if streak is still valid
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          if (parsed.lastStudyDate === today || parsed.lastStudyDate === yesterday) {
            setStats(parsed);
          } else {
            // Streak broken
            setStats({
              ...parsed,
              streakDays: 0,
            });
          }
        } else {
          setStats(DEFAULT_STATS);
        }
      } catch {
        setStats(DEFAULT_STATS);
      }
    }

    setLoading(false);
  }, [user]);

  // Update stats after a review session
  const recordReview = useCallback(async (
    reviewCount: number = 1,
    wordsLearned: number = 0
  ) => {
    if (user) {
      // Logged-in user: update in database
      try {
        const { data, error: updateError } = await supabase.rpc('update_user_streak', {
          p_review_count: reviewCount,
          p_words_learned: wordsLearned,
        });

        if (updateError) {
          console.error('Error updating user stats:', updateError);
          return { success: false, error: updateError.message };
        }

        if (data && data.success) {
          setStats({
            streakDays: data.streak_days || 0,
            totalReviewCount: data.total_review_count || 0,
            totalWordsLearned: data.total_words_learned || 0,
            lastStudyDate: new Date().toISOString().split('T')[0],
          });
          return { success: true, isNewDay: data.is_new_day };
        }

        return { success: false, error: 'UPDATE_FAILED' };
      } catch (err) {
        console.error('Exception updating user stats:', err);
        return { success: false, error: 'UPDATE_FAILED' };
      }
    } else {
      // Non-logged-in user: update localStorage
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let newStats: UserStats;

      if (stats.lastStudyDate === today) {
        // Already studied today
        newStats = {
          ...stats,
          totalReviewCount: stats.totalReviewCount + reviewCount,
          totalWordsLearned: Math.max(stats.totalWordsLearned, wordsLearned),
        };
      } else if (stats.lastStudyDate === yesterday) {
        // Continue streak
        newStats = {
          streakDays: stats.streakDays + 1,
          totalReviewCount: stats.totalReviewCount + reviewCount,
          totalWordsLearned: Math.max(stats.totalWordsLearned, wordsLearned),
          lastStudyDate: today,
        };
      } else {
        // Streak broken, start fresh
        newStats = {
          streakDays: 1,
          totalReviewCount: stats.totalReviewCount + reviewCount,
          totalWordsLearned: Math.max(stats.totalWordsLearned, wordsLearned),
          lastStudyDate: today,
        };
      }

      setStats(newStats);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newStats));

      return { success: true, isNewDay: stats.lastStudyDate !== today };
    }
  }, [user, stats]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    recordReview,
    refetch: fetchStats,
    isLoggedIn: !!user,
  };
}
