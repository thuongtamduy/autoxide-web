import { expect, type Page, test } from "@playwright/test";

// Mặt điều khiển nền tảng (W-014, W-027): không gian riêng của nhân sự vận hành. Sổ khách và
// placement là API thật của bước 33 (core giả: `mock-tenants.ts`); gói, thuê bao, cấp phát, sức khoẻ,
// vào dữ liệu khách là dữ liệu mẫu (W-006) chờ bước 34, 35, 39, cùng các khách chỉ có trong dữ liệu
// mẫu. Kho mẫu nằm trong tiến trình máy chủ của giao diện, nên mỗi test làm trên bản ghi riêng.

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
  await expect(page.getByText("Sample data · waiting for API step 35")).toBeVisible();
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

test("khách của core: một khách thì không thêm được; nhiều khách thì thêm, đổi tên, tạm khoá, mở lại", async ({
  page,
  request,
}) => {
  await signIn(page, "/platform");
  // Khách nền tảng là khách của core (không có nhãn "mẫu"); khách chỉ có trong dữ liệu mẫu thì có.
  const rows = page.locator(".pf-table tbody tr");
  await expect(rows.filter({ hasText: "Default" }).locator(".tag")).toHaveCount(0);
  await expect(rows.filter({ hasText: "Trà Sen" }).locator(".tag")).toHaveText("sample");
  await expect(page.getByText("This installation runs one tenant")).toBeVisible();
  await page.getByRole("button", { name: "Add customer" }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("Acme");
  await dialog(page).getByLabel("Short name").fill("acme-e2e");
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveAttribute("data-code", "tenant_single_mode");
  await page.keyboard.press("Escape");

  await request.post(`${CORE}/__tenancy`, { data: { mode: "multi" } });
  await page.reload();
  await page.getByRole("button", { name: "Add customer" }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("Acme");
  await dialog(page).getByLabel("Short name").fill("Acme!");
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(dialog(page).getByLabel("Short name")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Short name").fill("acme-e2e");
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(toast(page)).toHaveText("Customer added.");
  await expect(page).toHaveURL(/\/platform\/tenants\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Acme" })).toBeVisible();

  await page.getByRole("button", { name: "Rename" }).click();
  await dialog(page).getByLabel("Name").fill("Acme Ltd");
  await dialog(page).getByRole("button", { name: "Save name" }).click();
  await expect(toast(page)).toHaveText("Name saved.");
  await expect(page.getByRole("heading", { level: 1, name: "Acme Ltd" })).toBeVisible();

  await page.getByRole("button", { name: "Suspend completely" }).click();
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(dialog(page).locator(".ferr")).toBeVisible();
  await dialog(page).getByLabel("I understand that Acme Ltd stops completely").check();
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(toast(page)).toContainText("Acme Ltd is suspended");
  await page.getByRole("button", { name: "Reactivate" }).click();
  await dialog(page).getByRole("button", { name: "Reactivate" }).click();
  await expect(toast(page)).toHaveText("Acme Ltd is active again.");

  await page.goto("/platform/fleet");
  await expect(page.locator("tbody tr", { hasText: "main" }).first()).toContainText("Up to date");
  // Nơi lưu file riêng của placement: chỉ phần không bí mật.
  const eu = page.locator("tbody tr", { hasText: "eu-db" });
  await expect(eu).toContainText("S3 bucket");
  await expect(eu).toContainText("eu-files/autoxide");
  await expect(eu).toContainText("Access key stored (never shown)");
  await expect(page.locator("tbody tr", { hasText: "main" }).first()).toContainText(
    "Platform file storage",
  );
});

test("chi tiết khách mẫu: tạm khoá có hộp xác nhận nêu hệ quả, mở lại", async ({ page }) => {
  await signIn(page, `/platform/tenants/${TRA_SEN}`);
  await expect(page.getByRole("heading", { level: 1, name: "Trà Sen" })).toBeVisible();
  // Dời khách là API thật: khách chỉ có trong dữ liệu mẫu không có nút dời.
  await expect(page.getByRole("heading", { name: "Move to another placement" })).toHaveCount(0);

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

test("dời khách của core: chạy thử ra kế hoạch, chạy thật, theo dõi tới xong; khách nền tảng không dời", async ({
  page,
  request,
}) => {
  await signIn(page, "/platform/tenants/00000000-0000-7000-8000-000000000001");
  await expect(page.getByRole("heading", { level: 1, name: "Default" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Move to another placement" })).toHaveCount(0);

  await request.post(`${CORE}/__tenancy`, { data: { mode: "multi" } });
  await page.goto("/platform");
  await page.getByRole("button", { name: "Add customer" }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("Move Co");
  await dialog(page).getByLabel("Short name").fill("move-e2e");
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Move Co" })).toBeVisible();

  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "Move to another placement" }),
  });
  await section.getByLabel("Move to").selectOption("eu-db");
  await section.getByRole("button", { name: "Run the dry run" }).click();
  await expect(page).toHaveURL(/move_to=eu-db/);
  const plan = page.getByTestId("move-plan");
  await expect(plan).toContainText("Dry run: from main to eu-db");
  await expect(plan).toContainText("21 rows in 4 tables");
  await expect(plan).toContainText("Nothing blocks the move.");
  await plan.getByText("4 tables, in copy order").click();
  await expect(plan.getByRole("cell", { name: "notes_note" })).toBeVisible();

  await plan.getByRole("button", { name: "Move now" }).click();
  await expect(dialog(page)).toContainText("503 tenant_maintenance");
  await expect(dialog(page)).toContainText("autoxide tenant move move-e2e --to eu-db");
  await dialog(page).getByRole("button", { name: "Move now" }).click();
  await expect(toast(page)).toContainText("Move Co is moving");
  await expect(page).toHaveURL(/\?move=[0-9a-f-]+$/);
  const status = page.getByTestId("move-status");
  await expect(status).toContainText("Move from main to eu-db");
  // Trang tự làm mới tới khi lượt dời xong (core giả đi mỗi bước 1,5 giây).
  await expect(status).toHaveAttribute("data-state", "done", { timeout: 20_000 });
  await expect(status).toContainText("Done. Move Co works from eu-db.");
  await page.reload();
  await expect(page.getByTestId("moving-note")).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby="pf-t-place"]')).toContainText("eu-db");

  // Khách đã ở `eu-db`: đích còn lại chỉ là `main`.
  await expect(section.getByLabel("Move to").locator("option")).toHaveText([/^main/]);
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
