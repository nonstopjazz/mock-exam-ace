import { expect, test } from "@playwright/test";
import {
  HOME, STATS, answerQuestion, correctOption, db, displayedLabelOfCorrect,
  finishPassage, practiceUrl, questionCard, seed, wrongOption,
} from "./helpers";

/**
 * 學生端閱讀流程的 E2E。
 *
 * 全部走【真實前端】：真的路由、真的 state、真的 render 排程。
 * 被換掉的只有網路那一層（見 e2e/fake-supabase.ts）。
 *
 * 🛑 這裡的每一條都要能在「只有純函式測試」的情況下漏掉才有價值。
 *    這兩天實際踩到的兩個 bug 都是那種——各自留了一條在下面。
 */

const P1 = "KR0001";
const P2 = "KR0002";

// ── 1. 未登入 ────────────────────────────────────────────────────────

test("未登入的人進閱讀練習會被導去登入，而且記得原本要去哪裡", async ({ page }) => {
  await seed(page, { signedIn: false });
  await page.goto(HOME);

  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  expect(decodeURIComponent(page.url())).toContain(HOME);
});

test("未登入的人直接打練習頁的網址也一樣被擋", async ({ page }) => {
  await seed(page, { signedIn: false });
  await page.goto(practiceUrl(P1));
  await expect(page).toHaveURL(/\/login\?returnUrl=/);
});

// ── 2. 開始新的練習 ──────────────────────────────────────────────────

test("沒練過的人看到【開始練習】，按下去進到第一篇", async ({ page }) => {
  await seed(page);
  await page.goto(HOME);

  await expect(page.getByRole("button", { name: /開始練習/ })).toBeVisible();
  await expect(page.getByText(/繼續上次練習/)).toHaveCount(0);
  await expect(page.getByText("已完成")).toBeVisible();

  await page.getByRole("button", { name: /開始練習/ }).click();
  await expect(page).toHaveURL(new RegExp(`${P1}$`));

  // 六題都在
  for (let n = 1; n <= 6; n++) await expect(questionCard(page, P1, n)).toBeVisible();

  // 而且後端真的開了一個 session
  const state = await db(page);
  expect(state.sessions.filter((s) => s.status === "IN_PROGRESS")).toHaveLength(1);
});

// ── 3. 續做 ──────────────────────────────────────────────────────────

test("有做到一半的練習時，首頁改成【繼續上次練習】並回到那一篇", async ({ page }) => {
  const sessionId = "sess-resume";
  await seed(page, {
    sessions: [{
      id: sessionId, passage_id: P2, status: "IN_PROGRESS",
      started_at: "2026-09-26T10:00:00.000Z", submitted_at: null,
    }],
    // 🛑 要有作答紀錄才算做到一半（見下面「空 session」那一條）
    attempts: [{
      session_id: sessionId, question_id: `${P2}-q1`, selected_answer: "A",
      is_correct: false, response_time_ms: 1000, answer_change_count: 0, first_answer: "A",
    }],
  });
  await page.goto(HOME);

  await expect(page.getByRole("button", { name: /繼續上次練習/ })).toBeVisible();
  await expect(page.getByText("做到一半")).toBeVisible();

  await page.getByRole("button", { name: /繼續上次練習/ }).click();
  await expect(page).toHaveURL(new RegExp(`${P2}$`));

  // 答過的那一題是鎖住的，沒答的還可以作答
  await expect(questionCard(page, P2, 1).getByRole("button", { name: "送出這一題" }))
    .toHaveCount(0);
  await expect(questionCard(page, P2, 2).getByRole("button", { name: "送出這一題" }))
    .toBeVisible();
  await expect(page.getByText(/已經答了 1 題/)).toBeVisible();
});

// ── 4 + 5. 六題依序作答，亂序之後仍然判分正確 ────────────────────────

test("六題依序作答；點的是正解的文字，不管它被排到哪個位置", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));

  const positions: string[] = [];
  for (let n = 1; n <= 6; n++) {
    positions.push(await displayedLabelOfCorrect(page, P1, n));
    await answerQuestion(page, P1, n);
  }

  // 🛑 六題的正解不會全部排在同一個位置。全部一樣代表根本沒有重排，
  //    而題庫的正解【一律是 B】——那個偏斜就是這件事要解決的問題。
  expect(new Set(positions).size).toBeGreaterThan(1);

  const state = await db(page);
  expect(state.attempts).toHaveLength(6);
  expect(state.attempts.every((a) => a.is_correct)).toBe(true);
  // 存下來的是顯示位置，不是題庫的原始標籤
  state.attempts.forEach((a, i) => expect(a.selected_answer).toBe(positions[i]));
});

test("答錯就是答錯，而且會標出正解在哪個位置", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));

  await answerQuestion(page, P1, 1, false);

  const card = questionCard(page, P1, 1);
  await expect(card.getByText("答錯")).toBeVisible();
  // 🛑 正解那一顆被標成正確的樣式。點的是 opt-A 這段【文字】，
  //    它的原始標籤永遠是 A，所以不管被排到哪個位置都一定是錯的。
  await expect(correctOption(page, P1, 1)).toHaveClass(/border-success/);

  const state = await db(page);
  expect(state.attempts[0].is_correct).toBe(false);
});

// ── 6. 同一題不能留下第二筆作答 ──────────────────────────────────────

test("送出之後那一題就鎖住，不會留下第二筆作答", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  await answerQuestion(page, P1, 1);

  const card = questionCard(page, P1, 1);
  await expect(card.getByRole("button", { name: "送出這一題" })).toHaveCount(0);
  // 四顆選項全部 disabled——改不了
  const options = card.getByRole("button");
  for (let i = 0; i < await options.count(); i++) {
    await expect(options.nth(i)).toBeDisabled();
  }

  // 重新整理再回來，仍然只有一筆
  await page.reload();
  await expect(card.getByText("答對")).toBeVisible();
  const state = await db(page);
  expect(state.attempts.filter((a) => a.question_id === `${P1}-q1`)).toHaveLength(1);
});

// ── 7 + 8. 結算 ──────────────────────────────────────────────────────

test("六題做完按【看結果】會進結算，不會卡住", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  for (let n = 1; n <= 6; n++) await answerQuestion(page, P1, n);

  const finish = page.getByRole("button", { name: /看結果/ });
  await expect(finish).toBeEnabled();
  await finish.click();

  // 🛑 這一條是 regression：finish() 曾經因為用 setState 的 updater 讀 state，
  //    帶著 finishing: true 提早 return——按鈕永遠 disabled、spinner 永遠轉、
  //    沒有錯誤訊息也沒有送出請求。10 秒的寬限是給它機會失敗。
  await expect(page.getByText("練習結束")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("全對")).toBeVisible();
  await expect(page.getByText("六題都寫了")).toBeVisible();

  const state = await db(page);
  expect(state.sessions[0].status).toBe("SUBMITTED");
  expect(state.sessions[0].submitted_at).not.toBeNull();
});

test("沒答完也可以結束，沒作答的題目標成沒作答而不是答錯", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  await answerQuestion(page, P1, 1);

  await page.getByRole("button", { name: /結束並看結果/ }).click();
  await expect(page.getByText("練習結束")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("沒作答").first()).toBeVisible();
});

// ── 9. 分析頁 ────────────────────────────────────────────────────────

test("分析頁看得到剛才那一篇練習", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  await finishPassage(page, P1);

  await page.goto(STATS);
  await expect(page.getByText("我的閱讀能力")).toBeVisible();
  await expect(page.getByText("最近的練習")).toBeVisible();
  await expect(page.getByText("The Mountain That Moved Only on Paper")).toBeVisible();
  await expect(page.getByText("練過 1 篇 · 1 次練習")).toBeVisible();
});

// ── 10. 空 session（regression）────────────────────────────────────────

test("只點進去看一眼沒作答，首頁不可以說【繼續上次練習】", async ({ page }) => {
  await seed(page);

  // 打開文章就會建 session——這一步本身就是 bug 的來源
  await page.goto(practiceUrl(P1));
  await expect(questionCard(page, P1, 1)).toBeVisible();
  const opened = await db(page);
  expect(opened.sessions).toHaveLength(1);
  expect(opened.attempts).toHaveLength(0);

  await page.goto(HOME);

  // 🛑 regression：一題都沒答的 IN_PROGRESS 被當成進度，
  //    首頁就會對著一個從來沒作答過的人說「繼續上次練習」。
  await expect(page.getByRole("button", { name: /開始練習/ })).toBeVisible();
  await expect(page.getByText("做到一半")).toHaveCount(0);
  await expect(page.getByText("已完成")).toBeVisible();

  // 而且【下一篇就是它】——它確實還沒練完
  await page.getByRole("button", { name: /開始練習/ }).click();
  await expect(page).toHaveURL(new RegExp(`${P1}$`));
});

// ── 11. 已完成的不可以被當成未完成 ───────────────────────────────────

test("練完一篇之後，它不會再被當成做到一半，下一篇換人", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  await finishPassage(page, P1);

  await page.goto(HOME);
  await expect(page.getByRole("button", { name: /開始練習/ })).toBeVisible();
  await expect(page.getByText("做到一半")).toHaveCount(0);
  await expect(page.getByText(P2 === "KR0002"
    ? "Reading the Ocean's Silent Signals" : P2)).toBeVisible();

  await page.getByRole("button", { name: /開始練習/ }).click();
  await expect(page).toHaveURL(new RegExp(`${P2}$`));
});

test("重做已經交過的那一篇會開新的 session，不會被當成續做", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  await finishPassage(page, P1);

  await page.goto(practiceUrl(P1));
  await expect(questionCard(page, P1, 1)).toBeVisible();
  // 🛑 新的一次，所以六題都可以重答，也不該出現「你之前練過」的提示
  await expect(page.getByText(/已經答了/)).toHaveCount(0);
  await expect(questionCard(page, P1, 1).getByRole("button", { name: "送出這一題" }))
    .toBeVisible();

  const state = await db(page);
  expect(state.sessions).toHaveLength(2);
  expect(state.sessions.filter((s) => s.status === "SUBMITTED")).toHaveLength(1);
});

// ── 12. 重新整理 / 上一頁 / 直接輸入網址 ──────────────────────────────

test("練到一半重新整理，答過的題目還是鎖住的", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  await answerQuestion(page, P1, 1);
  await answerQuestion(page, P1, 2);

  const before = await db(page);
  await page.reload();

  await expect(questionCard(page, P1, 1).getByText("答對")).toBeVisible();
  await expect(questionCard(page, P1, 2).getByText("答對")).toBeVisible();
  await expect(questionCard(page, P1, 3).getByRole("button", { name: "送出這一題" }))
    .toBeVisible();

  const after = await db(page);
  // 🛑 重新整理不可以開出第二個 session，也不可以多出作答
  expect(after.sessions).toHaveLength(before.sessions.length);
  expect(after.attempts).toHaveLength(2);
});

test("重新整理之後選項的位置不變", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));

  const before = await displayedLabelOfCorrect(page, P1, 3);
  await page.reload();
  await expect(questionCard(page, P1, 3)).toBeVisible();
  const after = await displayedLabelOfCorrect(page, P1, 3);

  // 🛑 重整就重排的話，學生已經點選的答案會指到別的選項上
  expect(after).toBe(before);
});

test("按上一頁回到首頁，狀態是對的", async ({ page }) => {
  await seed(page);
  await page.goto(HOME);
  await page.getByRole("button", { name: /開始練習/ }).click();
  await answerQuestion(page, P1, 1);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${HOME}$`));
  // 現在真的做到一半了
  await expect(page.getByRole("button", { name: /繼續上次練習/ })).toBeVisible();
});

test("直接輸入某一篇的網址進得去，而且不影響其他篇", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P2));
  await expect(questionCard(page, P2, 1)).toBeVisible();
  await answerQuestion(page, P2, 1);

  await page.goto(practiceUrl(P1));
  await expect(questionCard(page, P1, 1).getByRole("button", { name: "送出這一題" }))
    .toBeVisible();

  const state = await db(page);
  expect(state.sessions).toHaveLength(2);
  expect(state.attempts).toHaveLength(1);
});

// ── 字彙題標的是哪一次出現 ───────────────────────────────────────────

test("字彙題只標【被考的那一次】，不是每一次", async ({ page }) => {
  await seed(page);
  await page.goto(practiceUrl(P1));
  await expect(questionCard(page, P1, 1)).toBeVisible();

  // anchorword 在文章裡出現三次，題目考的是第二次
  await expect(page.getByText("anchorword")).toHaveCount(3);

  const marks = page.locator("mark", { hasText: "anchorword" });
  // 🛑 只有一個被標起來。看到同一個字就全部標粗，學生還是不知道問的是哪一個。
  await expect(marks).toHaveCount(1);

  // 🛑 而且是第二段那一個——「總是標第一個」會在這裡失敗
  const paragraphs = page.locator("p", { hasText: "anchorword" });
  await expect(paragraphs.nth(0).locator("mark")).toHaveCount(0);
  await expect(paragraphs.nth(1).locator("mark")).toHaveCount(1);
  await expect(paragraphs.nth(2).locator("mark")).toHaveCount(0);

  await expect(page.getByText(/字彙題問的是/)).toBeVisible();
});

// ── 附帶：閘門 ───────────────────────────────────────────────────────

test("沒被開放閱讀練習的學生看不到內容", async ({ page }) => {
  await seed(page, { featureEnabled: false });
  await page.goto(HOME);
  await expect(page.getByRole("button", { name: /開始練習/ })).toHaveCount(0);
  await expect(wrongOption(page, P1, 1)).toHaveCount(0);
});
