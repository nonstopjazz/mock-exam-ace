/**
 * 踢一腳給佇列 worker。
 *
 * 佇列不靠排程推進，靠自我串接：老師排入時踢第一腳，worker 每做完一個單位
 * 再踢下一腳，沒工作就安靜停下。所以這個專案不需要 per-minute 的 cron，
 * 也就不受 Vercel 方案的 cron 頻率限制。
 *
 * ⚠️ 這一腳【必須帶 CRON_SECRET】。「是自己打自己」不是放行的理由——
 *    這個端點會花錢呼叫 DeepSeek，任何人都打得到的話就是一個帳單放大器。
 *
 * 為什麼不是真的 fire-and-forget：
 * serverless 的函式一旦 return，平台隨時可以凍結它，還沒送出的 outbound 請求
 * 會跟著消失。所以這裡會等到請求送出為止，只是不等對方跑完（對方要跑 50 秒）。
 * KICK_TIMEOUT_MS 到了就放手——那時請求早就送達，接手的那一次呼叫不會因為
 * 我們斷線而停止。
 */

const KICK_TIMEOUT_MS = 3_000;

/** 自己的對外網址。Vercel 會注入 VERCEL_URL（沒有 protocol）。 */
function selfOrigin(): string | null {
  const explicit = process.env.WORKER_SELF_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const host = process.env.VERCEL_URL;
  if (host) return `https://${host}`;
  return null;
}

export interface KickResult {
  kicked: boolean;
  reason?: string;
}

/**
 * @param depth 這是第幾棒。只用來擋住失控的無限串接，不影響佇列語意。
 */
export async function kickWorker(depth = 0): Promise<KickResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { kicked: false, reason: "CRON_SECRET_NOT_CONFIGURED" };

  const origin = selfOrigin();
  if (!origin) return { kicked: false, reason: "SELF_URL_UNKNOWN" };

  try {
    await fetch(`${origin}/api/writing-queue-worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ depth }),
      signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
    });
    return { kicked: true };
  } catch (err) {
    // 逾時是預期內的：請求已經送出，對方正在跑，我們不等它。
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return { kicked: true };
    }
    return { kicked: false, reason: err instanceof Error ? err.message : "kick failed" };
  }
}
