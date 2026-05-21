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

function getNotificationContent(streak: number, daysSince: number): { title: string; body: string } {
  // Milestone celebrations
  if (streak === 6) return { title: '即將達成一週！', body: `你已經連續學習 ${streak} 天，明天就滿一週了！堅持住！` };
  if (streak === 29) return { title: '即將達成一個月！', body: `連續 ${streak} 天！明天就是完整的一個月了！` };
  if (streak > 0 && streak % 30 === 0) return { title: `🔥 連續 ${streak} 天！`, body: `太厲害了！你已經連續學習 ${streak} 天，繼續保持！` };
  if (streak > 0 && streak % 7 === 0) return { title: `連續 ${streak} 天！`, body: `又完成一週了！保持這個節奏，單字會記得越來越牢！` };

  // Active streak, hasn't studied today
  if (streak >= 14) return { title: '別讓努力白費！', body: `你已經連續學習 ${streak} 天了，今天花 5 分鐘維持紀錄吧！` };
  if (streak >= 7) return { title: '保持好習慣！', body: `連續 ${streak} 天的努力，今天繼續複習幾個單字吧！` };
  if (streak >= 3) return { title: '做得很好！', body: `連續 ${streak} 天學習中，今天也來複習一下吧！` };
  if (streak > 0) return { title: '學習提醒', body: `你已經連續學習 ${streak} 天，今天還沒複習喔！` };

  // Streak broken — different messages based on how long ago
  if (daysSince === 1) return { title: '昨天忘記複習了！', body: '中斷一天沒關係，今天回來複習，記憶還來得及補救！' };
  if (daysSince === 2) return { title: '兩天沒複習了', body: '根據遺忘曲線，現在複習效果最好，趁還記得趕快回來！' };
  if (daysSince >= 3 && daysSince <= 5) return { title: '單字在等你回來', body: `已經 ${daysSince} 天沒複習了，花 3 分鐘快速回顧一下吧！` };
  if (daysSince >= 6 && daysSince <= 13) return { title: '好久不見！', body: `距離上次複習已經 ${daysSince} 天了，重新開始永遠不嫌晚！` };
  if (daysSince >= 14) return { title: '歡迎回來！', body: '不管離開多久，現在回來就是最好的時機。來複習幾個單字吧！' };

  // New user or no data
  return { title: '開始今天的學習', body: '每天花幾分鐘背單字，累積起來效果驚人！' };
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

  const today = new Date().toISOString().split('T')[0];

  for (const target of pushTargets) {
    const lastDate = target.last_study_date;

    // Calculate days since last study
    let daysSince = 0;
    if (lastDate) {
      const diff = new Date(today).getTime() - new Date(lastDate).getTime();
      daysSince = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    // Validate streak: DB stores stale streak_days (never auto-resets).
    // Streak is only valid if last_study_date is today or yesterday.
    const rawStreak = target.streak_days ?? 0;
    const streak = daysSince <= 1 ? rawStreak : 0;

    const { title, body } = getNotificationContent(streak, daysSince);

    const payload = JSON.stringify({
      title,
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
