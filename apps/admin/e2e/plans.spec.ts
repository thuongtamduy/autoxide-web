import { expect, type Page, test } from "@playwright/test";

// Bước 35 của core (module `plans`), đợt 3 của giao diện (W-047): gói và thuê bao phía khách; gói và
// giá, ghi đè theo khách, thuê bao của mọi khách ở mặt điều khiển nền tảng. Core giả: `mock-plans.ts`
// (gói "Cơ bản" mặc định 290.000 ₫/tháng, "Pro" 990.000 ₫/tháng; khách `Default` đang dùng Cơ bản).

const CORE = "http://127.0.0.1:4010";
const BASIC = "01a1e500-0000-7000-8000-0000000000a1";
const PRO = "01a1e500-0000-7000-8000-0000000000a2";
const BASIC_MONTH = "01a1e500-0000-7000-8000-0000000000b1";
const PRO_MONTH = "01a1e500-0000-7000-8000-0000000000b2";
const PRO_YEAR = "01a1e500-0000-7000-8000-0000000000b3";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const dialog = (page: Page) => page.locator("dialog[open]");

/** Bật nhiều khách ở core giả rồi thêm khách "Trà Sen" (khách nền tảng không có gói). */
async function addCustomer(page: Page) {
  await page.request.post(`${CORE}/__tenancy`, { data: { mode: "multi" } });
  await page.goto("/platform");
  await page.getByRole("button", { name: "Add customer" }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("Trà Sen");
  await dialog(page).getByLabel("Short name").fill("tra-sen");
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Trà Sen" })).toBeVisible();
}
const toast = (page: Page) => page.locator(".toast[role=status]");

test("phía khách: gói đang dùng, hạn mức, kỳ thanh toán; nâng gói, huỷ và tiếp tục gia hạn", async ({
  page,
}) => {
  await signIn(page, "/settings/plan");
  await expect(page.getByTestId("plan-name")).toHaveText("Cơ bản");
  const limits = page.getByTestId("limits");
  await expect(limits).toContainText("Organization units");
  // 4 nút trên hạn mức 3 (sau khi hạ gói): báo vượt, không mất gì.
  await expect(limits).toContainText("Above the limit");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("link", { name: /To pay/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // Nâng lên Pro: có hiệu lực ngay.
  await page.getByRole("button", { name: "Change plan" }).click();
  await dialog(page).getByLabel("Plan and billing period").selectOption(`${PRO}|${PRO_MONTH}`);
  await dialog(page).getByRole("button", { name: "Change plan" }).click();
  await expect(toast(page)).toHaveText("Plan changed.");
  await expect(page.getByTestId("plan-name")).toHaveText("Pro");
  await expect(limits).not.toContainText("Above the limit");

  // Hạ về Cơ bản: chờ hết kỳ.
  await page.getByRole("button", { name: "Change plan" }).click();
  await dialog(page).getByLabel("Plan and billing period").selectOption(`${BASIC}|${BASIC_MONTH}`);
  await dialog(page).getByRole("button", { name: "Change plan" }).click();
  await expect(page.getByText("Changes to Cơ bản at the end of this period.")).toBeVisible();

  await page.getByRole("button", { name: "Cancel renewal" }).click();
  await dialog(page).getByRole("button", { name: "Cancel renewal" }).click();
  await expect(toast(page)).toHaveText("Renewal canceled.");
  await expect(page.getByText("Ends at period end")).toBeVisible();
  await page.getByRole("button", { name: "Keep renewing" }).click();
  await expect(toast(page)).toHaveText("The plan will renew again.");
});

test("nền tảng: tạo gói (lỗi hạn mức theo dòng), thêm giá, bán, đặt mặc định, ngừng bán", async ({
  page,
}) => {
  await signIn(page, "/platform/plans");
  await expect(page.getByText(/Sample data/)).toHaveCount(0);
  await expect(page.locator("tbody tr", { hasText: "Cơ bản" })).toContainText("0");
  await page.getByRole("button", { name: "Create plan" }).click();
  await dialog(page).getByLabel("Plan code").fill("doanh-nghiep");
  await dialog(page).getByLabel("Name").fill("Doanh nghiệp");
  await dialog(page).getByLabel("Limits").fill("auth.members = nhiều\norganizations.units = 20");
  await dialog(page).getByRole("button", { name: "Create draft" }).click();
  await expect(dialog(page).getByText('Lines 1 are not "key = number"')).toBeVisible();
  await dialog(page).getByLabel("Limits").fill("auth.members = 200\norganizations.units = ∞");
  await dialog(page).getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/platform\/plans\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 2, name: "Doanh nghiệp" })).toBeVisible();

  await page.getByRole("button", { name: "Add price" }).click();
  await dialog(page).getByLabel("Amount (VND)").fill("2.900.000");
  await dialog(page).getByRole("button", { name: "Add price" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("2,900,000");

  await page.getByRole("button", { name: "Start selling" }).click();
  await expect(page.getByRole("button", { name: "Make default" })).toBeVisible();
  await page.getByRole("button", { name: "Make default" }).click();
  await expect(page.getByText("Base plan · default")).toBeVisible();
  await page.getByRole("button", { name: "Retire" }).click();
  await dialog(page).getByRole("button", { name: "Retire plan" }).click();
  await expect(page.getByRole("button", { name: "Retire" })).toHaveCount(0);
});

test("nền tảng: ghi đè hạn mức cho một khách, bỏ rồi hoàn tác", async ({ page }) => {
  await signIn(page, "/platform");
  await addCustomer(page);
  await page.goto("/platform/plans/overrides");
  await page.getByRole("button", { name: "Add override" }).click();
  await dialog(page).getByLabel("Customer").selectOption({ label: "Trà Sen" });
  await dialog(page).getByLabel("Key").fill("auth.members");
  await dialog(page).getByLabel("Value").fill("nhiều");
  await dialog(page).getByRole("button", { name: "Add override" }).click();
  await expect(dialog(page).getByText("Limit: a number, or ∞ for unlimited.")).toBeVisible();
  await dialog(page).getByLabel("Value").fill("∞");
  await dialog(page).getByLabel("Reason").fill("Khách thử nghiệm đội lớn");
  await dialog(page).getByRole("button", { name: "Add override" }).click();
  await expect(toast(page)).toContainText("Override added");
  const row = page.locator("tbody tr", { hasText: "auth.members" });
  await expect(row).toContainText("Trà Sen");
  await row.getByRole("button", { name: "Remove" }).click();
  await dialog(page).getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("tbody tr", { hasText: "auth.members" })).toBeVisible();
});

test("nền tảng: thuê bao — khách chưa có thuê bao, gán gói cần gõ đúng tên khách", async ({
  page,
}) => {
  await signIn(page, "/platform");
  await addCustomer(page);
  await page.goto("/platform/subscriptions");
  const row = page.locator("tbody tr", { hasText: "Trà Sen" });
  await expect(row).toContainText("No subscription");
  await row.getByRole("button", { name: "Change plan" }).click();
  await dialog(page).getByLabel("Plan and price").selectOption(`${PRO}|${PRO_YEAR}`);
  await dialog(page).getByLabel("Type “Trà Sen” to confirm").fill("tra sen");
  await dialog(page).getByRole("button", { name: "Change plan" }).click();
  await expect(dialog(page).getByText("Type the customer name exactly: Trà Sen")).toBeVisible();
  await dialog(page).getByLabel("Type “Trà Sen” to confirm").fill("Trà Sen");
  await dialog(page).getByRole("button", { name: "Change plan" }).click();
  await expect(toast(page)).toHaveText("Trà Sen has the new plan.");
  await expect(row).toContainText("Pro");
  await expect(row).toContainText("Trial");
});
