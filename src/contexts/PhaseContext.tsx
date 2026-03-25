import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export type Phase = 0 | 1 | 2;

interface PhaseContextValue {
  phase: Phase;
  loading: boolean;
}

const PhaseContext = createContext<PhaseContextValue>({ phase: 0, loading: true });

export function PhaseProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPhase() {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('current_phase')
          .eq('id', 'main')
          .single();

        if (!cancelled && !error && data) {
          setPhase((data.current_phase ?? 0) as Phase);
        }
      } catch {
        // fallback to phase 0
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPhase();
    return () => { cancelled = true; };
  }, []);

  return (
    <PhaseContext.Provider value={{ phase, loading }}>
      {children}
    </PhaseContext.Provider>
  );
}

export function usePhase(): Phase {
  return useContext(PhaseContext).phase;
}

export function usePhaseLoading(): boolean {
  return useContext(PhaseContext).loading;
}
