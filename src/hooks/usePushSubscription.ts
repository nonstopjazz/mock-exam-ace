import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      checkExistingSubscription();
    } else {
      setLoading(false);
    }
  }, [user]);

  const checkExistingSubscription = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const sub = await registration.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.warn('VITE_VAPID_PUBLIC_KEY not set');
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = subscription.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: subJson.endpoint!,
          p256dh: subJson.keys!.p256dh!,
          auth: subJson.keys!.auth!,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' }
      );

      if (error) {
        console.error('Failed to save push subscription:', error);
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    }
  }, [user]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      return false;
    }
  }, []);

  return { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe };
}
