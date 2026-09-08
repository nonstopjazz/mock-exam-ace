import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { getSiteId } from '@/hooks/useSiteIdentifier';
import type { HomeFeatureFlags } from '@/config/homeFeatures';

export type Phase = 0 | 1 | 2;

interface PhaseContextValue {
  phase: Phase;
  /**
   * 首頁卡片的開關。null = 還沒設定過，一律顯示。
   *
   * 放在這個 Provider 是因為它與 current_phase 同一列、同一次查詢就拿得到；
   * 首頁是公開頁面，不值得為了幾個布林值再打一次 Supabase。
   */
  homeFeatures: HomeFeatureFlags | null;
  loading: boolean;
}

const PhaseContext = createContext<PhaseContextValue>({
  phase: 0,
  homeFeatures: null,
  loading: true,
});

export function PhaseProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(0);
  const [homeFeatures, setHomeFeatures] = useState<HomeFeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const siteId = getSiteId();

    async function fetchPhase() {
      try {
        /*
         * 刻意 select('*') 而不是列出欄位：若指名 home_features 而該欄位還沒
         * 建立（migration 尚未執行），整個查詢會回 42703，phase 會跟著退回 0 ——
         * 等於整站被降級成 Phase 0。select('*') 讓「先部署前端、後跑 migration」
         * 這個順序也不會出事。
         */
        const { data, error } = await supabase
          .from('site_settings')
          .select('*')
          .eq('id', siteId)
          .single();

        if (!cancelled && !error && data) {
          setPhase((data.current_phase ?? 0) as Phase);
          setHomeFeatures((data.home_features as HomeFeatureFlags | null | undefined) ?? null);
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
    <PhaseContext.Provider value={{ phase, homeFeatures, loading }}>
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

export function useHomeFeatureFlags(): HomeFeatureFlags | null {
  return useContext(PhaseContext).homeFeatures;
}
