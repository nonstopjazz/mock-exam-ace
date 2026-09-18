import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const BASE = 'http://127.0.0.1:5322/preview.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS  ' + m); } else { fail++; console.log('FAIL  ' + m); } };

const b = await chromium.launch();

async function attemptLogin(errCase, viewport = { width: 390, height: 844 }) {
  const p = await b.newPage({ viewport });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${BASE}?err=${errCase}`, { waitUntil: 'networkidle' });
  await p.fill('#login-email', 'someone@example.com');
  await p.fill('#login-password', 'whatever123');
  await p.locator('form').filter({ has: p.locator('#login-password') }).locator('button[type=submit]').click();
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    hintButtons: Array.from(document.querySelectorAll('[role=status] button')).map(x => x.innerText.trim()),
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    oauth: window.__oauth || 0,
  }));
  return { p, info, errs };
}

// ── 1. 帳密不符（有 error code）→ 要出現提示 ──────────────────
{
  const { p, info, errs } = await attemptLogin('invalid');
  ok(info.text.includes('Invalid login credentials'), '1. 原本的錯誤訊息仍然顯示');
  ok(info.text.includes('如果你當初是用 Google 註冊的，請改用 Google 登入。'), '1. 出現指定的那句提示');
  ok(info.text.includes('沒有設定過密碼'), '1. 有解釋為什麼密碼會失敗');
  ok(info.hintButtons.some(t => t.includes('使用 Google 帳號繼續')), '1. 提示區塊裡有可直接按的 Google 按鈕');
  ok(!info.hScroll, '1. 390px 下沒有橫向捲軸');
  ok(errs.length === 0, '1. 無 JS 錯誤');

  // 按下提示裡的 Google 按鈕，要真的觸發 OAuth
  await p.locator('[role=status] button').click();
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => window.__oauth || 0);
  ok(after === 1, '1. 提示裡的按鈕會實際發起 Google 登入');
  await p.close();
}

// ── 2. 同樣的錯誤但沒有 code → 靠訊息比對也要接住 ─────────────
{
  const { p, info } = await attemptLogin('invalid-nocode');
  ok(info.text.includes('請改用 Google 登入'), '2. 沒有 error code 時，靠訊息字串也能判斷出來');
  await p.close();
}

// ── 3. 其他錯誤 → 不可以出現 Google 提示 ─────────────────────
{
  const { p, info } = await attemptLogin('unconfirmed');
  ok(info.text.includes('Email not confirmed'), '3. 顯示的是原本那個錯誤');
  ok(!info.text.includes('請改用 Google 登入'), '3. 「信箱未驗證」不會誤跳 Google 提示');
  await p.close();
}

// ── 4. 登入成功 → 不留下任何提示 ─────────────────────────────
{
  const { p, info } = await attemptLogin('ok');
  ok(!info.text.includes('請改用 Google 登入'), '4. 登入成功時沒有提示');
  await p.close();
}

// ── 5. 先失敗、再改用 Google → 提示要消失 ────────────────────
{
  const { p } = await attemptLogin('invalid');
  await p.locator('button', { hasText: '使用 Google 帳號繼續' }).first().click();
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => document.body.innerText);
  ok(!t.includes('請改用 Google 登入'), '5. 改按 Google 之後提示與錯誤都清掉了');
  await p.close();
}

// ── 6. 桌機寬度 ──────────────────────────────────────────────
{
  const { p, info } = await attemptLogin('invalid', { width: 1280, height: 900 });
  ok(info.text.includes('請改用 Google 登入'), '6. 桌機寬度下提示照常顯示');
  ok(!info.hScroll, '6. 1280px 下沒有橫向捲軸');
  await p.screenshot({ path: '/var/lib/pgtest/hint-desktop.png', fullPage: true });
  await p.close();
}

// ── 7. 深色模式 ──────────────────────────────────────────────
{
  const { p } = await attemptLogin('invalid');
  await p.evaluate(() => document.documentElement.classList.add('dark'));
  await p.waitForTimeout(300);
  const colors = await p.evaluate(() => {
    const box = document.querySelector('[role=status]');
    return { bg: getComputedStyle(box).backgroundColor, border: getComputedStyle(box).borderColor };
  });
  ok(colors.bg !== 'rgba(0, 0, 0, 0)', '7. 深色模式下提示區塊底色有跟著換: ' + colors.bg);
  await p.screenshot({ path: '/var/lib/pgtest/hint-dark.png', fullPage: true });
  await p.close();
}

await b.close();
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
