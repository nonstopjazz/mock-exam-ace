import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const config = {
  maxDuration: 30,
};

interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
  streak_days: number | null;
  last_study_date: string | null;
}

export default async function handler(req: any, res: any) {
  // Only allow GET (Vercel Cron) or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret in production
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:nonstopjazz@gmail.com';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find users with push subscriptions who haven't studied today
  const { data: targets, error: queryError } = await supabase
    .from('push_subscriptions')
    .select(`
      endpoint,
      p256dh,
      auth,
      user_stats!inner(streak_days, last_study_date)
    `)
    .or('user_stats.last_study_date.is.null,user_stats.last_study_date.lt.' + new Date().toISOString().split('T')[0]);

  // Fallback: if the join query fails, try a simpler approach
  let pushTargets: PushTarget[] = [];

  if (queryError || !targets) {
    // Simple approach: get all subscriptions, then check stats separately
    const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth, user_id');
    if (!subs || subs.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No subscriptions' });
    }

    const userIds = subs.map((s: any) => s.user_id);
    const { data: stats } = await supabase
      .from('user_stats')
      .select('user_id, streak_days, last_study_date')
      .in('user_id', userIds);

    const statsMap = new Map<string, any>();
    stats?.forEach((s: any) => statsMap.set(s.user_id, s));

    const today = new Date().toISOString().split('T')[0];
    pushTargets = subs
      .filter((s: any) => {
        const stat = statsMap.get(s.user_id);
        return !stat || stat.last_study_date !== today;
      })
      .map((s: any) => {
        const stat = statsMap.get(s.user_id);
        return {
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
          streak_days: stat?.streak_days ?? 0,
          last_study_date: stat?.last_study_date ?? null,
        };
      });
  } else {
    pushTargets = targets.map((t: any) => ({
      endpoint: t.endpoint,
      p256dh: t.p256dh,
      auth: t.auth,
      streak_days: t.user_stats?.streak_days ?? 0,
      last_study_date: t.user_stats?.last_study_date ?? null,
    }));
  }

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  for (const target of pushTargets) {
    const streak = target.streak_days ?? 0;
    const body = streak > 0
      ? `你已經連續學習 ${streak} 天，今天還沒複習喔！別中斷了！`
      : '今天還沒開始學習，來複習一下單字吧！';

    const payload = JSON.stringify({
      title: '學習提醒',
      body,
      url: '/practice/vocabulary',
    });

    const subscription = {
      endpoint: target.endpoint,
      keys: {
        p256dh: target.p256dh,
        auth: target.auth,
      },
    };

    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', target.endpoint);
        cleaned++;
      } else {
        failed++;
      }
    }
  }

  return res.status(200).json({ sent, failed, cleaned, total: pushTargets.length });
}
