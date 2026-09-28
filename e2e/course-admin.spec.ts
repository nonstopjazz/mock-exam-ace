import { expect, test } from "@playwright/test";
import { seed } from "./helpers";

/**
 * 管理端課程頁的煙霧測試。
 *
 * 🛑 這一支【不驗管理端的規則】。刪除的守門、position 重排、權限三層
 *    都由 supabase/tests/learn_course_admin_test.sql 的 43 條斷言驗證，
 *    而且是對真的 Postgres 驗的。
 *
 * 這一支只擋一件事：頁面在瀏覽器裡到底打不打得開。
 *
 * 為什麼需要它——這一輪實際發生過：一個重複的 import 讓整個 bundle
 * 在瀏覽器裡爆掉，而 `tsc --noEmit` 與 `npm run build` 兩個都放行。
 * 只有真的把頁面載起來才看得見。
 */

/**
 * 只收【未捕捉的例外】。
 *
 * 🛑 刻意不收 console.error：這個 app 有幾支 store（vocabularyStore 等）
 *    繞過 @/lib/supabase 直接打真的網址，在容器裡一定失敗並印錯誤。
 *    把那些算進來，這幾條就會因為跟課程無關的理由變紅——那種測試很快
 *    就會被當成雜訊而被忽略。
 *
 *    未捕捉的例外才是這裡要擋的：上一輪那個重複的 import 就是以
 *    pageerror 的形式出現，而 tsc 與 build 都沒說話。
 */
function watchErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

const ADMIN_LIST = "/admin/courses";

test("課程管理頁載得起來，沒有未捕捉的錯誤", async ({ page }) => {
  await seed(page, { isAdmin: true });
  const errors = watchErrors(page);

  await page.goto(ADMIN_LIST);

  await expect(page.getByRole("heading", { name: "影片課程管理" })).toBeVisible();
  await expect(page.getByText("還沒有任何課程")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Bunny 設定區塊如實顯示「還沒設定」，而且不會印出金鑰", async ({ page }) => {
  await seed(page, { isAdmin: true });
  await page.goto(ADMIN_LIST);

  await expect(page.getByText("Bunny 設定")).toBeVisible();
  await expect(page.getByText("尚未設定")).toBeVisible();
  // 「讀不到」在 badge 與說明文字裡各出現一次，所以指名 badge 那一個
  await expect(page.getByText("讀不到", { exact: true })).toBeVisible();

  // 🛑 這一頁任何地方都不該出現金鑰。後端只回布林，這裡確認畫面也沒別的來源。
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("BUNNY_TOKEN_AUTH_KEY=");
  expect(body).toMatch(/BUNNY_TOKEN_AUTH_KEY/); // 只出現在說明文字裡
});

test("新增課程的對話框打得開，而且講明免費不等於公開", async ({ page }) => {
  await seed(page, { isAdmin: true });
  const errors = watchErrors(page);

  await page.goto(ADMIN_LIST);
  await page.getByRole("button", { name: "新增課程" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("新課一律是草稿，學生看不到")).toBeVisible();
  await expect(page.getByText(/「免費」不等於公開/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("課程編輯頁載得起來，三個分頁都切得動", async ({ page }) => {
  await seed(page, { isAdmin: true });
  const errors = watchErrors(page);

  await page.goto("/admin/courses/c-1/edit");

  await expect(page.getByRole("heading", { name: "煙霧測試課" })).toBeVisible();
  await expect(page.getByText("還沒有章節")).toBeVisible();

  await page.getByRole("tab", { name: "課程資訊" }).click();
  await expect(page.getByLabel("課名")).toBeVisible();

  // 封面是真的上傳元件，不是要人自己打檔名的文字框
  await expect(page.getByText("把圖片拖進來，或按下面的按鈕")).toBeVisible();
  await expect(page.getByText(/1280 × 720（16:9）・最大 2 MB/)).toBeVisible();
  await expect(page.getByRole("button", { name: "選擇圖片" })).toBeVisible();
  // 🛑 原本那格的 placeholder 不該再出現
  await expect(page.getByPlaceholder("course-covers 裡的檔名")).toHaveCount(0);

  await page.getByRole("tab", { name: "開放給誰" }).click();
  await expect(page.getByText(/選課只是第二道閘/)).toBeVisible();

  expect(errors).toEqual([]);
});

test("大綱編輯器加得出章節與影片", async ({ page }) => {
  await seed(page, { isAdmin: true });
  await page.goto("/admin/courses/c-1/edit");

  await page.getByRole("button", { name: /加一個章節/ }).click();
  await expect(page.getByPlaceholder("章節標題")).toBeVisible();

  await page.getByRole("button", { name: "加一支影片" }).click();
  await expect(page.getByPlaceholder("影片標題")).toBeVisible();
  // 預設是 YouTube，所以提示文字要是 YouTube 的
  await expect(page.getByPlaceholder("YouTube 的 11 碼影片 ID")).toBeVisible();
});

test("🛑 不是管理員的人進不去", async ({ page }) => {
  await seed(page, { isAdmin: false });
  await page.goto(ADMIN_LIST);

  await expect(page.getByText("權限不足")).toBeVisible();
  await expect(page.getByRole("heading", { name: "影片課程管理" })).toHaveCount(0);
});

test("舊的 /course-management 導到新位置，不是踢回首頁", async ({ page }) => {
  await seed(page, { isAdmin: true });
  await page.goto("/course-management");

  // 原本這條是 Navigate to="/"——按「編輯」會被踢回首頁
  await expect(page).toHaveURL(/\/admin\/courses$/);
  await expect(page.getByRole("heading", { name: "影片課程管理" })).toBeVisible();
});
