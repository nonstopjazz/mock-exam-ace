import { defineConfig, devices } from "@playwright/test";

/**
 * 學生端閱讀流程的 E2E。
 *
 * 執行：npm run e2e（第一次要先 npx playwright install chromium）
 *
 * 🛑 瀏覽器不隨 npm install 下載（見 .npmrc）。Vercel 的 installCommand 是
 *    npm install，會一併裝 devDependencies——不擋的話每次部署都多抓 ~150MB。
 *
 * 容器裡如果已經有現成的 chromium，用 PLAYWRIGHT_CHROMIUM_PATH 指給它。
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --config vite.config.e2e.ts --port 5173 --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
