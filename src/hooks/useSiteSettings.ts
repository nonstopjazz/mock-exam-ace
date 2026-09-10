import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSiteId, type SiteId } from '@/hooks/useSiteIdentifier';
import type { HomeFeatureFlags } from '@/config/homeFeatures';

export interface NavigationTab {
  enabled: boolean;
  label: string;
  path: string;
  order: number;
  icon?: string;
}

export type Phase = 0 | 1 | 2;

export interface SiteSettings {
  id: string;
  navigationTabs: Record<string, NavigationTab>;
  currentPhase: Phase;
  /** 首頁功能卡片的開關。null = 還沒設定過，全部依 Phase 顯示 */
  homeFeatures: HomeFeatureFlags | null;
  updatedAt: string;
  updatedBy: string | null;
}

// Default navigation tabs (fallback if database is empty)
const DEFAULT_NAVIGATION_TABS: Record<string, NavigationTab> = {
  vocabulary: { enabled: true, label: '單字練習', path: '/practice', order: 1 },
  blog: { enabled: true, label: '學習專欄', path: '/blog', order: 2 },
  exams: { enabled: false, label: '學測模考', path: '/exams', order: 3 },
  dashboard: { enabled: false, label: '學習儀表板', path: '/dashboard', order: 4 },
  essay: { enabled: false, label: 'AI 作文批改', path: '/essay', order: 5 },
  courses: { enabled: false, label: '影片課程', path: '/courses', order: 6 },
};

export function useSiteSettings(overrideSiteId?: SiteId) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use override or auto-detect from hostname
  const siteId = overrideSiteId || getSiteId();

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('site_settings')
        .select('*')
        .eq('id', siteId)
        .single();

      if (fetchError) {
        // If no settings found, use defaults
        if (fetchError.code === 'PGRST116') {
          setSettings({
            id: siteId,
            navigationTabs: DEFAULT_NAVIGATION_TABS,
            currentPhase: 0,
            homeFeatures: null,
            updatedAt: new Date().toISOString(),
            updatedBy: null,
          });
        } else {
          throw fetchError;
        }
      } else {
        setSettings({
          id: data.id,
          navigationTabs: data.navigation_tabs || DEFAULT_NAVIGATION_TABS,
          currentPhase: (data.current_phase ?? 0) as Phase,
          // 欄位還沒建立時 data.home_features 是 undefined，一律當作「沒設定過」
          homeFeatures: (data.home_features as HomeFeatureFlags | null | undefined) ?? null,
          updatedAt: data.updated_at,
          updatedBy: data.updated_by,
        });
      }
    } catch (err: any) {
      setError(err.message);
      // Still provide defaults on error
      setSettings({
        id: siteId,
        navigationTabs: DEFAULT_NAVIGATION_TABS,
        currentPhase: 0,
        homeFeatures: null,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      });
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Update navigation tabs
  const updateNavigationTabs = useCallback(async (tabs: Record<string, NavigationTab>) => {
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('site_settings')
        .update({
          navigation_tabs: tabs,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        })
        .eq('id', siteId);

      if (updateError) throw updateError;

      // Update local state
      setSettings(prev => prev ? {
        ...prev,
        navigationTabs: tabs,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id || null,
      } : null);

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  // Update current phase
  const updatePhase = useCallback(async (phase: Phase) => {
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('site_settings')
        .update({
          current_phase: phase,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        })
        .eq('id', siteId);

      if (updateError) throw updateError;

      // Update local state
      setSettings(prev => prev ? {
        ...prev,
        currentPhase: phase,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id || null,
      } : null);

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  /**
   * 首頁功能卡片的開關。
   *
   * 🛑 只寫 home_features 一個欄位；current_phase 不在這裡動。
   *    「功能開了沒」與「首頁露不露出」是兩件事，混在同一個儲存動作裡遲早出事。
   */
  const updateHomeFeatures = useCallback(async (flags: HomeFeatureFlags) => {
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('site_settings')
        .update({
          home_features: flags,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        })
        .eq('id', siteId);

      if (updateError) throw updateError;

      setSettings(prev => prev ? {
        ...prev,
        homeFeatures: flags,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id || null,
      } : null);

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [siteId]);

  // Get enabled navigation tabs sorted by order
  const getEnabledTabs = useCallback(() => {
    if (!settings?.navigationTabs) return [];

    return Object.entries(settings.navigationTabs)
      .filter(([_, tab]) => tab.enabled)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, tab]) => ({ key, ...tab }));
  }, [settings]);

  return {
    settings,
    loading,
    error,
    updateNavigationTabs,
    updatePhase,
    updateHomeFeatures,
    getEnabledTabs,
    refetch: fetchSettings,
  };
}
