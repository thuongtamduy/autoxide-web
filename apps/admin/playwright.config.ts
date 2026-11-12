import { defineConfig, devices } from "@playwright/test";

// Test e2e chạy bản build thật (bản standalone, như khi triển khai) với một core giả (`e2e/mock-core.ts`).
// Build trước: `pnpm build`. Trình duyệt: `pnpm exec playwright install chromium`, hoặc đặt
// PLAYWRIGHT_CHROMIUM_EXECUTABLE trỏ tới một Chromium có sẵn.
const CORE_PORT = 4010;
const APP_PORT = 3100;
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
      command: "node e2e/mock-core.ts",
      url: `http://127.0.0.1:${CORE_PORT}/__stats`,
      env: { MOCK_CORE_PORT: String(CORE_PORT) },
      reuseExistingServer: false,
    },
    {
      command: "node scripts/start-standalone.mjs",
      url: `http://localhost:${APP_PORT}/login`,
      env: {
        AUTOXIDE_API_URL: `http://127.0.0.1:${CORE_PORT}`,
        PORT: String(APP_PORT),
        HOSTNAME: "localhost",
      },
      reuseExistingServer: false,
    },
  ],
});
