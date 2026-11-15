import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.join(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    // next-intl nhập `next/server` không đuôi `.js`: để Vite xử lý gói này thay vì Node ESM.
    server: { deps: { inline: ["next-intl"] } },
  },
});
