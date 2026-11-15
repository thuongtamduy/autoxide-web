import { expect, type Page, test } from "@playwright/test";

// Mặt điều khiển nền tảng (W-014): không gian riêng của nhân sự vận hành, cả không gian là dữ liệu
// mẫu (W-006), chờ API của bước 33, 34, 35, 39. Kho mẫu nằm trong tiến trình máy chủ của giao
// diện, nên mỗi test làm trên bản ghi riêng (khách khác nhau).

const CORE = "http://127.0.0.1:4010";
const TRA_SEN = "01a1e000-0000-7000-8000-000000071003";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}$`));
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");

test("chuyển giữa hai không gian; khung riêng; cấp phát khách mới có lỗi theo ô", async ({
  page,
}) => {
  await signIn(page, "/");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("link", { name: "Platform control plane" }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
  await expect(page.getByText("Sample data · waiting for API step 33")).toBeVisible();
  const rail = page.getByRole("navigation", { name: "Platform control plane" });
  for (const item of [
    "Customers",
    "Plans and prices",
    "Subscriptions",
    "Provisioning",
    "Database fleet",
    "Health",
    "Customer data access",
  ]) {
    await expect(rail.getByRole("link", { name: item })).toBeVisible();
  }
  // Không gian khách không lẫn vào: không có Tổ chức, Cài đặt trên thanh bên.
  await expect(rail.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await page.getByRole("button", { name: /Scope: you do not see/ }).click();
  await expect(page.getByText("The control plane shows only the customer register")).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();

  // Sổ khách: khách con đứng sau khách cha; lọc "chờ migration".
  const rows = page.locator(".pf-table tbody tr");
  await expect(rows.filter({ hasText: "Nhà Sách Gió Huế" })).toContainText("child customer");
  await page.getByRole("link", { name: /Waiting for migration/ }).click();
  await expect(page).toHaveURL(/filter=migration/);
  await expect(rows.filter({ hasText: "Trà Sen" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Studio Ảnh Mây" })).toHaveCount(1);

  // Cấp phát: gom lỗi một lần, rồi xong thì mở tab Cấp phát.
  await page.getByRole("button", { name: "Provision a customer" }).click();
  await dialog(page).getByLabel("Slug").fill("bep-moc");
  await dialog(page).getByLabel("First admin email").fill("sai");
  await dialog(page).getByRole("button", { name: "Provision" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("3 fields need fixing.");
  await expect(dialog(page).getByLabel("Customer name")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog(page).getByText("This value is already in use.")).toBeVisible();
  await dialog(page).getByLabel("Customer name").fill("Trà Hoa Sen");
  await dialog(page).getByLabel("Slug").fill("tra-hoa-sen-e2e");
  await dialog(page).getByLabel("First admin email").fill("chu@example.com");
  await dialog(page).getByRole("button", { name: "Provision" }).click();
  await expect(toast(page)).toContainText("Provisioning queued");
  await expect(page).toHaveURL(/\/platform\/provisioning$/);
  await expect(page.locator("tbody tr", { hasText: "Trà Hoa Sen" })).toContainText(/Running|Done/);

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("link", { name: "Back to the customer workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("chi tiết khách: dời khách chạy thử trước; tạm khoá có hộp xác nhận nêu hệ quả, mở lại", async ({
  page,
}) => {
  await signIn(page, `/platform/tenants/${TRA_SEN}`);
  await expect(page.getByRole("heading", { level: 1, name: "Trà Sen" })).toBeVisible();

  await page.getByRole("button", { name: "Move to a dedicated database" }).click();
  await dialog(page).getByRole("button", { name: "Run the dry run" }).click();
  await expect(toast(page)).toContainText("Dry run finished");
  await expect(page.getByText(/Dry run: from pool-1 to tra-sen, 48 tables/)).toBeVisible();

  await page.getByRole("button", { name: "Suspend completely" }).click();
  await expect(dialog(page)).toContainText("including sign-in");
  await expect(dialog(page)).toContainText("Unlike read-only");
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await dialog(page).getByLabel("Reason").fill("Vi phạm điều khoản sử dụng, phiếu #77");
  await dialog(page).getByLabel("I understand that Trà Sen stops completely").check();
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(toast(page)).toContainText("Trà Sen is suspended");
  await expect(page.getByText("Suspended: Vi phạm điều khoản sử dụng, phiếu #77")).toBeVisible();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(toast(page)).toHaveText("Trà Sen is active again.");
});

test("thuê bao: đánh dấu đã thu đưa khách quá hạn về đang dùng", async ({ page }) => {
  await signIn(page, "/platform/subscriptions?status=past_due");
  const row = page.locator("tbody tr", { hasText: "Xưởng Mộc Hưng" });
  await expect(row).toContainText("Past due · grace");
  await row.getByRole("button", { name: "Mark as paid" }).click();
  await dialog(page).getByLabel("Bank transaction reference").fill("");
  await dialog(page).getByRole("button", { name: "Mark as paid" }).click();
  await expect(dialog(page).getByLabel("Bank transaction reference")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await dialog(page).getByLabel("Bank transaction reference").fill("FT2631900001");
  await dialog(page).getByRole("button", { name: "Mark as paid" }).click();
  await expect(toast(page)).toContainText("marked as paid");
  await page.goto("/platform/subscriptions");
  await expect(page.locator("tbody tr", { hasText: "Xưởng Mộc Hưng" })).toContainText("Active");
});

test("đội database: chạy thử cả đội, migrate cần gõ đúng chữ xác nhận", async ({ page }) => {
  await signIn(page, "/platform/fleet");
  await page.getByRole("button", { name: "Dry run for the whole fleet" }).click();
  await expect(toast(page)).toContainText("Dry run finished");
  await expect(page.getByRole("heading", { name: "Dry run of the whole fleet" })).toBeVisible();
  await page.getByRole("button", { name: "Migrate the fleet" }).click();
  await dialog(page).getByLabel("Type “migrate” to confirm").fill("mi");
  await dialog(page).getByRole("button", { name: "Migrate" }).click();
  await expect(dialog(page).getByText("Type it exactly as shown to confirm.")).toBeVisible();
  await dialog(page).getByLabel("Type “migrate” to confirm").fill("migrate");
  await dialog(page).getByRole("button", { name: "Migrate" }).click();
  await expect(toast(page)).toContainText("Migration job queued");
  await expect(page.locator("tbody tr", { hasText: "pool-2" })).toContainText(
    /Migrating|Up to date/,
  );
});

test("vào dữ liệu khách: cấp có hạn, có lý do; khách thấy ở Phân quyền › Quyền vào hỗ trợ", async ({
  page,
}) => {
  await signIn(page, "/platform/support");
  await expect(page.getByText("Sample data · waiting for API step 34")).toBeVisible();
  await page.getByRole("button", { name: "Grant access" }).click();
  await dialog(page).getByLabel("Customer", { exact: true }).selectOption({ label: "Bếp Mộc" });
  await dialog(page).getByLabel("Reason").fill("ngắn");
  await dialog(page).getByRole("button", { name: "Grant access" }).click();
  await expect(dialog(page).getByText("Write 10 to 500 characters.")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Khách báo lỗi đồng bộ kho, phiếu #e2e-31");
  await dialog(page).getByRole("button", { name: "Grant access" }).click();
  await expect(toast(page)).toContainText("Access granted");
  await expect(page.locator("tbody tr", { hasText: "phiếu #e2e-31" })).toContainText("In effect");

  await page.goto("/org/access/support");
  await expect(page.getByText("Khách báo lỗi đồng bộ kho, phiếu #e2e-31")).toBeVisible();
});
