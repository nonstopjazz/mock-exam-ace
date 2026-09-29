import { expect, test } from "@playwright/test";
import { db, seed } from "./helpers";

/**
 * 連點防護的瀏覽器驗證。
 *
 * 🛑 這是【時序】bug，純函式測試只能模擬它。要證明修好了，就得在真的
 *    React 排程下按兩下——那正是原本會穿過去的地方。
 *
 * 驗的不是畫面（畫面上寫一筆跟寫兩筆長得一模一樣），是假後端記到
 * 幾次 record_lexical_attempt。
 */

const QUIZ = "/practice/vocabulary/quiz";

/**
 * 選一個等級、開始測驗，等到四個選項出現。
 *
 * 🛑 選項沒出現就直接讓測試失敗，不要 skip。被 skip 的測試什麼都沒證明，
 *    而它會安靜地留在測試報告裡看起來像通過。
 */
async function startQuiz(page: import("@playwright/test").Page) {
  await page.goto(QUIZ);
  await page.getByText("Level 2", { exact: true }).click();
  await page.getByRole("button", { name: /^開始 \(/ }).click();
  await expect(page.locator('[data-testid="quiz-option"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="quiz-option"]')).toHaveCount(4);
}

test("🛑 快速點兩個不同的選項，只會記一筆作答", async ({ page }) => {
  await seed(page, { attemptLog: [] });
  await startQuiz(page);

  // 選項是四顆並排的按鈕。抓看得見的那一組。
  const options = page.locator('[data-testid="quiz-option"]');

  // 🛑 不用 click() 兩次——那之間會有一次 render。
  //    用 dispatchEvent 在同一個 tick 裡送兩個 click，才是連點的樣子。
  await page.evaluate(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-testid="quiz-option"]');
    els[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    els[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(400);

  const state = await db(page);
  expect(state.attemptLog?.length ?? 0).toBe(1);
});

test("🛑 同一顆選項連點三下，也只記一筆", async ({ page }) => {
  await seed(page, { attemptLog: [] });
  await startQuiz(page);

  const options = page.locator('[data-testid="quiz-option"]');

  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="quiz-option"]');
    for (let i = 0; i < 3; i++) el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(400);

  const state = await db(page);
  expect(state.attemptLog?.length ?? 0).toBe(1);
});

test("正常作答仍然記得到——別把功能一起擋掉了", async ({ page }) => {
  await seed(page, { attemptLog: [] });
  await startQuiz(page);

  const options = page.locator('[data-testid="quiz-option"]');

  await options.first().click();
  await page.waitForTimeout(400);

  const state = await db(page);
  expect(state.attemptLog?.length ?? 0).toBe(1);
});
