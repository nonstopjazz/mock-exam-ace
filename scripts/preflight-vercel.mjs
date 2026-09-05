/**
 * Vercel 部署前檢查（離線，不需要任何 key）
 *
 *   npm run preflight:vercel
 *
 * 為什麼需要它，以及它為什麼長成現在這樣
 * ─────────────────────────────────────────────────────────────────────
 * Vercel 的 Node builder【不打包】serverless function。它把每一支
 * api/**\/*.ts 逐檔轉譯成 ESM 的 .js，然後用 Node 真正的 ESM 解析器去載入。
 *
 * 這件事很重要，因為 ESM 的相對 import【必須寫副檔名】。
 * `import "./_lib/taxonomy"` 在 ESM 下解析不到 `_lib/taxonomy.js`，
 * function 會在載入階段就崩潰（FUNCTION_INVOCATION_FAILED），連 handler
 * 的第一行都不會執行。
 *
 * 這份腳本原本用 `esbuild --bundle` 檢查，結果是綠的——因為打包器會把所有
 * 相依內聯掉，根本不需要解析副檔名。2026-09-05 在 Preview 上就是這樣漏掉的：
 * 本機全綠，部署即死。
 *
 * 現在改成【忠實模擬】：
 *   1. 逐檔轉譯（--format=esm，不 --bundle），保留目錄結構
 *   2. 用 Node 真正的 ESM 解析器 import 進來
 * 少了任何一個副檔名，這裡就會失敗。
 *
 * 接著把載入後的 handler 真的呼叫幾次，驗證授權是第一道關卡。
 * 這裡【不】驗證模型品質，那是 scripts/writing-audit.ts 的工作。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = resolve("./.preflight");
const API_OUT = join(OUT, "api");

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

/** api/ 底下所有 .ts，含子目錄 */
function apiSources(dir = "api", acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) apiSources(full, acc);
    else if (entry.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(API_OUT, { recursive: true });
// 讓轉譯產物被當成 ESM，與 Vercel 的執行方式一致。
writeFileSync(join(OUT, "package.json"), '{"type":"module"}\n');

console.log("\n逐檔轉譯（模擬 Vercel：不打包，輸出 ESM）");

const sources = apiSources();
try {
  execFileSync(
    "npx",
    ["esbuild", ...sources, "--outdir=" + API_OUT, "--outbase=api",
     "--platform=node", "--target=node20", "--format=esm", "--packages=external"],
    { stdio: "pipe" },
  );
  check(`轉譯 ${sources.length} 個檔案`, true, sources.map((s) => s.replace("api/", "")).join(" "));
} catch (err) {
  check("轉譯", false, String(err.stderr ?? err).slice(0, 400));
}

console.log("\n用 Node 真正的 ESM 解析器載入（少寫副檔名就會失敗）");

/** 每一支有 default export 的端點都要載得起來 */
const endpoints = sources
  .filter((s) => !s.includes("/_"))
  .map((s) => s.replace(/^api\//, "").replace(/\.ts$/, ".js"));

const loaded = {};
for (const rel of endpoints) {
  try {
    const mod = await import(pathToFileURL(join(API_OUT, rel)).href);
    loaded[rel] = mod;
    check(`載入 api/${rel}`, typeof (mod.default ?? mod) === "function");
  } catch (err) {
    check(`載入 api/${rel}`, false, err.message);
  }
}

const writing = loaded["analyze-writing.js"];
if (!writing) {
  console.log("\n（analyze-writing 沒載起來，跳過授權關卡檢查）");
} else {
  console.log("\n授權關卡（離線）");

  const handler = writing.default;
  check("config.maxDuration = 60", writing.config?.maxDuration === 60, String(writing.config?.maxDuration));

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
    "缺環境變數 → 500，訊息不指出是哪一個變數",
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

  // mode 檢查必須排在授權之後：參數錯誤的回應也是資訊，未授權的呼叫端
  // 不該從中讀出這個端點接受哪些 mode。
  res = mockRes();
  await handler({ method: "POST", headers: {}, body: { essayId: ESSAY_ID, mode: "full" } }, res);
  check("未授權 + 無效 mode → 仍然是 401（不是 400）", res.code === 401, `${res.code}`);
  check("mode 檢查也沒有觸發對外呼叫", outbound === 0, `${outbound} 次`);

  globalThis.fetch = realFetch;
}

rmSync(OUT, { recursive: true, force: true });

console.log(failed ? "\n部署前檢查未通過" : "\n部署前檢查通過");
process.exit(failed ? 1 : 0);
