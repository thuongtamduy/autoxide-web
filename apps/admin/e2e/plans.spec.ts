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
  // Mỗi gói một thẻ: giá theo kỳ, số khách đang dùng, module bằng tên dễ đọc; "Sửa" mở đúng hộp thoại
  // sửa gói của trang chi tiết.
  const basic = page.locator(".pf-pcard", { hasText: "Cơ bản" });
  await expect(basic.getByTestId("plan-tenants")).toContainText("0 customers on this plan");
  await expect(basic).toContainText("290,000");
  await expect(basic).toContainText("Posts and pages");
  await basic.getByRole("button", { name: "Edit" }).click();
  await expect(dialog(page).getByLabel("Name")).toHaveValue("Cơ bản");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
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

  // Ở danh sách: gói đã ngừng bán nằm dưới chip "Retired", không còn nút Sửa.
  await page.goto("/platform/plans?status=retired");
  const retired = page.locator(".pf-pcard", { hasText: "Doanh nghiệp" });
  await expect(retired).toContainText("Retired");
  await expect(retired).toContainText("2,900,000");
  await expect(retired.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await retired.getByRole("link", { name: "Details" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Doanh nghiệp" })).toBeVisible();
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

  // Thẻ gói đếm khách đang dùng (`subscriber_count`).
  await page.goto("/platform/plans");
  await expect(
    page.locator(".pf-pcard", { hasText: "Pro" }).getByTestId("plan-tenants"),
  ).toContainText("1 customer on this plan");
});

test("vào dữ liệu khách khi rỗng: một trạng thái rỗng, không chồng câu báo lên bảng rỗng", async ({
  page,
}) => {
  await signIn(page, "/platform/support");
  // Một khách (chế độ một khách): chưa có khách nào để cấp.
  await expect(page.locator(".empty-state")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "No customers to support yet" })).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
  await addCustomer(page);
  await page.goto("/platform/support");
  await expect(page.locator(".empty-state")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "No access granted yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Grant access" })).toBeVisible();
});

// ---------------------------------------------------------------- Đợt 3b

test("Tổng quan: thẻ gói; gói không có tính năng thì khoá nút tạo API key và AI của bài viết", async ({
  page,
}) => {
  await signIn(page, "/");
  await expect(page.getByTestId("dash-plan")).toHaveText("Cơ bản");
  await expect(page.getByTestId("dash-plan-over")).toContainText("Organization units 4 / 3");
  await page.getByRole("link", { name: "See plan" }).click();
  await expect(page).toHaveURL(/\/settings\/plan$/);

  // Gói "Cơ bản" có đủ tính năng: nút tạo key mở được.
  await page.goto("/settings/api-keys");
  await expect(page.getByRole("link", { name: "Create API key" })).toBeVisible();
  await expect(page.getByTestId("plan-lock-auth.api_keys")).toHaveCount(0);

  await page.request.post(`${CORE}/__plans/basic-features`, { data: { features: [] } });
  await page.reload();
  await expect(page.getByRole("button", { name: "Create API key" })).toBeDisabled();
  await page.getByTestId("plan-lock-auth.api_keys").click();
  await expect(page).toHaveURL(/\/settings\/plan$/);

  await page.goto("/content");
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}$/);
  await page.getByRole("tab", { name: /SEO/ }).click();
  await expect(page.getByRole("button", { name: "Suggest title and description" })).toBeDisabled();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Your plan does not include AI suggestions",
  );
});

test("gói chỉ bật vài module: Tổng quan và hộp việc không mời vào module ngoài gói", async ({
  page,
}) => {
  await signIn(page, "/");
  const areas = page.getByRole("region", { name: "Areas" });
  await expect(areas.getByRole("link", { name: /Marketing › Forms/ })).toBeVisible();
  await page.request.post(`${CORE}/__plans/basic-features`, {
    data: { features: [], modules: ["content", "media"] },
  });
  await page.reload();
  await expect(areas.getByRole("link", { name: /Content › Posts/ })).toBeVisible();
  await expect(areas.getByRole("link", { name: /Marketing › Forms/ })).toHaveCount(0);
  await expect(page.getByText(/did not answer/)).toHaveCount(0);
});

test("sổ khách: gói, thuê bao, gần chạm hạn mức lấy từ core; lọc theo thuê bao", async ({
  page,
}) => {
  await signIn(page, "/platform");
  await addCustomer(page);
  await page.goto("/platform");
  // Dữ liệu mẫu cũng có một "Trà Sen": lấy dòng theo tên ngắn của khách vừa tạo.
  const row = page.locator("tbody tr", { hasText: "tra-sen" });
  await expect(row).toContainText("No plan");
  await expect(page.getByRole("link", { name: /Near a limit/ })).toContainText("0");

  await page.goto("/platform/subscriptions");
  const sub = page.locator("tbody tr", { hasText: "Trà Sen" });
  await sub.getByRole("button", { name: "Change plan" }).click();
  await dialog(page).getByLabel("Plan and price").selectOption(`${BASIC}|${BASIC_MONTH}`);
  await dialog(page).getByLabel("Type “Trà Sen” to confirm").fill("Trà Sen");
  await dialog(page).getByRole("button", { name: "Change plan" }).click();
  await expect(toast(page)).toHaveText("Trà Sen has the new plan.");

  await page.goto("/platform");
  await expect(row).toContainText("Cơ bản");
  await expect(row).toContainText("Trial");
  // 4 nút trên hạn mức 3 của gói Cơ bản: core báo gần chạm (đã vượt).
  await expect(row).toContainText("Organization units");
  await page.getByRole("link", { name: /Near a limit/ }).click();
  await expect(page).toHaveURL(/near_limit=true/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("tra-sen");

  await page.goto("/platform");
  await page.getByLabel("Subscription").selectOption("active");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/subscription_status=active/);
  await expect(page.getByText("No customer matches")).toBeVisible();
});

test("chi tiết khách: thuê bao và hạn mức, xuất dữ liệu rồi tải về, cấp và thu hồi quyền vào", async ({
  page,
}) => {
  await signIn(page, "/platform");
  await addCustomer(page);
  // Đang ở trang chi tiết của "Trà Sen".
  await expect(page.getByTestId("tenant-subscription")).toContainText("No subscription");

  await page.getByRole("button", { name: "Export data" }).click();
  await dialog(page).getByRole("button", { name: "Queue the export" }).click();
  await expect(toast(page)).toContainText("Export of Trà Sen queued");
  await page.reload();
  const exports = page.getByTestId("tenant-exports");
  await expect(exports).toContainText("Ready");
  const href = await exports.getByRole("link", { name: "Download" }).getAttribute("href");
  const file = await page.request.get(href ?? "");
  expect(file.ok()).toBe(true);
  expect(await file.text()).toContain('"table":"auth_users"');

  await page.getByRole("button", { name: "Grant access" }).click();
  await dialog(page).getByLabel("Reason").fill("ngắn");
  await dialog(page).getByRole("button", { name: "Grant access" }).click();
  await expect(dialog(page).getByText("must be 10 to 500 characters long")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Khách báo lỗi đồng bộ kho, phiếu #e2e-31");
  await dialog(page).getByRole("button", { name: "Grant access" }).click();
  await expect(toast(page)).toContainText("Access granted");
  const grant = page.getByTestId("tenant-grants").locator("tbody tr", { hasText: "#e2e-31" });
  await expect(grant).toContainText("In effect");
  await expect(grant).toContainText("Not used yet");

  await page.goto("/platform/support");
  await expect(page.getByText(/Sample data/)).toHaveCount(0);
  const listed = page.locator("tbody tr", { hasText: "#e2e-31" });
  await expect(listed).toContainText("Trà Sen");
  await listed.getByRole("button", { name: "Revoke" }).click();
  await dialog(page).getByRole("button", { name: "Revoke" }).click();
  await expect(toast(page)).toContainText("Access revoked");
  await expect(listed).toContainText("Revoked");
});

test("hồ sơ xuất hoá đơn (D-335): lỗi mã số thuế của core, địa chỉ theo danh mục hành chính", async ({
  page,
}) => {
  await signIn(page, "/settings/plan");
  await expect(page.getByText("No invoice details yet")).toBeVisible();
  await page.getByLabel("Legal name").fill("Công ty TNHH Bếp Mộc");
  await page.getByLabel("Tax code").fill("123");
  await page.getByLabel("Email for invoices").fill("ketoan@bepmoc.vn");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("must be 10 digits, or 10 digits, `-` and 3 digits")).toBeVisible();
  await page.getByLabel("Tax code").fill("0101234567");
  await page.getByLabel("Province / city").selectOption("01");
  await expect(page.getByLabel("Ward / commune")).toBeEnabled();
  await page.getByLabel("Ward / commune").selectOption("00004");
  await page.getByLabel("Street address").fill("12 Phố Huế");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(toast(page)).toHaveText("Invoice details saved.");
  await page.reload();
  await expect(page.getByLabel("Tax code")).toHaveValue("0101234567");
  await expect(page.getByLabel("Ward / commune")).toHaveValue("00004");
});

test("chi tiết khách: kỳ thanh toán của khách, đánh dấu đã thu (D-335)", async ({ page }) => {
  await signIn(page, "/platform");
  await addCustomer(page);
  await page.goto("/platform/subscriptions");
  const sub = page.locator("tbody tr", { hasText: "Trà Sen" });
  await sub.getByRole("button", { name: "Change plan" }).click();
  await dialog(page).getByLabel("Plan and price").selectOption(`${BASIC}|${BASIC_MONTH}`);
  await dialog(page).getByLabel("Type “Trà Sen” to confirm").fill("Trà Sen");
  await dialog(page).getByRole("button", { name: "Change plan" }).click();
  await expect(toast(page)).toHaveText("Trà Sen has the new plan.");
  // Tên gói đi kèm thuê bao trong sổ khách (`expand=subscription`).
  await expect(sub).toContainText("Cơ bản");

  await page.goto("/platform");
  await page.locator("tbody tr", { hasText: "tra-sen" }).getByRole("link").first().click();
  const periods = page.getByTestId("tenant-periods");
  await expect(periods).toContainText("To pay");
  await periods.getByRole("button", { name: "Mark as paid" }).click();
  await dialog(page).getByRole("button", { name: "Mark as paid" }).click();
  await expect(dialog(page).locator(".ferr")).toBeVisible();
  await dialog(page).getByLabel("Payment reference").fill("VCB-20261117-001");
  await dialog(page).getByRole("button", { name: "Mark as paid" }).click();
  await expect(toast(page)).toHaveText("Payment recorded.");
  await expect(periods).toContainText("Paid");
  await expect(periods).toContainText("VCB-20261117-001");
});

test("cấp phát khách theo gói (D-338): chạy xong; lỗi thì chạy lại từ bước đã tới", async ({
  page,
}) => {
  await signIn(page, "/platform/provisioning");
  await page.request.post(`${CORE}/__tenancy`, { data: { mode: "multi" } });
  await expect(page.getByText(/Sample data/)).toHaveCount(0);
  const provision = async (name: string, slug: string) => {
    await page.getByRole("button", { name: "Provision a customer" }).click();
    await dialog(page).getByLabel("Customer name").fill(name);
    await dialog(page).getByLabel("Slug").fill(slug);
    await dialog(page).getByLabel("First admin email").fill(`chu@${slug}.vn`);
    await dialog(page).getByRole("button", { name: "Provision" }).click();
    await expect(page).toHaveURL(/\/platform\/provisioning$/);
  };
  await provision("Hoa Sen", "hoa-sen");
  await page.reload();
  const runs = page.getByTestId("provisionings");
  const done = runs.locator("tbody tr", { hasText: "hoa-sen" });
  await expect(done).toContainText("Done");
  await expect(done.getByRole("link", { name: "Hoa Sen" })).toBeVisible();

  await provision("Lỗi Thử", "loi-thu");
  await page.reload();
  const failed = runs.locator("tbody tr", { hasText: "loi-thu" });
  await expect(failed).toContainText("Stopped with an error");
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(toast(page)).toContainText("runs again");
  await page.reload();
  await expect(failed).toContainText("Done");
});

test("Cài đặt › Dữ liệu của bạn: khách tự xuất toàn bộ dữ liệu rồi tải về", async ({ page }) => {
  await signIn(page, "/settings/data");
  await expect(page.getByText("No export yet.")).toBeVisible();
  await page.getByRole("button", { name: "Export data" }).click();
  await dialog(page).getByRole("button", { name: "Start the export" }).click();
  await expect(toast(page)).toContainText("Export started");
  await page.reload();
  const list = page.getByTestId("own-exports");
  await expect(list).toContainText("Ready");
  const href = await list.getByRole("link", { name: "Download" }).getAttribute("href");
  const file = await page.request.get(href ?? "");
  expect(file.ok()).toBe(true);
  expect(await file.text()).toContain('"table":"auth_users"');
  // Tab Gói và thuê bao là API thật: không còn nhãn "mẫu" trên thanh tab.
  await expect(page.getByRole("link", { name: "Plan and subscription" })).not.toContainText(
    "sample",
  );
});
