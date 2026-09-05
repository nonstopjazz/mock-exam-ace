/**
 * GET /api/writing-selftest —— 部署診斷用的臨時端點
 *
 * ⚠️ 這支是為了診斷 FUNCTION_INVOCATION_FAILED 而加的，正式上線前要刪掉。
 *    它在 VERCEL_ENV === "production" 時直接回 404，不會在正式站曝露。
 *
 * 為什麼需要它：
 *   api/analyze-writing.ts 在 Vercel 上是【載入階段】就崩潰，連 handler 的
 *   第一行都沒跑到。這種情況下端點本身回不了任何訊息，只能去翻 Vercel 的 log。
 *
 *   這支反過來做：頂層【完全不 import 任何東西】，所以它一定載得起來；
 *   然後在 handler 裡用 dynamic import 逐一嘗試，哪一個炸掉就把錯誤回報出來。
 *
 * 它回報什麼：
 *   • Node 版本與執行環境
 *   • 部署產物裡實際存在哪些檔案（直接看得出 _lib/ 有沒有被包進去）
 *   • 每一個模組能不能載入，載不起來的話錯誤訊息是什麼
 *   • 環境變數【有沒有設定】——只回傳 true/false，絕不回傳值
 */

export const config = {
  maxDuration: 10,
};

interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}

export default async function handler(
  _req: { method?: string },
  res: {
    status(code: number): { json(body: unknown): void };
  },
) {
  // 正式環境一律不提供。
  if (process.env.VERCEL_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const steps: Step[] = [];

  async function attempt(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      steps.push({ name, ok: true });
    } catch (err) {
      steps.push({
        name,
        ok: false,
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

  // 逐一嘗試，順序 = 相依順序。第一個失敗的就是根因。
  await attempt("@supabase/supabase-js", () => import("@supabase/supabase-js"));
  await attempt("./_lib/taxonomy", () => import("./_lib/taxonomy.js"));
  await attempt("./_lib/analysisContract", () => import("./_lib/analysisContract.js"));
  await attempt("./_lib/deepseek", () => import("./_lib/deepseek.js"));
  await attempt("./_lib/writingPrompts", () => import("./_lib/writingPrompts.js"));
  await attempt("./_lib/essayAuth", () => import("./_lib/essayAuth.js"));
  await attempt("./analyze-writing", () => import("./analyze-writing.js"));

  // 部署產物裡到底有哪些檔案——這一項直接看得出 _lib/ 有沒有被包進去。
  let files: unknown = "（讀取失敗）";
  try {
    const { readdirSync } = await import("node:fs");
    const roots: Record<string, unknown> = {};
    for (const dir of [".", "./api", "./_lib", "./api/_lib"]) {
      try {
        roots[dir] = readdirSync(dir);
      } catch (err) {
        roots[dir] = err instanceof Error ? err.message : String(err);
      }
    }
    files = roots;
  } catch (err) {
    files = err instanceof Error ? err.message : String(err);
  }

  return res.status(200).json({
    node: process.version,
    vercelEnv: process.env.VERCEL_ENV ?? "(未設定)",
    region: process.env.VERCEL_REGION ?? "(未設定)",
    cwd: process.cwd(),
    // 只回傳「有沒有設定」，絕不回傳值。
    env: {
      VITE_SUPABASE_URL: Boolean(process.env.VITE_SUPABASE_URL),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      VITE_SUPABASE_ANON_KEY: Boolean(process.env.VITE_SUPABASE_ANON_KEY),
      SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      DEEPSEEK_API_KEY: Boolean(process.env.DEEPSEEK_API_KEY),
    },
    files,
    steps,
  });
}
