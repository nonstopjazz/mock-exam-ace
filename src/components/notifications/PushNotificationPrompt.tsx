import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { useToast } from '@/hooks/use-toast';

const DISMISSED_KEY = 'push-prompt-dismissed';

export function PushNotificationPrompt() {
  const { isSupported, permission, isSubscribed, loading, subscribe } = usePushSubscription();
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem(DISMISSED_KEY) === 'true'
  );
  const [subscribing, setSubscribing] = useState(false);
  const { toast } = useToast();

  if (loading || !isSupported || isSubscribed || permission === 'denied' || dismissed) {
    return null;
  }

  const handleSubscribe = async () => {
    setSubscribing(true);
    const success = await subscribe();
    setSubscribing(false);

    if (success) {
      toast({ title: '已開啟學習提醒', description: '我們會在你忘記複習時提醒你！' });
    } else {
      toast({ title: '無法開啟通知', description: '請檢查瀏覽器通知設定', variant: 'destructive' });
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">開啟學習提醒</p>
          <p className="text-xs text-muted-foreground">每天提醒你複習，保持連續學習紀錄！</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={handleSubscribe} disabled={subscribing}>
            {subscribing ? '開啟中...' : '開啟通知'}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
