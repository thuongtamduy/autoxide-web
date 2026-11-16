import { defineConfig, devices } from "@playwright/test";

// Test e2e của website chạy bản build thật (standalone, như khi triển khai) với core giả của trang
// quản trị (`apps/admin/e2e/mock-core.ts`, phần công khai ở `mock-storefront.ts`). Cổng riêng (core
// 4012, website 3200) để chạy được sau — hay cùng lúc với — test của trang quản trị (4010 / 3100).
// Build trước: `pnpm build`. Trình duyệt: `pnpm exec playwright install chromium`, hoặc đặt
// PLAYWRIGHT_CHROMIUM_EXECUTABLE trỏ tới một Chromium có sẵn.
const CORE_PORT = 4012;
const APP_PORT = 3200;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "off",
    ...devices["Desktop Chrome"],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    {
      command: "node ../admin/e2e/mock-core.ts",
      url: `http://127.0.0.1:${CORE_PORT}/__stats`,
      env: { MOCK_CORE_PORT: String(CORE_PORT) },
      reuseExistingServer: false,
    },
    {
      command: "node scripts/start-standalone.mjs",
      url: `http://localhost:${APP_PORT}/robots.txt`,
      env: {
        AUTOXIDE_API_URL: `http://127.0.0.1:${CORE_PORT}`,
        AUTOXIDE_STOREFRONT_URL: `http://localhost:${APP_PORT}`,
        // Bản build chạy như production (dữ liệu mẫu mặc định tắt): bật để thử cả phần mẫu.
        AUTOXIDE_WEB_SAMPLE_DATA: "true",
        PORT: String(APP_PORT),
        HOSTNAME: "localhost",
      },
      reuseExistingServer: false,
    },
    // Ba kiểu giao diện còn lại (`e2e/themes.spec.ts`): cùng bản build, khác `AUTOXIDE_STOREFRONT_THEME`.
    ...(["market", "minimal", "luxe"] as const).map((theme, index) => ({
      command: "node scripts/start-standalone.mjs",
      url: `http://localhost:${APP_PORT + 1 + index}/robots.txt`,
      env: {
        AUTOXIDE_API_URL: `http://127.0.0.1:${CORE_PORT}`,
        AUTOXIDE_STOREFRONT_URL: `http://localhost:${APP_PORT + 1 + index}`,
        AUTOXIDE_WEB_SAMPLE_DATA: "true",
        AUTOXIDE_STOREFRONT_THEME: theme,
        PORT: String(APP_PORT + 1 + index),
        HOSTNAME: "localhost",
      },
      reuseExistingServer: false,
    })),
  ],
});
