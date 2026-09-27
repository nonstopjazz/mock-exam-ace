import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * E2E 專用的 vite 設定。
 *
 * 與正式設定唯一的差別：把 @/lib/supabase 換成假後端。
 * 🛑 應用程式的程式碼【一行都沒有改】——沒有 if (isTest)、沒有注入點。
 *    瀏覽器裡跑的就是使用者拿到的那份前端。
 */
export default defineConfig({
  server: { host: "127.0.0.1", port: 5173 },
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/, replacement: path.resolve(__dirname, "./e2e/fake-supabase.ts") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
});
