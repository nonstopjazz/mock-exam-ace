import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PackItemProgress {
  item_id: string;
  mastery_level: number;
  review_count: number;
  correct_count: number;
  next_review_at: string | null;
  last_review_at: string | null;
}

export interface PackStatistics {
  total: number;
  learned: number;
  mastered: number;
  review_due: number;
  total_reviews: number;
  accuracy: number;
}

export interface WeakWord {
  item_id: string;
  word: string;
  definition: string;
  mastery_level: number;
  review_count: number;
  correct_count: number;
  accuracy: number;
  last_review_at: string | null;
}

// Hook to update pack item progress
export function usePackItemProgress() {
  const { user } = useAuth();

  const updateProgress = useCallback(async (
    packId: string,
    itemId: string,
    isCorrect: boolean,
    response?: 'forgot' | 'hard' | 'easy'
  ) => {
    if (!user) {
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    try {
      const { data, error } = await supabase.rpc('update_pack_item_progress', {
        p_pack_id: packId,
        p_item_id: itemId,
        p_is_correct: isCorrect,
        p_response: response || null,
      });

      if (error) {
        console.error('Error updating progress:', error);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      console.error('Exception updating progress:', err);
      return { success: false, error: 'UPDATE_FAILED' };
    }
  }, [user]);

  return { updateProgress };
}

// Hook to get pack statistics
export function usePackStatistics(packId: string | null) {
  const { user } = useAuth();
  const [statistics, setStatistics] = useState<PackStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = useCallback(async () => {
    if (!packId || !user) {
      setStatistics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.rpc('get_pack_statistics', {
        p_pack_id: packId,
      });

      if (fetchError) {
        console.error('Error fetching statistics:', fetchError);
        setError(fetchError.message);
        setStatistics(null);
        return;
      }

      if (data && data.success) {
        setStatistics({
          total: data.total,
          learned: data.learned,
          mastered: data.mastered,
          review_due: data.review_due,
          total_reviews: data.total_reviews,
          accuracy: data.accuracy,
        });
      } else {
        setError(data?.error || 'FETCH_FAILED');
        setStatistics(null);
      }
    } catch (err) {
      console.error('Exception fetching statistics:', err);
      setError('FETCH_FAILED');
      setStatistics(null);
    } finally {
      setLoading(false);
    }
  }, [packId, user]);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  return { statistics, loading, error, refetch: fetchStatistics };
}

// Hook to get weak words for a pack
export function useWeakWords(packId: string | null, limit: number = 20) {
  const { user } = useAuth();
  const [weakWords, setWeakWords] = useState<WeakWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeakWords = useCallback(async () => {
    if (!packId || !user) {
      setWeakWords([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.rpc('get_weak_words', {
        p_pack_id: packId,
        p_limit: limit,
      });

      if (fetchError) {
        console.error('Error fetching weak words:', fetchError);
        setError(fetchError.message);
        setWeakWords([]);
        return;
      }

      setWeakWords(data || []);
    } catch (err) {
      console.error('Exception fetching weak words:', err);
      setError('FETCH_FAILED');
      setWeakWords([]);
    } finally {
      setLoading(false);
    }
  }, [packId, user, limit]);

  useEffect(() => {
    fetchWeakWords();
  }, [fetchWeakWords]);

  return { weakWords, loading, error, refetch: fetchWeakWords };
}

// Hook to get all progress for a pack's items
export function usePackItemsProgress(packId: string | null) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<Record<string, PackItemProgress>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!packId || !user) {
      setProgress({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('pack_item_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('pack_id', packId);

      if (fetchError) {
        console.error('Error fetching progress:', fetchError);
        setError(fetchError.message);
        setProgress({});
        return;
      }

      const progressMap: Record<string, PackItemProgress> = {};
      (data || []).forEach((item: any) => {
        progressMap[item.item_id] = {
          item_id: item.item_id,
          mastery_level: item.mastery_level,
          review_count: item.review_count,
          correct_count: item.correct_count,
          next_review_at: item.next_review_at,
          last_review_at: item.last_review_at,
        };
      });

      setProgress(progressMap);
    } catch (err) {
      console.error('Exception fetching progress:', err);
      setError('FETCH_FAILED');
      setProgress({});
    } finally {
      setLoading(false);
    }
  }, [packId, user]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { progress, loading, error, refetch: fetchProgress };
}
