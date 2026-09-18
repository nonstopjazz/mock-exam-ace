import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
const r = (p: string) => path.resolve(__dirname, p);
export default defineConfig({
  root: r("./tests/login-hint"),
  server: { host: "127.0.0.1", port: 5322 },
  optimizeDeps: { entries: ["preview.html"] },
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/, replacement: r("./tests/login-hint/stubs/supabase.ts") },
      { find: "@", replacement: r("./src") },
    ],
  },
});
