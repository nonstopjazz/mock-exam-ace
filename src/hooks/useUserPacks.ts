import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PackItem {
  id: string;
  word: string;
  definition: string | null;
  part_of_speech: string | null;
  example_sentence: string | null;
  phonetic: string | null;
  sort_order: number;
}

export interface UserPack {
  id: string;
  pack_id: string;
  title: string;
  description: string | null;
  theme: string | null;
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
      // Fetch user's claimed packs with pack details, word count, and cover image
      const { data, error: fetchError } = await supabase
        .from('user_pack_claims')
        .select(`
          id,
          progress,
          claimed_at,
          last_studied_at,
          pack:packs (
            id,
            title,
            description,
            theme,
            difficulty,
            cover_image:pack_images!pack_id (
              image_url,
              is_cover
            )
          )
        `)
        .eq('user_id', user.id)
        .order('claimed_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching packs:', fetchError);
        setError(fetchError.message);
        setPacks([]);
        return;
      }

      // Get word counts for each pack
      const packIds = data?.map((d: any) => d.pack?.id).filter(Boolean) || [];

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

      // Transform data
      const transformedPacks: UserPack[] = (data || [])
        .filter((d: any) => d.pack)
        .map((d: any) => {
          // Find cover image (prefer is_cover=true, fallback to first image)
          const images = d.pack.cover_image || [];
          const coverImage = images.find((img: any) => img.is_cover) || images[0];

          return {
            id: d.id,
            pack_id: d.pack.id,
            title: d.pack.title,
            description: d.pack.description,
            theme: d.pack.theme,
            difficulty: d.pack.difficulty,
            word_count: wordCounts[d.pack.id] || 0,
            progress: d.progress || 0,
            claimed_at: d.claimed_at,
            last_studied_at: d.last_studied_at,
            cover_image_url: coverImage?.image_url || null,
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
        // Fetch pack details
        const { data: claimData, error: claimError } = await supabase
          .from('user_pack_claims')
          .select(`
            id,
            progress,
            claimed_at,
            last_studied_at,
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
        // First verify user has access to this pack
        const { data: claimData, error: claimError } = await supabase
          .from('user_pack_claims')
          .select('id')
          .eq('user_id', user.id)
          .eq('pack_id', packId)
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
