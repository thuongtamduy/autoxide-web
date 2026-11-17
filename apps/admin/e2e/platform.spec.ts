import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

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
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
  // Sổ khách đọc gói và thuê bao từ core (đợt 3b): không còn nhãn dữ liệu mẫu ở đầu trang.
  await expect(page.getByText("Sample data · waiting for API step 35")).toHaveCount(0);
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
  await expect(page).toHaveURL(/schema_state=behind/);
  await expect(rows.filter({ hasText: "Trà Sen" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Studio Ảnh Mây" })).toHaveCount(1);

  // Cấp phát (D-338, API thật): gom lỗi một lần, rồi xong thì mở tab Cấp phát.
  await page.getByRole("button", { name: "Provision a customer" }).click();
  await dialog(page).getByLabel("Slug").fill("tra-hoa-sen-e2e");
  await dialog(page).getByRole("button", { name: "Provision" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await expect(dialog(page).getByLabel("Customer name")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Customer name").fill("Trà Hoa Sen");
  await dialog(page).getByLabel("First admin email").fill("chu@example.com");
  await dialog(page).getByRole("button", { name: "Provision" }).click();
  await expect(toast(page)).toContainText("Provisioning queued");
  await expect(page).toHaveURL(/\/platform\/provisioning$/);
  await expect(page.locator("tbody tr", { hasText: "Trà Hoa Sen" })).toContainText(/Waiting|Done/);

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
  // Thiếu lý do và chưa xác nhận: báo cả hai một lần; lý do vào nhật ký audit (D-334).
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await dialog(page).getByLabel("Reason").fill("Khách yêu cầu tạm dừng, phiếu #12");
  await dialog(page).getByLabel("I understand that Acme Ltd stops completely").check();
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(toast(page)).toContainText("Acme Ltd is suspended");
  // Khách đã tạm khoá mới xoá hẳn được (D-337): gõ đúng tên ngắn và ghi lý do.
  await page.getByRole("button", { name: "Delete for good" }).click();
  await expect(dialog(page)).toContainText("This cannot be undone");
  await dialog(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  // Mở lại rồi khoá lại, cuối cùng xoá hẳn.
  await page.getByRole("button", { name: "Reactivate" }).click();
  await dialog(page).getByRole("button", { name: "Reactivate" }).click();
  await expect(toast(page)).toHaveText("Acme Ltd is active again.");
  await page.getByRole("button", { name: "Suspend completely" }).click();
  await dialog(page).getByLabel("Reason").fill("Khách đề nghị chấm dứt hợp đồng, phiếu #13");
  await dialog(page).getByLabel("I understand that Acme Ltd stops completely").check();
  await dialog(page).getByRole("button", { name: "Suspend" }).click();
  await expect(toast(page)).toContainText("Acme Ltd is suspended");
  await page.getByRole("button", { name: "Delete for good" }).click();
  await dialog(page).getByLabel("Type “acme-e2e” to confirm").fill("acme-e2e");
  await dialog(page).getByLabel("Reason").fill("Hết thời hạn lưu theo hợp đồng");
  await dialog(page).getByRole("button", { name: "Delete for good" }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.locator("tbody tr", { hasText: "acme-e2e" })).toContainText("Deleted");

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

/** Bật nhiều khách ở core giả rồi thêm khách `name` trên placement `placement` qua giao diện. */
async function addTenant(
  page: Page,
  request: APIRequestContext,
  name: string,
  slug: string,
  placement: string,
) {
  await request.post(`${CORE}/__tenancy`, { data: { mode: "multi" } });
  await page.goto("/platform");
  await page.getByRole("button", { name: "Add customer" }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill(name);
  await dialog(page).getByLabel("Short name").fill(slug);
  await dialog(page).getByLabel("Where its data is kept").selectOption(placement);
  await dialog(page).getByRole("button", { name: "Add customer" }).click();
  await expect(toast(page)).toHaveText("Customer added.");
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("khách chỉ đọc (D-296): bật có hộp xác nhận nêu hệ quả, nhãn ở chi tiết và sổ khách, tắt lại; khách nền tảng không có nút", async ({
  page,
  request,
}) => {
  await signIn(page, "/platform");
  await addTenant(page, request, "Eu Shop", "eu-shop", "eu-db");
  const block = page.getByTestId("read-only-block");
  await expect(block).toContainText("every change is refused");
  await block.getByRole("button", { name: "Make read-only" }).click();
  await expect(dialog(page)).toContainText("Its staff still sign in, view and export their data");
  await expect(dialog(page)).toContainText("refused with 403 tenant_read_only");
  await expect(dialog(page)).toContainText("This is not a suspension");
  await dialog(page).getByRole("button", { name: "Make read-only" }).click();
  await expect(toast(page)).toHaveText("Eu Shop is read-only.");
  await expect(page.getByTestId("read-only-badge")).toHaveText("Read-only");
  // Tạm khoá vẫn là việc riêng: khách chỉ đọc vẫn đang hoạt động.
  await expect(page.getByRole("button", { name: "Suspend completely" })).toBeVisible();

  await page.goto("/platform");
  const rows = page.locator(".pf-table tbody tr");
  await expect(rows.filter({ hasText: "Eu Shop" })).toContainText("Read-only");

  await page.goto("/platform");
  await rows.filter({ hasText: "Eu Shop" }).getByRole("link", { name: "Eu Shop" }).click();
  await page.getByRole("button", { name: "Make writable again" }).click();
  await dialog(page).getByRole("button", { name: "Make writable again" }).click();
  await expect(toast(page)).toHaveText("Eu Shop is writable again.");
  await expect(page.getByTestId("read-only-badge")).toHaveCount(0);

  // Khách nền tảng không chỉ đọc được: không có khối này.
  await page.goto("/platform/tenants/default");
  await expect(page.getByRole("heading", { level: 1, name: "Default" })).toBeVisible();
  await expect(page.getByTestId("read-only-block")).toHaveCount(0);
});

test("sổ khách lọc ở core (D-296): chỉ đọc, loại placement, trạng thái migration; kết hợp bằng form", async ({
  page,
  request,
}) => {
  await signIn(page, "/platform");
  await addTenant(page, request, "Eu Shop", "eu-shop", "eu-db");
  await page.getByTestId("read-only-block").getByRole("button", { name: "Make read-only" }).click();
  await dialog(page).getByRole("button", { name: "Make read-only" }).click();
  await expect(toast(page)).toHaveText("Eu Shop is read-only.");

  await page.goto("/platform");
  const rows = page.locator(".pf-table tbody tr");
  // Placement đi kèm sổ khách (`expand=placement`).
  await expect(rows.filter({ hasText: "Eu Shop" })).toContainText("Dedicated database");
  await expect(rows.filter({ hasText: "Eu Shop" })).toContainText("eu-db");

  await page.getByRole("link", { name: /^Read-only/ }).click();
  await expect(page).toHaveURL(/\/platform\?read_only=true$/);
  await expect(rows.filter({ hasText: "Eu Shop" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Default" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Trà Sen" })).toHaveCount(0);

  await page.getByRole("link", { name: /^Shared database/ }).click();
  await expect(page).toHaveURL(/placement_kind=shared$/);
  await expect(rows.filter({ hasText: "Default" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Eu Shop" })).toHaveCount(0);

  // Kết hợp: ghi được + database riêng → không còn Eu Shop.
  const form = page.getByRole("search", { name: "Combine filters" });
  await form.locator("select[name=read_only]").selectOption("false");
  await form.getByLabel("Placement kind").selectOption("dedicated");
  await form.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/read_only=false&placement_kind=dedicated/);
  await expect(rows.filter({ hasText: "Eu Shop" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Default" })).toHaveCount(0);

  await form.locator("select[name=read_only]").selectOption("true");
  await form.getByLabel("Migration state").selectOption("ready");
  await form.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/read_only=true&placement_kind=dedicated&schema_state=ready/);
  await expect(rows.filter({ hasText: "Eu Shop" })).toHaveCount(1);

  await form.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(rows.filter({ hasText: "Default" })).toHaveCount(1);
});

test("cấu hình theo khách (D-296): nhân sự nền tảng đặt cho một khách, lỗi 422 dưới ô, bỏ", async ({
  page,
  request,
}) => {
  await signIn(page, "/platform");
  await addTenant(page, request, "Eu Shop", "eu-shop", "eu-db");
  await expect(page.getByRole("heading", { name: "Settings of this customer" })).toBeVisible();
  const links = page.getByTestId("tset-comments.max_links");
  await expect(links).toContainText("the server-wide configuration applies");
  await links.getByRole("button", { name: "Set comments.max_links" }).click();
  await dialog(page).getByLabel("Value").fill("500");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  // Core kiểm giá trị: lỗi dưới ô "Value", giá trị đã gõ giữ lại.
  await expect(dialog(page).getByLabel("Value")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog(page)).toContainText("must be a whole number from 0 to 100");
  await expect(dialog(page).getByLabel("Value")).toHaveValue("500");
  await dialog(page).getByLabel("Value").fill("5");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(toast(page)).toHaveText("Saved comments.max_links.");
  await expect(links).toContainText("5");
  await expect(links).toContainText("Set");

  await links.getByRole("button", { name: "Remove" }).click();
  await dialog(page).getByRole("button", { name: "Remove" }).click();
  await expect(toast(page)).toHaveText(
    "Removed comments.max_links; the server-wide configuration applies.",
  );
  await expect(links).toContainText("the server-wide configuration applies");

  // Giá trị là của khách đó: cài đặt của chính khách nền tảng không đổi.
  await page.goto("/settings/connections");
  await expect(page.getByTestId("tset-comments.max_links")).toContainText(
    "Using the server-wide configuration.",
  );
});

test("khách của người đăng nhập chỉ đọc (D-296): dải báo ở khung, lệnh ghi hiện lỗi của core", async ({
  page,
  request,
}) => {
  await request.post(`${CORE}/__own-tenant`, { data: { read_only: true } });
  await signIn(page, "/settings/connections");
  const banner = page.getByTestId("read-only-banner");
  await expect(banner).toContainText("This workspace is read-only.");
  await expect(banner).toContainText("changes are refused");
  const url = page.getByTestId("tset-kernel.public_url");
  await url.getByRole("button", { name: "Set up Website address" }).click();
  await dialog(page).getByLabel("Value").fill("https://shop.example");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveAttribute("data-code", "tenant_read_only");
  await expect(dialog(page).getByRole("alert")).toContainText("This tenant is read-only for now");
  await page.keyboard.press("Escape");

  // Ghi được trở lại: dải báo biến mất.
  await request.post(`${CORE}/__own-tenant`, { data: { read_only: false } });
  await page.reload();
  await expect(page.getByTestId("read-only-banner")).toHaveCount(0);
});

test("trạng thái toàn khung: tên khách ở góc trái; tạm khoá, bảo trì thay cả khung; mất kết nối", async ({
  page,
  context,
  request,
}) => {
  // Core nhiều khách, người đăng nhập thuộc khách thường: góc trái hiện tên khách.
  // (Đăng nhập trước: ở chế độ nhiều khách form đăng nhập còn hỏi không gian làm việc.)
  await signIn(page, "/content");
  await expect(page.getByTestId("tenant-name")).toHaveCount(0);
  await request.post(`${CORE}/__tenancy`, { data: { mode: "multi" } });
  await request.post(`${CORE}/__own-tenant`, { data: { customer: true } });
  await page.reload();
  await expect(page.getByTestId("tenant-name")).toContainText("Acme Read-only");

  // Mất mạng: thanh báo ở đầu nội dung, có mạng lại thì tắt.
  await context.setOffline(true);
  await expect(page.getByTestId("offline-banner")).toContainText("Connection lost.");
  await context.setOffline(false);
  await expect(page.getByTestId("offline-banner")).toHaveCount(0);

  // Bảo trì: trang báo thay cả khung, câu của core, nút thử lại.
  await request.post(`${CORE}/__own-tenant`, { data: { status: "maintenance" } });
  await page.reload();
  const maintenance = page.getByTestId("tenant-maintenance");
  await expect(maintenance).toContainText("Under maintenance");
  await expect(maintenance).toContainText("Retry in 30 seconds.");
  await request.post(`${CORE}/__own-tenant`, { data: { customer: true } });
  await maintenance.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("tenant-name")).toBeVisible();

  // Tạm khoá: chỉ còn đăng xuất.
  await request.post(`${CORE}/__own-tenant`, { data: { status: "suspended" } });
  await page.reload();
  const suspended = page.getByTestId("tenant-suspended");
  await expect(suspended).toContainText("This workspace is suspended");
  await expect(suspended).toContainText("Contact the service provider.");
  await suspended.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await request.post(`${CORE}/__own-tenant`, { data: { read_only: false } });
  await request.post(`${CORE}/__tenancy`, { data: { mode: "single" } });
});

test("đội database: migrate một placement của core bằng API (D-334), theo dõi lượt chạy", async ({
  page,
  request,
}) => {
  await request.post(`${CORE}/__placements/behind`, {
    data: { name: "eu-db", migrations: ["notes/m0009_tags"] },
  });
  await signIn(page, "/platform/fleet");
  const row = page.locator("tbody tr", { hasText: "eu-db" });
  await expect(row).toContainText("notes/m0009_tags");
  await row.getByRole("button", { name: "Migrate" }).click();
  await expect(dialog(page)).toContainText("Runs notes/m0009_tags.");
  await dialog(page).getByRole("button", { name: "Migrate" }).click();
  await expect(toast(page)).toContainText("Migration of eu-db started");
  await page.reload();
  const runs = page.getByTestId("migration-runs");
  await expect(runs).toContainText("Done");
  await expect(runs).toContainText("eu-db: notes/m0009_tags");
  await expect(row.getByRole("button", { name: "Migrate" })).toHaveCount(0);
});
