/**
 * 「我常犯的錯」的瀏覽器驗證。
 *
 *   npx vite --config vite.preview.config.ts     （另一個終端機）
 *   npm run verify:my-errors
 *
 * 為什麼要真的開瀏覽器：這一頁的重點行為都不是純函式 ——
 * 展開才載入、重複開合不重打、逐詞比對有沒有真的標到色、
 * 空狀態長什麼樣。這些讀程式碼都看不出來。
 *
 * 🛑 資料全部來自 tests/preview/stubs/supabase.ts，不連任何環境。
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const BASE = 'http://127.0.0.1:5311/preview.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS  ' + m); } else { fail++; console.log('FAIL  ' + m); } };
const browser = await chromium.launch();

async function open(qs) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(`${BASE}?page=my-errors${qs}`, { waitUntil: 'networkidle' });
  return { p, errs };
}

// ── 1. 有資料 ─────────────────────────────────────────
{
  const { p, errs } = await open('');
  await p.waitForTimeout(400);
  ok(errs.length === 0, `渲染沒有 runtime 錯誤 ${errs.slice(0,1).join('')}`);

  const body = await p.locator('body').innerText();
  ok(/從你 4 篇批改完成的作文整理出來/.test(body), '有顯示分母（4 篇）');
  ok(/3 篇作文/.test(body) && /共 7 次/.test(body), '第一項顯示 3 篇 / 共 7 次');
  ok(/只出現一次|1 篇作文/.test(body), '只犯過一次的 code 也列出來了（無門檻）');

  // 排序：essay_count 多的在前
  const titles = await p.locator('button[aria-expanded] .font-semibold').allInnerTexts();
  ok(titles.length === 3, `列出 3 種錯誤（實際 ${titles.length}）`);

  // ── 展開才載入 ──
  const before = await p.evaluate(() => window.__rpc.filter(c => c.fn === 'writing_my_error_findings').length);
  ok(before === 0, '展開之前【沒有】打過 drill-down RPC');

  await p.locator('button[aria-expanded]').first().click();
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => window.__rpc.filter(c => c.fn === 'writing_my_error_findings').length);
  ok(after === 1, `展開之後打了 1 次 drill-down（實際 ${after}）`);

  const body2 = await p.locator('body').innerText();
  ok(/I went to hospital yesterday/.test(body2), '展開後看得到自己寫的原句');
  ok(/特定的地點要加冠詞/.test(body2), '展開後看得到說明');
  ok(/看這一篇/.test(body2), '有連回那一篇作文的入口');

  // 逐詞比對：有共用字的那一組要標色
  const marked = await p.locator('span.bg-success\\/15').count();
  ok(marked > 0, `修正處有標色（實際 ${marked} 段）`);

  // 再點一次收合，不應再打 RPC
  await p.locator('button[aria-expanded]').first().click();
  await p.waitForTimeout(150);
  await p.locator('button[aria-expanded]').first().click();
  await p.waitForTimeout(300);
  const after2 = await p.evaluate(() => window.__rpc.filter(c => c.fn === 'writing_my_error_findings').length);
  ok(after2 === 1, `重複開合【不會】重打 RPC（實際 ${after2} 次）`);
  await p.close();
}

// ── 2. 沒有資料 ───────────────────────────────────────
{
  const { p, errs } = await open('&empty=1');
  await p.waitForTimeout(400);
  ok(errs.length === 0, `空狀態沒有 runtime 錯誤 ${errs.slice(0,1).join('')}`);
  const body = await p.locator('body').innerText();
  ok(/還沒有可以整理的錯誤紀錄/.test(body), '空狀態有說明為什麼是空的');
  ok(/交出作文/.test(body), '空狀態有下一步');
  await p.close();
}

await browser.close();
console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
