import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSiteSettings, NavigationTab, type Phase } from '@/hooks/useSiteSettings';
import { HOME_FEATURES, type HomeFeatureFlags } from '@/config/homeFeatures';
import { supabase } from '@/lib/supabase';
import { getSiteId, type SiteId } from '@/hooks/useSiteIdentifier';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Loader2, GripVertical, Settings, Rocket, Users, Crown, LayoutGrid } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PHASE_OPTIONS: { value: Phase; label: string; description: string; icon: typeof Rocket; color: string; features: string[] }[] = [
  {
    value: 0,
    label: 'Phase 0 — Public MVP',
    description: '僅開放單字練習功能',
    icon: Rocket,
    color: 'bg-emerald-500',
    features: ['單字中心', 'SRS 智慧複習', '翻轉卡片', '快速測驗'],
  },
  {
    value: 1,
    label: 'Phase 1 — Free Member',
    description: '開放登入、收藏、成就等功能',
    icon: Users,
    color: 'bg-blue-500',
    features: ['Phase 0 所有功能', '詞彙收藏', '成就系統', '個人檔案', '任務地圖'],
  },
  {
    value: 2,
    label: 'Phase 2 — Premium',
    description: '開放模考、儀表板、AI 作文批改等完整功能',
    icon: Crown,
    color: 'bg-purple-500',
    features: ['Phase 0+1 所有功能', '學測模考', '學習儀表板', 'AI 作文批改'],
  },
];

const SITE_LABELS: Record<SiteId, { name: string; domain: string; color: string }> = {
  gsat: { name: '學測英文', domain: 'gsat.ilearn.blog', color: 'text-blue-600' },
  toeic: { name: '多益英文', domain: 'toeic.ilearn.blog', color: 'text-green-600' },
  kids: { name: '兒童英文', domain: 'kides.ilearn.blog', color: 'text-orange-600' },
};

const ALL_SITES: SiteId[] = ['gsat', 'toeic', 'kids'];

// Hook to fetch all sites' phases
function useAllSitePhases() {
  const [phases, setPhases] = useState<Record<SiteId, Phase>>({ gsat: 0, toeic: 0, kids: 0 });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('site_settings')
        .select('id, current_phase')
        .in('id', ALL_SITES);

      if (data) {
        const map: Record<string, Phase> = { gsat: 0, toeic: 0, kids: 0 };
        data.forEach((row: any) => {
          map[row.id] = (row.current_phase ?? 0) as Phase;
        });
        setPhases(map as Record<SiteId, Phase>);
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateSitePhase = useCallback(async (siteId: SiteId, phase: Phase) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('site_settings')
      .update({
        current_phase: phase,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      })
      .eq('id', siteId);

    if (!error) {
      setPhases(prev => ({ ...prev, [siteId]: phase }));
    }
    return !error;
  }, []);

  return { phases, loading, updateSitePhase, refetch: fetchAll };
}

export default function SiteSettings() {
  const { settings, loading, error, updateNavigationTabs, updateHomeFeatures } = useSiteSettings();
  const allSites = useAllSitePhases();
  /*
   * 首頁卡片寫進「目前這個網域」那一列（useSiteSettings 也是同一個 id），
   * 所以擋卡片的階段必須讀同一個站，不能寫死 gsat。
   */
  const thisSiteId = getSiteId();
  const [tabs, setTabs] = useState<Record<string, NavigationTab>>({});
  const [homeFlags, setHomeFlags] = useState<HomeFeatureFlags>({});
  const [savingHome, setSavingHome] = useState(false);
  const [homeChanged, setHomeChanged] = useState(false);
  const [selectedPhases, setSelectedPhases] = useState<Record<SiteId, Phase>>({ gsat: 0, toeic: 0, kids: 0 });
  const [saving, setSaving] = useState(false);
  const [savingPhase, setSavingPhase] = useState<SiteId | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Initialize local state from settings
  useEffect(() => {
    if (settings?.navigationTabs) {
      setTabs(settings.navigationTabs);
    }
  }, [settings]);

  /*
   * 首頁卡片：資料庫裡沒有的 key 一律視為「顯示」。
   * 缺席不等於關閉——之後新增卡片時，舊的設定不會把它悶掉。
   */
  useEffect(() => {
    const flags: HomeFeatureFlags = {};
    for (const f of HOME_FEATURES) {
      flags[f.key] = settings?.homeFeatures?.[f.key] !== false;
    }
    setHomeFlags(flags);
    setHomeChanged(false);
  }, [settings]);

  // Sync all sites' phases
  useEffect(() => {
    setSelectedPhases(allSites.phases);
  }, [allSites.phases]);

  // Check for changes
  useEffect(() => {
    if (settings?.navigationTabs) {
      setHasChanges(JSON.stringify(tabs) !== JSON.stringify(settings.navigationTabs));
    }
  }, [tabs, settings]);

  const handleToggle = (key: string, enabled: boolean) => {
    setTabs(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled },
    }));
  };

  const handleLabelChange = (key: string, label: string) => {
    setTabs(prev => ({
      ...prev,
      [key]: { ...prev[key], label },
    }));
  };

  const handleOrderChange = (key: string, order: number) => {
    setTabs(prev => ({
      ...prev,
      [key]: { ...prev[key], order },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const success = await updateNavigationTabs(tabs);
    setSaving(false);

    if (success) {
      toast({
        title: '儲存成功',
        description: '導航設定已更新，重新整理頁面後生效',
      });
      setHasChanges(false);
    } else {
      toast({
        title: '儲存失敗',
        description: error || '請稍後再試',
        variant: 'destructive',
      });
    }
  };

  const handleHomeToggle = (key: string, enabled: boolean) => {
    setHomeFlags(prev => ({ ...prev, [key]: enabled }));
    setHomeChanged(true);
  };

  const handleSaveHome = async () => {
    setSavingHome(true);
    const success = await updateHomeFeatures(homeFlags);
    setSavingHome(false);

    if (success) {
      toast({
        title: '首頁卡片已更新',
        description: '學生重新整理首頁之後就會看到新的設定',
      });
      setHomeChanged(false);
    } else {
      toast({
        title: '儲存失敗',
        description: error || '請稍後再試',
        variant: 'destructive',
      });
    }
  };

  const handleSavePhase = async (siteId: SiteId) => {
    setSavingPhase(siteId);
    const success = await allSites.updateSitePhase(siteId, selectedPhases[siteId]);
    setSavingPhase(null);

    if (success) {
      toast({
        title: '階段已更新',
        description: `${SITE_LABELS[siteId].name} 已切換至 Phase ${selectedPhases[siteId]}，前台功能已即時更新`,
      });
    } else {
      toast({
        title: '儲存失敗',
        description: '請稍後再試',
        variant: 'destructive',
      });
    }
  };

  // Sort tabs by order for display
  const sortedTabs = Object.entries(tabs).sort((a, b) => a[1].order - b[1].order);

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回管理中心
        </Button>
      </Link>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-8 w-8" />
            網站設定
          </h1>
          <p className="text-muted-foreground mt-2">管理網站導航和功能開關</p>
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          儲存變更
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Phase Selector Card — Per-Site */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            各站功能開放階段
          </CardTitle>
          <CardDescription>
            獨立控制每個網站目前開放到哪個階段的功能。切換後前台會即時反映。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {ALL_SITES.map((siteId) => {
            const siteInfo = SITE_LABELS[siteId];
            const currentPhase = allSites.phases[siteId];
            const selected = selectedPhases[siteId];
            const hasChange = selected !== currentPhase;
            const isSaving = savingPhase === siteId;

            return (
              <div key={siteId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className={`font-bold text-lg ${siteInfo.color}`}>{siteInfo.name}</h3>
                    <p className="text-xs text-muted-foreground">{siteInfo.domain}</p>
                  </div>
                  <Button
                    onClick={() => handleSavePhase(siteId)}
                    disabled={isSaving || !hasChange}
                    size="sm"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    儲存
                  </Button>
                </div>

                <div className="flex gap-2">
                  {PHASE_OPTIONS.map((option) => {
                    const isSelected = selected === option.value;
                    const isCurrent = currentPhase === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setSelectedPhases(prev => ({ ...prev, [siteId]: option.value }))}
                        className={`flex-1 text-left p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2.5 h-2.5 rounded-full ${option.color}`} />
                          <span className="font-semibold text-sm">Phase {option.value}</span>
                          {isCurrent && !hasChange && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              目前
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>注意：</strong>每個網站的階段獨立控制。切換階段會立即影響該站前台使用者可見的功能。階段是累進的 — Phase 2 包含 Phase 0 和 Phase 1 的所有功能。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 首頁功能卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" />
                首頁功能卡片
              </CardTitle>
              <CardDescription className="mt-1.5">
                控制首頁下方那一排卡片顯示哪幾張。關掉只是不在首頁露出，功能本身仍然可以用網址進入。
              </CardDescription>
            </div>
            <Button onClick={handleSaveHome} disabled={savingHome || !homeChanged} size="sm">
              {savingHome ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              儲存
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {HOME_FEATURES.map((feature) => {
              const sitePhase = allSites.phases[thisSiteId] ?? settings?.currentPhase ?? 0;
              const blockedByPhase = feature.phase > sitePhase;
              const on = homeFlags[feature.key] !== false;

              return (
                <div
                  key={feature.key}
                  className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border transition-colors ${
                    on && !blockedByPhase ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{feature.title}</span>
                      {blockedByPhase && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Phase {feature.phase} 才開放
                        </Badge>
                      )}
                    </div>
                    <code className="block truncate text-xs text-muted-foreground">{feature.path}</code>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={on && !blockedByPhase}
                    disabled={blockedByPhase}
                    onCheckedChange={(checked) => handleHomeToggle(feature.key, checked)}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">說明</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 這裡只決定<strong>首頁露不露出</strong>，與導航選單、與功能本身的開放與否是三件事</li>
              <li>• 標示「Phase N 才開放」的卡片目前被階段設定擋住，開了也不會顯示 —— 要先在上方把階段調高</li>
              <li>• 開關只能關掉卡片，不能越過階段打開功能：否則學生會點進「即將推出」的頁面</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>導航選單設定</CardTitle>
          <CardDescription>
            控制網站上方導航列顯示哪些功能頁面。關閉的功能不會在導航列中顯示。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-muted rounded-lg text-sm font-medium text-muted-foreground">
              <div className="col-span-1"></div>
              <div className="col-span-3">功能名稱</div>
              <div className="col-span-3">顯示標籤</div>
              <div className="col-span-2">路徑</div>
              <div className="col-span-1">順序</div>
              <div className="col-span-2 text-center">啟用</div>
            </div>

            {/* Rows */}
            {sortedTabs.map(([key, tab]) => (
              <div
                key={key}
                className={`grid grid-cols-12 gap-4 items-center px-4 py-3 rounded-lg border transition-colors ${
                  tab.enabled ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
                }`}
              >
                <div className="col-span-1">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="col-span-3">
                  <span className="font-medium">{key}</span>
                </div>
                <div className="col-span-3">
                  <Input
                    value={tab.label}
                    onChange={(e) => handleLabelChange(key, e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="col-span-2">
                  <code className="text-sm text-muted-foreground">{tab.path}</code>
                </div>
                <div className="col-span-1">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={tab.order}
                    onChange={(e) => handleOrderChange(key, parseInt(e.target.value) || 1)}
                    className="h-9 w-16"
                  />
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch
                    checked={tab.enabled}
                    onCheckedChange={(checked) => handleToggle(key, checked)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">說明</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>啟用</strong>：開啟後該功能會顯示在網站導航列</li>
              <li>• <strong>顯示標籤</strong>：導航列上顯示的文字</li>
              <li>• <strong>順序</strong>：數字越小越靠前</li>
              <li>• 後台管理選項不在此設定（僅管理員可見）</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {settings?.updatedAt && (
        <p className="text-sm text-muted-foreground text-right">
          最後更新：{new Date(settings.updatedAt).toLocaleString('zh-TW')}
        </p>
      )}
    </div>
  );
}
