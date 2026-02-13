import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getSiteId } from '@/hooks/useSiteIdentifier';

export interface PackItem {
  id: string;
  pack_id: string;
  word: string;
  definition: string | null;
  part_of_speech: string | null;
  example_sentence: string | null;
  phonetic: string | null;
  sort_order: number;
  audio_url: string | null;
  example_audio_url: string | null;
}

export interface UserPack {
  id: string;
  pack_id: string;
  title: string;
  description: string | null;
  theme: string | null;
  skill_type: string | null;
  difficulty: string | null;
  word_count: number;
  progress: number;
  claimed_at: string;
  last_studied_at: string | null;
  cover_image_url: string | null;
}

export interface PackWithItems extends UserPack {
  items: PackItem[];
}

export function useUserPacks() {
  const { user } = useAuth();
  const [packs, setPacks] = useState<UserPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPacks = useCallback(async () => {
    if (!user) {
      setPacks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 取得當前站點
      const currentSite = getSiteId();

      // Fetch user's claimed packs with pack details (filtered by site)
      const { data, error: fetchError } = await supabase
        .from('user_pack_claims')
        .select(`
          id,
          progress,
          claimed_at,
          last_studied_at,
          site,
          pack:packs (
            id,
            title,
            description,
            theme,
            skill_type,
            difficulty
          )
        `)
        .eq('user_id', user.id)
        .eq('site', currentSite)
        .order('claimed_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching packs:', fetchError);
        setError(fetchError.message);
        setPacks([]);
        return;
      }

      // Get pack IDs for additional queries
      const packIds = data?.map((d: any) => d.pack?.id).filter(Boolean) || [];

      // Get word counts for each pack
      let wordCounts: Record<string, number> = {};
      if (packIds.length > 0) {
        const { data: countData } = await supabase
          .from('pack_items')
          .select('pack_id')
          .in('pack_id', packIds);

        if (countData) {
          wordCounts = countData.reduce((acc: Record<string, number>, item: any) => {
            acc[item.pack_id] = (acc[item.pack_id] || 0) + 1;
            return acc;
          }, {});
        }
      }

      // Get learned word counts from pack_item_progress (dynamic progress calculation)
      let learnedCounts: Record<string, number> = {};
      if (packIds.length > 0) {
        const { data: progressData } = await supabase
          .from('pack_item_progress')
          .select('pack_id')
          .eq('user_id', user.id)
          .in('pack_id', packIds);

        if (progressData) {
          learnedCounts = progressData.reduce((acc: Record<string, number>, item: any) => {
            acc[item.pack_id] = (acc[item.pack_id] || 0) + 1;
            return acc;
          }, {});
        }
      }

      // Get cover images for each pack (separate query)
      let coverImages: Record<string, string> = {};
      if (packIds.length > 0) {
        const { data: imageData, error: imageError } = await supabase
          .from('pack_images')
          .select('pack_id, image_url, is_cover')
          .in('pack_id', packIds)
          .order('is_cover', { ascending: false })
          .order('sort_order', { ascending: true });

        if (imageData) {
          // Group by pack_id and get the cover image (is_cover=true first, then first image)
          for (const img of imageData) {
            if (!coverImages[img.pack_id]) {
              coverImages[img.pack_id] = img.image_url;
            }
          }
        }
      }

      // Transform data with dynamic progress calculation
      const transformedPacks: UserPack[] = (data || [])
        .filter((d: any) => d.pack)
        .map((d: any) => {
          const totalWords = wordCounts[d.pack.id] || 0;
          const learnedWords = learnedCounts[d.pack.id] || 0;
          // Calculate progress: (learned / total) * 100, rounded to integer
          const calculatedProgress = totalWords > 0
            ? Math.round((learnedWords / totalWords) * 100)
            : 0;

          return {
            id: d.id,
            pack_id: d.pack.id,
            title: d.pack.title,
            description: d.pack.description,
            theme: d.pack.theme,
            skill_type: d.pack.skill_type,
            difficulty: d.pack.difficulty,
            word_count: totalWords,
            progress: calculatedProgress,
            claimed_at: d.claimed_at,
            last_studied_at: d.last_studied_at,
            cover_image_url: coverImages[d.pack.id] || null,
          };
        });

      setPacks(transformedPacks);
    } catch (err) {
      console.error('Exception fetching packs:', err);
      setError('載入失敗');
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  const removePack = async (claimId: string) => {
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('user_pack_claims')
      .delete()
      .eq('id', claimId)
      .eq('user_id', user.id);

    if (error) {
      return { error: error.message };
    }

    // Update local state
    setPacks((prev) => prev.filter((p) => p.id !== claimId));
    return { error: null };
  };

  const updateProgress = async (claimId: string, progress: number) => {
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('user_pack_claims')
      .update({
        progress,
        last_studied_at: new Date().toISOString(),
      })
      .eq('id', claimId)
      .eq('user_id', user.id);

    if (error) {
      return { error: error.message };
    }

    // Update local state
    setPacks((prev) =>
      prev.map((p) =>
        p.id === claimId
          ? { ...p, progress, last_studied_at: new Date().toISOString() }
          : p
      )
    );
    return { error: null };
  };

  return {
    packs,
    loading,
    error,
    refetch: fetchPacks,
    removePack,
    updateProgress,
  };
}

// Hook to fetch a single pack with its items
export function usePackWithItems(packId: string | undefined) {
  const { user } = useAuth();
  const [pack, setPack] = useState<PackWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packId || !user) {
      setLoading(false);
      return;
    }

    const fetchPack = async () => {
      setLoading(true);
      setError(null);

      try {
        // 取得當前站點
        const currentSite = getSiteId();

        // Fetch pack details (filtered by site)
        const { data: claimData, error: claimError } = await supabase
          .from('user_pack_claims')
          .select(`
            id,
            progress,
            claimed_at,
            last_studied_at,
            site,
            pack:packs (
              id,
              title,
              description,
              theme,
              difficulty
            )
          `)
          .eq('user_id', user.id)
          .eq('pack_id', packId)
          .eq('site', currentSite)
          .single();

        if (claimError) {
          setError('找不到此單字包或無權限存取');
          setPack(null);
          return;
        }

        // Fetch pack items
        const { data: itemsData, error: itemsError } = await supabase
          .from('pack_items')
          .select('*')
          .eq('pack_id', packId)
          .order('sort_order', { ascending: true });

        if (itemsError) {
          console.error('Error fetching items:', itemsError);
        }

        const packInfo = claimData.pack as any;
        setPack({
          id: claimData.id,
          pack_id: packInfo.id,
          title: packInfo.title,
          description: packInfo.description,
          theme: packInfo.theme,
          difficulty: packInfo.difficulty,
          cover_image_url: packInfo.cover_image_url || null,
          word_count: itemsData?.length || 0,
          progress: claimData.progress || 0,
          claimed_at: claimData.claimed_at,
          last_studied_at: claimData.last_studied_at,
          items: itemsData || [],
        });
      } catch (err) {
        console.error('Exception fetching pack:', err);
        setError('載入失敗');
      } finally {
        setLoading(false);
      }
    };

    fetchPack();
  }, [packId, user]);

  return { pack, loading, error };
}

// Hook to fetch pack items by pack_id (for use in flashcards/quiz)
export function usePackItems(packId: string | null) {
  const { user } = useAuth();
  const [items, setItems] = useState<PackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packId || !user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const fetchItems = async () => {
      setLoading(true);
      setError(null);

      try {
        // 取得當前站點
        const currentSite = getSiteId();

        // First verify user has access to this pack (filtered by site)
        const { data: claimData, error: claimError } = await supabase
          .from('user_pack_claims')
          .select('id')
          .eq('user_id', user.id)
          .eq('pack_id', packId)
          .eq('site', currentSite)
          .single();

        if (claimError || !claimData) {
          setError('無權限存取此單字包');
          setItems([]);
          return;
        }

        // Fetch pack items
        const { data: itemsData, error: itemsError } = await supabase
          .from('pack_items')
          .select('*')
          .eq('pack_id', packId)
          .order('sort_order', { ascending: true });

        if (itemsError) {
          console.error('Error fetching items:', itemsError);
          setError('載入單字失敗');
          setItems([]);
          return;
        }

        setItems(itemsData || []);
      } catch (err) {
        console.error('Exception fetching pack items:', err);
        setError('載入失敗');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [packId, user]);

  return { items, loading, error };
}

// Hook to fetch pack items from multiple packs (for mixed review)
export function useMultiPackItems(packIds: string[]) {
  const { user } = useAuth();
  const [items, setItems] = useState<PackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packIds.length || !user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const fetchItems = async () => {
      setLoading(true);
      setError(null);

      try {
        // 取得當前站點
        const currentSite = getSiteId();

        // First verify user has access to all these packs (filtered by site)
        const { data: claimData, error: claimError } = await supabase
          .from('user_pack_claims')
          .select('pack_id')
          .eq('user_id', user.id)
          .eq('site', currentSite)
          .in('pack_id', packIds);

        if (claimError) {
          setError('驗證權限失敗');
          setItems([]);
          return;
        }

        const authorizedPackIds = claimData?.map(c => c.pack_id) || [];
        if (authorizedPackIds.length === 0) {
          setError('無權限存取這些單字包');
          setItems([]);
          return;
        }

        // Fetch pack items from all authorized packs
        const { data: itemsData, error: itemsError } = await supabase
          .from('pack_items')
          .select('*')
          .in('pack_id', authorizedPackIds)
          .order('sort_order', { ascending: true });

        if (itemsError) {
          console.error('Error fetching items:', itemsError);
          setError('載入單字失敗');
          setItems([]);
          return;
        }

        setItems(itemsData || []);
      } catch (err) {
        console.error('Exception fetching pack items:', err);
        setError('載入失敗');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [packIds.join(','), user]);

  return { items, loading, error };
}
