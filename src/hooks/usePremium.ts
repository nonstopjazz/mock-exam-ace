import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PremiumMembership {
  id: string;
  user_id: string;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
  granted_by: string | null;
  notes: string | null;
}

export function usePremium() {
  const { user } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [membership, setMembership] = useState<PremiumMembership | null>(null);
  const [loading, setLoading] = useState(true);

  const checkPremium = useCallback(async () => {
    if (!user) {
      setIsPremium(false);
      setMembership(null);
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('premium_memberships')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('granted_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setIsPremium(true);
        setMembership(data);
      } else {
        setIsPremium(false);
        setMembership(null);
      }
    } catch {
      setIsPremium(false);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkPremium();
  }, [checkPremium]);

  return { isPremium, membership, loading, refetch: checkPremium };
}
