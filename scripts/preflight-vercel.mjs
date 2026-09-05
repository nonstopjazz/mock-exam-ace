/**
 * Vercel 部署前檢查（離線，不需要任何 key）
 *
 *   npm run preflight:vercel
 *
 * 為什麼需要它：Vercel 的 Node builder 會把每支 api/*.ts 各自打包成一個
 * serverless function。api/analyze-writing.ts 會 import ../src/lib/writing/*，
 * 跨出 api/ 目錄。如果那個解析在打包階段失敗，錯誤只會在部署時才出現，
 * 而且要等一輪 build 才看得到。這裡先用 esbuild 模擬同一件事。
 *
 * 接著把打包後的產物真的載入並呼叫，驗證：
 *   • 模組載入不會炸、config.maxDuration 有正確匯出
 *   • 授權是第一道關卡：通過之前不會有任何對外呼叫
 *   • 缺環境變數時回傳的訊息不洩漏細節
 *
 * 這裡【不】驗證模型品質，那是 scripts/writing-audit.ts 的工作。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const OUT = resolve("./.preflight");
const require = createRequire(import.meta.url);

let failed = false;
const check = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed = true;
};

const mockRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => void (r.body = b);
  r.setHeader = () => {};
  r.end = () => {};
  return r;
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("\n打包（模擬 Vercel Node builder）");

const functions = ["analyze-writing", "generate-pack-audio", "send-daily-reminders"];
for (const name of functions) {
  const out = `${OUT}/${name}.cjs`;
  try {
    execFileSync(
      "npx",
      ["esbuild", `api/${name}.ts`, "--bundle", "--platform=node", "--target=node20",
       "--format=cjs", "--packages=external", `--outfile=${out}`],
      { stdio: "pipe" },
    );
    check(`api/${name}.ts 可打包`, true, `${Math.round(statSync(out).size / 1024)}kb`);
  } catch (err) {
    check(`api/${name}.ts 可打包`, false, String(err.stderr ?? err).slice(0, 300));
  }
}

console.log("\n載入與授權關卡（離線）");

const mod = require(`${OUT}/analyze-writing.cjs`);
const handler = mod.default ?? mod;
check("bundle 載入成功且匯出 handler", typeof handler === "function");
check("config.maxDuration = 60", mod.config?.maxDuration === 60, String(mod.config?.maxDuration));

const ESSAY_ID = "11111111-1111-1111-1111-111111111111";
let res;

res = mockRes();
await handler({ method: "GET", headers: {} }, res);
check("GET → 405", res.code === 405, `${res.code}`);

for (const k of ["VITE_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_ANON_KEY",
                 "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DEEPSEEK_API_KEY"]) {
  delete process.env[k];
}
res = mockRes();
await handler({ method: "POST", headers: {}, body: { essayId: ESSAY_ID } }, res);
check(
  "缺環境變數 → 500，訊息不洩漏是哪一個變數",
  res.code === 500 && res.body?.error === "伺服器設定不完整",
  `${res.code} ${JSON.stringify(res.body)}`,
);

process.env.VITE_SUPABASE_URL = "https://preflight.example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "preflight-fake-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "preflight-fake-service";
process.env.DEEPSEEK_API_KEY = "preflight-fake-deepseek";

res = mockRes();
await handler({ method: "POST", headers: {}, body: {} }, res);
check("缺 essayId → 400", res.code === 400, `${res.code}`);

// 授權通過之前不可以有任何對外呼叫（DeepSeek、Supabase 都算）
let outbound = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (...a) => (outbound += 1, realFetch(...a));

res = mockRes();
await handler({ method: "POST", headers: {}, body: { essayId: ESSAY_ID } }, res);
check("沒有 Bearer token → 401", res.code === 401, `${res.code}`);
check("未通過授權前沒有任何對外呼叫", outbound === 0, `${outbound} 次`);

res = mockRes();
await handler(
  { method: "POST", headers: { authorization: "Basic YWRtaW46YWRtaW4=" }, body: { essayId: ESSAY_ID } },
  res,
);
check("非 Bearer 授權標頭 → 401", res.code === 401, `${res.code}`);
check("非 Bearer 也沒有對外呼叫", outbound === 0, `${outbound} 次`);

globalThis.fetch = realFetch;
rmSync(OUT, { recursive: true, force: true });

console.log(failed ? "\n部署前檢查未通過" : "\n部署前檢查通過");
process.exit(failed ? 1 : 0);
