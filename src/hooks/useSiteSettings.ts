import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface NavigationTab {
  enabled: boolean;
  label: string;
  path: string;
  order: number;
  icon?: string;
}

export interface SiteSettings {
  id: string;
  navigationTabs: Record<string, NavigationTab>;
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

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('site_settings')
        .select('*')
        .eq('id', 'main')
        .single();

      if (fetchError) {
        // If no settings found, use defaults
        if (fetchError.code === 'PGRST116') {
          setSettings({
            id: 'main',
            navigationTabs: DEFAULT_NAVIGATION_TABS,
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
          updatedAt: data.updated_at,
          updatedBy: data.updated_by,
        });
      }
    } catch (err: any) {
      setError(err.message);
      // Still provide defaults on error
      setSettings({
        id: 'main',
        navigationTabs: DEFAULT_NAVIGATION_TABS,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

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
        .eq('id', 'main');

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
    getEnabledTabs,
    refetch: fetchSettings,
  };
}
