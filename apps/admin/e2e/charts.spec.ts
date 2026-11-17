import { expect, type Page, test } from "@playwright/test";

// Biểu đồ (SVG vẽ ở máy chủ): doanh thu ở Tổng quan (chọn kỳ 7/30 ngày, so kỳ trước) và doanh thu theo
// ngày từng kênh ở Báo cáo kênh bán (mốc 7/30/90 ngày). Số liệu từ dữ liệu mẫu (W-006).

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

test("tổng quan: biểu đồ doanh thu có nhãn, đổi kỳ đổi URL và số điểm; sparkline ở ô số liệu", async ({
  page,
}) => {
  await signIn(page, "/");
  const card = page.locator(".dash-chart");
  const chart = card.getByRole("img", { name: /^Revenue\. Total .*₫/ });
  await expect(chart).toBeVisible();
  // Kỳ mặc định 7 ngày: đường kỳ này và kỳ trước (nét đứt), mỗi đường 7 điểm.
  await expect(chart.locator("path.chart-line")).toHaveCount(2);
  await expect(chart.locator("path.chart-line").first()).toHaveAttribute("data-points", "7");
  await expect(card.locator(".chart-legend")).toContainText("Last 7 days");
  await expect(card.locator(".chart-legend")).toContainText("The 7 days before");

  await card.getByRole("link", { name: "30 days" }).click();
  await expect(page).toHaveURL(/\?rev=30/);
  await expect(card.getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "page");
  await expect(chart.locator("path.chart-line").first()).toHaveAttribute("data-points", "30");

  // Bảng "View data" có một hàng mỗi ngày.
  await card.getByText("View data").click();
  await expect(card.locator(".chart-data tbody tr")).toHaveCount(30);

  // Bàn phím: thanh trượt qua các ngày, đọc giá trị của mọi chuỗi.
  const slider = card.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuenow", "29");
  await expect(slider).toHaveAttribute("aria-valuetext", /Last 30 days .*₫/);

  // Ô "Doanh thu hôm nay" có sparkline 14 ngày.
  const tile = page.locator(".dash-tile", { hasText: "Revenue today" });
  await expect(tile.getByRole("img", { name: /^Revenue, last 14 days: from/ })).toBeVisible();
});

test("báo cáo kênh: doanh thu theo ngày mỗi kênh một đường; mốc 90 ngày đổi URL và số điểm", async ({
  page,
}) => {
  await signIn(page, "/sales/channels/report");
  const chart = page.getByRole("img", { name: /^Revenue by day\. \d+ channels?, total/ });
  await expect(chart).toBeVisible();
  const lines = chart.locator("path.chart-line");
  expect(await lines.count()).toBeGreaterThanOrEqual(2);
  await expect(lines.first()).toHaveAttribute("data-points", "30");
  await expect(page.locator(".chart-legend")).toContainText("Website");

  const presets = page.getByRole("navigation", { name: "Quick report periods" });
  await expect(presets.getByRole("link", { name: "30 days" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await presets.getByRole("link", { name: "90 days" }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  await expect(presets.getByRole("link", { name: "90 days" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByLabel("From")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  await expect(lines.first()).toHaveAttribute("data-points", "90");
});
