/**
 * DeepSeek 用量換算成金額的單價。
 *
 * 🛑 這裡【沒有】預設價格，而且是刻意的。
 *
 * 寫死一個單價，等 DeepSeek 調價那天，批次確認框上的金額會安靜地開始說謊 ——
 * 而那是老師用來決定「要不要按下去」的數字。沒有價格時寧可只顯示呼叫次數與
 * token 量（那些是量測值，永遠不會過期），也不顯示一個可能錯的金額。
 *
 * 要顯示金額，在 Vercel 設這兩個環境變數（去 DeepSeek 的定價頁抄當下的數字）：
 *
 *   VITE_DEEPSEEK_PRICE_INPUT_PER_M    每一百萬 input token 的美金價格
 *   VITE_DEEPSEEK_PRICE_OUTPUT_PER_M   每一百萬 output token 的美金價格
 *
 * 這兩個不是 secret（定價是公開資訊），所以用 VITE_ 前綴讓前端讀得到即可。
 * 設定後要重新部署才會生效。
 */

function readPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const PRICE_INPUT_PER_M = readPrice(import.meta.env.VITE_DEEPSEEK_PRICE_INPUT_PER_M);
export const PRICE_OUTPUT_PER_M = readPrice(import.meta.env.VITE_DEEPSEEK_PRICE_OUTPUT_PER_M);

/** 有沒有設定單價。沒設就只顯示用量，不顯示金額。 */
export const HAS_PRICING = PRICE_INPUT_PER_M !== null && PRICE_OUTPUT_PER_M !== null;

/** 估算金額（美金）。沒有單價時回 null。 */
export function estimateUsd(promptTokens: number, completionTokens: number): number | null {
  if (PRICE_INPUT_PER_M === null || PRICE_OUTPUT_PER_M === null) return null;
  return (
    (promptTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (completionTokens / 1_000_000) * PRICE_OUTPUT_PER_M
  );
}

/** 給人看的金額。很小的數字不要顯示成 $0.00，那會讓人以為是免費的。 */
export function formatUsd(usd: number): string {
  if (usd < 0.01) return "< US$0.01";
  return `約 US$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
