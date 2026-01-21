import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSiteSettings, NavigationTab } from '@/hooks/useSiteSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Loader2, GripVertical, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SiteSettings() {
  const { settings, loading, error, updateNavigationTabs } = useSiteSettings();
  const [tabs, setTabs] = useState<Record<string, NavigationTab>>({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Initialize local state from settings
  useEffect(() => {
    if (settings?.navigationTabs) {
      setTabs(settings.navigationTabs);
    }
  }, [settings]);

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
