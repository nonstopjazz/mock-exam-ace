/**
 * 每日提醒：還有幾篇作文等老師處理
 *
 * 走 Web Push（這個專案既有的通知管道），不是 email —— 專案裡沒有任何寄信能力。
 *
 * 為什麼是獨立的模組而不是寫在端點裡：
 * 它有兩個呼叫者——既有的每日單字提醒 cron（順手帶一腳），以及自己的獨立端點
 * （手動試跑，以及之後想換時間時直接掛自己的 cron）。邏輯只有一份。
 *
 * 🛑 沒有待處理的作文就【什麼都不送】。每天一則「目前沒有待處理」的通知，
 *    三天之後就會被當成雜訊關掉，連帶真的有事的那天也看不到。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

export interface PendingDigest {
  pending_total: number;
  awaiting_analysis: number;
  queued: number;
  analyzing: number;
  failed: number;
  awaiting_review: number;
  oldest_pending_at: string | null;
  unclassed: number;
  by_class: { class_id: string; name: string; count: number }[];
}

export interface ReminderResult {
  skipped?: "NO_RECIPIENTS" | "NOTHING_PENDING" | "NO_SUBSCRIPTIONS";
  pending?: number;
  sent?: number;
  failed?: number;
  cleaned?: number;
  title?: string;
  body?: string;
  error?: string;
}

/** 收件人。逗號分隔，在 Vercel 設定。沒設就不送——不猜。 */
function recipients(): string[] {
  return (process.env.WRITING_REMINDER_ADMIN_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function relativeDay(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
}

/**
 * 通知的內容。
 *
 * 推播的可視空間很小，所以只放老師真的會據以行動的東西：
 * 總數、班級分佈（最多兩個班，其餘併成「其他」）、最早的那一篇有多久了。
 * 失敗的篇數單獨提一句——那是唯一需要老師動手重試的狀況。
 */
export function buildNotification(d: PendingDigest): { title: string; body: string } {
  const title = `有 ${d.pending_total} 篇作文待處理`;

  const lines: string[] = [];

  const top = d.by_class.slice(0, 2).map((c) => `${c.name} ${c.count} 篇`);
  const rest =
    d.by_class.length > 2
      ? d.by_class.slice(2).reduce((n, c) => n + c.count, 0)
      : 0;
  if (rest > 0) top.push(`其他 ${rest} 篇`);
  if (d.unclassed > 0) top.push(`未分班 ${d.unclassed} 篇`);
  if (top.length > 0) lines.push(top.join("、"));

  const states: string[] = [];
  if (d.awaiting_review > 0) states.push(`${d.awaiting_review} 篇 AI 已完成待檢閱`);
  if (d.failed > 0) states.push(`${d.failed} 篇分析失敗`);
  if (states.length > 0) lines.push(states.join("、"));

  const oldest = relativeDay(d.oldest_pending_at);
  if (oldest) lines.push(`最早提交：${oldest}`);

  return { title, body: lines.join("\n") };
}

/**
 * 送出提醒。
 *
 * @param admin  service-role client
 * @param opts.dryRun 只算不送，回傳會送出的內容
 *
 * 呼叫端要先 webpush.setVapidDetails()。這裡不做，因為兩個呼叫者本來就都要
 * 為了自己的通知設定它，重複設定沒有意義。
 */
export async function sendWritingReviewReminders(
  admin: SupabaseClient,
  opts: { dryRun?: boolean } = {},
): Promise<ReminderResult> {
  const emails = recipients();
  if (emails.length === 0) {
    // 沒設收件人不是錯誤，是還沒開啟這個功能。安靜跳過，但留一行紀錄。
    console.log("[writing-review-reminder] WRITING_REMINDER_ADMIN_EMAIL 未設定，略過");
    return { skipped: "NO_RECIPIENTS" };
  }

  const { data: digestRaw, error: digestError } = await admin.rpc("writing_pending_digest");
  if (digestError) {
    console.error("[writing-review-reminder] 讀取待處理摘要失敗:", digestError.message);
    return { error: digestError.message };
  }

  const digest = digestRaw as unknown as PendingDigest;
  if (!digest || digest.pending_total === 0) {
    return { skipped: "NOTHING_PENDING", pending: 0 };
  }

  const { data: targets, error: targetError } = await admin.rpc("writing_reminder_push_targets", {
    p_emails: emails,
  });
  if (targetError) {
    console.error("[writing-review-reminder] 讀取推播對象失敗:", targetError.message);
    return { error: targetError.message, pending: digest.pending_total };
  }

  const subs = (targets ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  const { title, body } = buildNotification(digest);

  if (subs.length === 0) {
    // 收件人設了但那個帳號沒有開啟瀏覽器通知。講清楚，否則會以為程式壞了。
    console.warn(
      `[writing-review-reminder] ${digest.pending_total} 篇待處理，但收件人沒有任何推播訂閱`,
    );
    return { skipped: "NO_SUBSCRIPTIONS", pending: digest.pending_total, title, body };
  }

  if (opts.dryRun) {
    return { pending: digest.pending_total, sent: 0, title, body };
  }

  const payload = JSON.stringify({ title, body, url: "/admin/writing" });
  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent += 1;
    } catch (err) {
      // 410 / 404 = 這個訂閱已經失效（換裝置、清了瀏覽器資料）。刪掉，不要每天重試。
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        cleaned += 1;
      } else {
        failed += 1;
      }
    }
  }

  return { pending: digest.pending_total, sent, failed, cleaned, title, body };
}
