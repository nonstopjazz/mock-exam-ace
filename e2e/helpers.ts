import { expect, type Locator, type Page } from "@playwright/test";
import type { FakeDb } from "./fake-supabase";

export const HOME = "/learn/student/reading";
export const STATS = "/learn/student/reading/stats";
export const practiceUrl = (passageId: string) => `${HOME}/${passageId}`;

/**
 * 在頁面載入【之前】把假後端的狀態塞進 localStorage。
 *
 * 🛑 一定要用 addInitScript，不能載入後才寫。應用程式第一次 render 就會
 *    呼叫 getSession 與 learn_feature_enabled，晚一步就來不及。
 *
 * 🛑 addInitScript 每一次導覽都會再跑一次，所以【只在還沒有值的時候寫】。
 *    無條件覆蓋的話，reload 與換頁都會把累積的作答洗掉，而那正是
 *    resume 與重新整理那幾條要驗的東西。
 */
export async function seed(page: Page, db: Partial<FakeDb> = {}): Promise<void> {
  await page.addInitScript((value) => {
    if (!window.localStorage.getItem("e2e_db")) {
      window.localStorage.setItem("e2e_db", value as string);
    }
  }, JSON.stringify({ signedIn: true, featureEnabled: true, sessions: [], attempts: [], ...db }));
}

/** 直接讀假後端。用來斷言「資料庫裡發生了什麼」，不只是畫面長什麼樣 */
export async function db(page: Page): Promise<FakeDb> {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("e2e_db") ?? "{}") as FakeDb);
}

/** 一題一張卡，卡片本來就有 id="q-<question_id>" */
export const questionCard = (page: Page, passageId: string, n: number): Locator =>
  page.locator(`#q-${passageId}-q${n}`);

/**
 * 正解那個選項的按鈕。
 *
 * 🛑 用【文字】找，不是字母。題庫的正解一律是 B，但每個人看到它的位置不同——
 *    寫死「按 B」等於假設沒有亂序，那正是這些測試要防的事。
 */
export const correctOption = (page: Page, passageId: string, n: number): Locator =>
  questionCard(page, passageId, n)
    .getByRole("button", { name: new RegExp(`${passageId}-q${n}-opt-B`) });

export const wrongOption = (page: Page, passageId: string, n: number): Locator =>
  questionCard(page, passageId, n)
    .getByRole("button", { name: new RegExp(`${passageId}-q${n}-opt-A`) });

/** 正解這一次【顯示在哪個位置】。用來確認亂序真的發生了 */
export async function displayedLabelOfCorrect(
  page: Page, passageId: string, n: number,
): Promise<string> {
  const text = await correctOption(page, passageId, n).innerText();
  return text.trim().charAt(0);
}

export async function answerQuestion(
  page: Page, passageId: string, n: number, correct = true,
): Promise<void> {
  const card = questionCard(page, passageId, n);
  await expect(card).toBeVisible();
  await (correct ? correctOption(page, passageId, n) : wrongOption(page, passageId, n)).click();
  await card.getByRole("button", { name: "送出這一題" }).click();
  await expect(card.getByText(correct ? "答對" : "答錯")).toBeVisible();
}

/** 六題都答對，然後按看結果 */
export async function finishPassage(page: Page, passageId: string): Promise<void> {
  for (let n = 1; n <= 6; n++) await answerQuestion(page, passageId, n);
  await page.getByRole("button", { name: /看結果/ }).click();
  await expect(page.getByText("練習結束")).toBeVisible({ timeout: 10_000 });
}
