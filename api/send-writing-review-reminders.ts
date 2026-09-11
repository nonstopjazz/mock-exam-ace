/**
 * GET|POST /api/send-writing-review-reminders
 *
 * 「還有幾篇作文等你處理」的每日提醒，走 Web Push。
 *
 * 目前這支【不在 vercel.json 的 cron 裡】—— 它是由既有的每日單字提醒
 * （api/send-daily-reminders.ts，台灣時間 20:00）順手帶一腳觸發的，
 * 因為那是擁有者要求的：共用同一條排程。
 *
 * 保留成獨立端點的理由有兩個：
 *   1. 可以手動試跑（?dryRun=1 只算不送，回傳會送出的文字）
 *   2. 之後若要改成別的時間（例如 22:00），只要在 vercel.json 加一條 cron
 *      指到這裡就好，不必把邏輯搬來搬去
 *
 * 授權：CRON_SECRET，fail closed。
 */

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { timingSafeEqual } from "node:crypto";
import { sendWritingReviewReminders } from "./_lib/writingReviewReminder.js";

export const config = {
  maxDuration: 30,
};

interface CronRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

interface CronResponse {
  status(code: number): CronResponse;
  json(body: unknown): void;
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req: CronRequest, res: CronResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // FAIL CLOSED：沒設 CRON_SECRET 就拒絕，不是放行。
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[send-writing-review-reminders] CRON_SECRET is not configured; refusing to run.");
    return res.status(503).json({ error: "CRON_SECRET_NOT_CONFIGURED" });
  }
  const authHeader = firstValue(req.headers?.authorization ?? req.headers?.Authorization);
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!provided || !secretMatches(provided, cronSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || "mailto:nonstopjazz@gmail.com";

  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dryRunParam = firstValue(req.query?.dryRun);
  const dryRun = dryRunParam === "1" || dryRunParam === "true";

  const result = await sendWritingReviewReminders(admin, { dryRun });
  console.log("[send-writing-review-reminders]", JSON.stringify({ dryRun, ...result }));

  return res.status(result.error ? 500 : 200).json({ dryRun, ...result });
}
