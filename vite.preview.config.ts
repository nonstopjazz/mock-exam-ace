import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * 只給 tests/preview/ 的驗證 harness 使用，不參與正式 build。
 *
 * 它把七個 practice 頁面的資料來源換成 stub，再用 Playwright 驅動頁面、
 * 檢查送出的 attempt 內容與舊路徑的行為。
 *
 * 用法：
 *   npx vite --config vite.preview.config.ts
 *   node tests/preview/validate.mjs
 *
 * ⚠️ stub 刻意放在 src/ 之外，這樣不可能被正式 bundle 收進去。
 */
const r = (p: string) => path.resolve(__dirname, p);
const stub = (name: string) => r(`./tests/preview/stubs/${name}`);

export default defineConfig({
  root: r("./tests/preview"),
  server: { host: "127.0.0.1", port: 5311 },
  optimizeDeps: { entries: ["preview.html"] },
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/,                                  replacement: stub("supabase.ts") },
      { find: /^@\/contexts\/AuthContext$/,                          replacement: stub("AuthContext.tsx") },
      { find: /^@\/hooks\/galaxy\/useConfetti$/,                     replacement: stub("useConfetti.ts") },
      { find: /^@\/lib\/levelWords$/,                                replacement: stub("levelWords.ts") },
      { find: /^@\/lib\/wordProgressSync$/,                          replacement: stub("wordProgressSync.ts") },
      { find: /^@\/hooks\/useUserPacks$/,                            replacement: stub("useUserPacks.ts") },
      { find: /^@\/components\/vocabulary\/VocabularySelector$/,     replacement: stub("VocabularySelector.tsx") },
      { find: /^@\/components\/vocabulary\/CollectionPackSelector$/, replacement: stub("CollectionPackSelector.tsx") },
      { find: "@", replacement: r("./src") },
    ],
  },
});
