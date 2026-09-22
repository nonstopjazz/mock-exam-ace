import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const BASE = 'http://127.0.0.1:5311/preview.html';

let pass = 0, fail = 0;
const ok  = (c, m) => { if (c) { pass++; console.log('PASS  ' + m); } else { fail++; console.log('FAIL  ' + m); } };

const browser = await chromium.launch();

async function open(page, source) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(`${BASE}?page=${page}${source ? '&source=pack' : ''}`, { waitUntil: 'networkidle' });
  return { p, errs };
}

/** local 走 stub 的 start 按鈕；pack 走頁面自己的「開始…」按鈕。 */
async function start(p, source) {
  if (!source) { await p.click('[data-testid=start]'); return; }
  await p.waitForTimeout(300);
  const btn = p.locator('button', { hasText: /開始/ });
  await btn.first().click();
}
const rpcs   = p => p.evaluate(() => window.__rpc.filter(c => c.fn === 'record_lexical_attempt').map(c => c.args));
const legacy = p => p.evaluate(() => window.__legacy);

// ── 1 & 2. Quick Quiz：level 與 pack 都要能完整跑完 ────────────
for (const src of [false, true]) {
  const label = src ? 'pack' : 'level';
  const { p, errs } = await open('quiz', src);
  await start(p, src);
  await p.waitForSelector('div.grid button', { timeout: 5000 }).catch(() => {});
  // 作答 3 題
  for (let i = 0; i < 3; i++) {
    const opts = await p.locator('div.grid button').all();
    if (!opts.length) break;
    await opts[0].click();
    await p.waitForTimeout(150);
    const next = p.locator('button', { hasText: /Next Question|View Results|下一題|查看結果/ });
    if (await next.count()) { await next.first().click(); await p.waitForTimeout(150); }
  }
  const calls = await rpcs(p);
  const lg = await legacy(p);
  ok(calls.length >= 1, `[1/2] quick_quiz(${label}) 有送出 attempt（${calls.length} 筆）`);
  ok(calls.every(c => c.p_exercise_type === 'quick_quiz'), `[1/2] quick_quiz(${label}) exercise_type 正確`);
  ok(calls.every(c => c.p_skill_dimension === 'meaning'), `[1/2] quick_quiz(${label}) skill_dimension = meaning`);
  ok(calls.every(c => typeof c.p_response_time_ms === 'number' && c.p_response_time_ms >= 0), `[1/2] quick_quiz(${label}) 有 response_time_ms（舊系統沒有）`);
  ok(calls.every(c => c.p_legacy_source === (src ? 'pack_item' : 'level_word')), `[1/2] quick_quiz(${label}) legacy_source 正確`);
  if (src) ok(calls.every(c => c.p_pack_id), '[2] pack 來源有帶 pack_id');
  ok(lg.length >= 1, `[9] quick_quiz(${label}) 舊路徑仍然寫入 user_word_progress（${lg.length} 筆）`);
  ok(errs.length === 0, `[1/2] quick_quiz(${label}) 主控台無錯誤` + (errs.length ? ' → ' + errs[0] : ''));
  await p.close();
}

// ── 3. Spelling ───────────────────────────────────────────────
{
  const { p, errs } = await open('spelling');
  await p.click('[data-testid=start]');
  await p.waitForTimeout(300);
  // 點提示，再把字母依序點完（順序隨機 → 大機率答錯，正好測 correct=false）
  const hint = p.locator('button', { hasText: /提示/ });
  if (await hint.count()) await hint.first().click();
  const tiles = await p.locator('div.flex.items-center.justify-center button').all();
  for (const t of tiles) { await t.click().catch(() => {}); }
  await p.waitForTimeout(300);
  const calls = await rpcs(p);
  ok(calls.length >= 1, `[3] spelling 有送出 attempt（${calls.length} 筆）`);
  ok(calls.every(c => c.p_exercise_type === 'spelling'), '[3] spelling exercise_type 正確');
  ok(calls.every(c => c.p_skill_dimension === 'form_recall'), '[3] spelling skill_dimension = form_recall（不是 meaning）');
  ok(calls.every(c => typeof c.p_attempt_count === 'number'), '[3] spelling 有 attempt_count');
  ok(calls.every(c => c.p_used_hint === true), '[3] spelling 有記錄用過提示');
  ok(calls.every(c => typeof c.p_response_time_ms === 'number'), '[3] spelling 有 response_time_ms');
  ok(errs.length === 0, '[3] spelling 主控台無錯誤' + (errs.length ? ' → ' + errs[0] : ''));
  await p.close();
}

// ── 4. Fill Blank ─────────────────────────────────────────────
{
  const { p, errs } = await open('fill-blank');
  await p.click('[data-testid=start]');
  await p.waitForTimeout(300);
  const opts = await p.locator('div.grid button').all();
  if (opts.length) await opts[0].click();
  await p.waitForTimeout(250);
  const calls = await rpcs(p);
  ok(calls.length >= 1, `[4] fill_blank 有送出 attempt（${calls.length} 筆）`);
  ok(calls.every(c => c.p_exercise_type === 'fill_blank'), '[4] fill_blank exercise_type 正確');
  ok(calls.every(c => c.p_skill_dimension === 'context'), '[4] fill_blank skill_dimension = context');
  ok(calls.every(c => typeof c.p_response_time_ms === 'number'), '[4] fill_blank 有 response_time_ms');
  ok(errs.length === 0, '[4] fill_blank 主控台無錯誤' + (errs.length ? ' → ' + errs[0] : ''));
  await p.close();
}

// ── 5. Match：誤點必須留下紀錄且不動 mastery ───────────────────
{
  const { p, errs } = await open('match');
  await p.click('[data-testid=start]');
  await p.waitForTimeout(300);

  // 依 fixture 的正確對應，刻意點一組【錯的】配對。
  // （之前的寫法是盲點，第一次就配對成功，後面的斷言在空陣列上通過 —— 假綠燈。）
  const MAP = { persist: '堅持', insist: '堅決主張', consist: '由…組成',
                quit: '放棄', resist: '抵抗', assist: '協助', exist: '存在' };
  const leftSel  = 'div.grid > div:nth-child(1) button';
  const rightSel = 'div.grid > div:nth-child(2) button';
  const enText = (await p.locator(leftSel).first().textContent())?.trim();
  const correctZh = MAP[enText];
  const rights = await p.locator(rightSel).all();
  let wrongIdx = -1;
  for (let i = 0; i < rights.length; i++) {
    const t = (await rights[i].textContent())?.trim();
    if (t && t !== correctZh) { wrongIdx = i; break; }
  }
  ok(wrongIdx >= 0, `[5] 測試本身找得到一組錯的配對（左=${enText}，正解=${correctZh}）`);
  await p.locator(leftSel).first().click();
  await p.locator(rightSel).nth(wrongIdx).click();
  await p.waitForTimeout(900);

  // 再做一次正確配對，證明兩條路徑並存
  await p.locator(leftSel).first().click();
  const rights2 = await p.locator(rightSel).all();
  for (let i = 0; i < rights2.length; i++) {
    if ((await rights2[i].textContent())?.trim() === correctZh) { await rights2[i].click(); break; }
  }
  await p.waitForTimeout(600);

  const calls  = await rpcs(p);
  const wrong  = calls.filter(c => c.p_apply_mastery === false);
  const right_ = calls.filter(c => c.p_apply_mastery !== false);
  ok(wrong.length === 2, `[5] 一次誤點對【兩個字】各留一筆紀錄（實得 ${wrong.length} 筆，舊系統 0 筆）`);
  ok(wrong.length > 0 && wrong.every(c => c.p_apply_mastery === false), '[5] 誤點的 apply_mastery = false（attempt 與 mastery 分離）');
  ok(wrong.length > 0 && wrong.every(c => c.p_correct === false), '[5] 誤點記為答錯');
  ok(wrong.length > 0 && wrong.every(c => typeof c.p_response_time_ms === 'number'), '[5] 誤點有 response_time_ms');
  ok(wrong.length > 0 && wrong.every(c => typeof c.p_attempt_count === 'number'), '[5] 誤點有 attempt_count');
  ok(wrong.length > 0 && wrong.every(c => c.p_metadata && c.p_metadata.event === 'wrong_pair'
        && typeof c.p_metadata.elapsed_seconds === 'number'
        && c.p_metadata.picked_english && c.p_metadata.picked_chinese),
     '[5] 誤點有帶 elapsed 與實際點到的兩張牌');
  ok(right_.length === 1 && right_[0].p_correct === true, `[5] 正確配對另外送出 1 筆會計分的 attempt（實得 ${right_.length}）`);
  const lg = await legacy(p);
  ok(lg.length === 1, `[5] 舊路徑【只】被正確配對觸發（legacy ${lg.length} 筆，誤點沒有污染熟練度）`);
  ok(errs.length === 0, '[5] match 主控台無錯誤' + (errs.length ? ' → ' + errs[0] : ''));
  await p.close();
}

// ── 6. Flashcard：曝光不得被當成客觀答對 ──────────────────────
{
  const { p, errs } = await open('flashcards');
  await p.click('[data-testid=start]');
  await p.waitForTimeout(300);
  await p.locator('button', { hasText: /^Flip$/ }).click();      // 翻面 = exposure
  await p.waitForTimeout(400);
  let calls = await rpcs(p);
  const exposure = calls.filter(c => c.p_metadata && c.p_metadata.event === 'exposure');
  ok(exposure.length === 1, '[6] 翻卡產生 1 筆 exposure 紀錄');
  ok(exposure.every(c => c.p_correct === null), '[6] exposure 的 correct 是 null，不會被當成答對');
  ok(exposure.every(c => c.p_apply_mastery === false), '[6] exposure 不動熟練度');
  ok(exposure.every(c => c.p_skill_dimension === 'self_assessment'), '[6] exposure 的 skill_dimension 是 self_assessment');
  ok((await legacy(p)).length === 0, '[6] 純翻卡完全沒有觸發舊的進度寫入（與改版前一致）');

  const mk = p.locator('button', { hasText: /Mark as Known/ });
  if (await mk.count()) { await mk.first().click(); await p.waitForTimeout(400); }
  calls = await rpcs(p);
  const known = calls.filter(c => c.p_metadata && c.p_metadata.event === 'mark_as_known');
  ok(known.length === 1, '[6] Mark as Known 產生 1 筆紀錄');
  ok(known.every(c => c.p_correct === null && c.p_self_rating === 'easy'), '[6] Mark as Known 記為自評，不是客觀答對');
  ok(known.every(c => c.p_apply_mastery !== false), '[6] Mark as Known 仍然更新熟練度（保留舊行為）');
  const lg2 = await legacy(p);
  ok(lg2.length === 1 && lg2[0].masteryLevel === 1 && lg2[0].correctCount === 1,
     `[6] 舊路徑行為與改版前完全一致（mastery ${lg2[0]?.masteryLevel}, correct ${lg2[0]?.correctCount}）`);
  ok(errs.length === 0, '[6] flashcards 主控台無錯誤' + (errs.length ? ' → ' + errs[0] : ''));
  await p.close();
}

// ── 7. Synonym / Antonym ──────────────────────────────────────
{
  const { p, errs } = await open('synonym-antonym');
  await p.click('[data-testid=start]');
  await p.waitForTimeout(300);
  const opts = await p.locator('div.grid button').all();
  if (opts.length) await opts[0].click();
  await p.waitForTimeout(250);
  const calls = await rpcs(p);
  ok(calls.length >= 1, `[7] synonym_antonym 有送出 attempt（${calls.length} 筆）`);
  ok(calls.every(c => c.p_skill_dimension === 'lexical_connection'), '[7] skill_dimension = lexical_connection');
  ok(calls.every(c => c.p_metadata && ['synonym','antonym'].includes(c.p_metadata.question_type)),
     '[7] 有記錄這題考的是同義還是反義（舊系統沒有）');
  ok(errs.length === 0, '[7] synonym_antonym 主控台無錯誤' + (errs.length ? ' → ' + errs[0] : ''));
  await p.close();
}

// ── SRS ───────────────────────────────────────────────────────
{
  const { p, errs } = await open('srs');
  await p.click('[data-testid=start]').catch(() => {});
  await p.waitForTimeout(400);
  const show = p.locator('button', { hasText: /Show Answer/ });
  if (await show.count()) { await show.first().click(); await p.waitForTimeout(250); }
  const hard = p.locator('button', { hasText: /Hard/ });
  if (await hard.count()) { await hard.first().click(); await p.waitForTimeout(300); }
  const calls = await rpcs(p);
  ok(calls.length >= 1, `[srs] 有送出 attempt（${calls.length} 筆）`);
  ok(calls.every(c => c.p_exercise_type === 'srs'), '[srs] exercise_type 正確');
  ok(calls.every(c => c.p_self_rating === 'hard'), '[srs] self_rating 有落地');
  ok(calls.every(c => c.p_correct === null), '[srs] 自評的 correct 是 null，不是客觀測驗證據');
  ok(calls.every(c => typeof c.p_response_time_ms === 'number'), '[srs] reveal 前的思考時間有落地');
  const lg = await legacy(p);
  ok(lg.length === 1 && lg[0].correctCount === 1,
     `[srs] 舊路徑仍收到 isCorrect=true（correctCount ${lg[0]?.correctCount}），行為與改版前一致`);
  ok(errs.length === 0, '[srs] 主控台無錯誤' + (errs.length ? ' → ' + errs[0] : ''));
  await p.close();
}

await browser.close();
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
