import { expect, type Page, test } from "@playwright/test";

// Nhóm Cài đặt với core giả (`mock-settings.ts`): webhook, API key, nhật ký audit, Nhà phát triển;
// và các phần dữ liệu mẫu (W-006; Playwright bật `AUTOXIDE_WEB_SAMPLE_DATA=true`). Kho dữ liệu
// mẫu sống suốt tiến trình của ứng dụng, nên test dùng tên không trùng giữa các lần chạy.

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string, email = "admin@example.com") {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel("Password")
    .fill(email.startsWith("viewer") ? "viewer password" : "admin password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");
const rows = (page: Page) => page.locator("tbody tr");

test("Cài đặt chung: tab theo bản thiết kế, Nhân sự là link sang Tổ chức", async ({ page }) => {
  await signIn(page, "/settings");
  await expect(page).toHaveURL(/\/settings\/plan$/);
  await expect(page.getByRole("heading", { level: 1, name: "General settings" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "General settings sections" });
  await expect(tabs.getByRole("link")).toHaveCount(9);
  await expect(tabs.getByRole("link").first()).toContainText("Plan and subscription");
  await expect(tabs.getByRole("link").first()).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link").last()).toContainText("Your data");
  await expect(tabs.getByRole("link", { name: "Staff" })).toHaveAttribute(
    "href",
    "/org/access/users",
  );
  // Menu con của Cài đặt: ba màn theo sổ điều hướng.
  await expect(page.getByRole("link", { name: "API keys and AI agents" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Developers" }).first()).toBeVisible();
});

test("webhook: tạo (lỗi gom dưới ô), secret một lần, lần giao, tắt, đổi secret, xoá", async ({
  page,
  request,
}) => {
  await signIn(page, "/settings/webhooks");
  await expect(page.getByRole("heading", { name: "No endpoints here." })).toBeVisible();

  await page.getByRole("button", { name: "Add endpoint" }).click();
  await dialog(page).getByLabel("Address").fill("http://crm.example.com/hook");
  await dialog(page).getByRole("button", { name: "Add endpoint" }).click();
  // Chưa chọn event: báo ngay dưới nhóm event, không gửi core.
  await expect(dialog(page).locator(".ferr")).toHaveText(
    "Choose at least one event, or every event.",
  );
  await dialog(page).getByText("auth", { exact: true }).click();
  await dialog(page)
    .getByLabel(/auth\.user_updated/)
    .check();
  await dialog(page).getByRole("button", { name: "Add endpoint" }).click();
  // Core từ chối http://: lỗi của core nằm dưới ô địa chỉ, lựa chọn event còn nguyên.
  await expect(dialog(page).getByLabel("Address")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog(page).locator("p[role=alert]")).toHaveAttribute(
    "data-code",
    "validation_failed",
  );
  await expect(dialog(page).getByLabel(/auth\.user_updated/)).toBeChecked();
  await dialog(page).getByLabel("Address").fill("https://crm.example.com/hook");
  await dialog(page).getByRole("button", { name: "Add endpoint" }).click();
  await expect(dialog(page).getByTestId("secret")).toHaveText(/^whsec_/);
  await dialog(page).getByRole("link", { name: "Open endpoint" }).click();
  await expect(page).toHaveURL(/\/settings\/webhooks\/[0-9a-f-]+$/);
  await expect(page.locator(".empty")).toHaveText("No deliveries yet.");

  await request.post(`${CORE}/__webhooks/fire`, { data: { event: "auth.user_updated" } });
  await page.reload();
  await expect(rows(page).first()).toContainText("auth.user_updated");
  await expect(rows(page).first()).toContainText("Delivered");

  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(dialog(page)).toContainText("Pending retries are dropped.");
  await dialog(page).getByRole("button", { name: "Turn off" }).click();
  await expect(toast(page)).toHaveText("Endpoint turned off.");
  await expect(page.locator(".block-head .badge")).toHaveText("Turned off");

  await page.getByRole("button", { name: "Replace secret" }).click();
  await expect(dialog(page)).toContainText("The old secret stops working at once");
  await dialog(page).getByRole("button", { name: "Replace secret" }).click();
  await expect(dialog(page).getByTestId("secret")).toHaveText(/^whsec_/);
  await dialog(page).getByRole("button", { name: "I have stored it" }).click();

  // Sửa địa chỉ: gửi kèm ETag; hai lần lưu liền nhau vẫn dùng ETag mới của lần trước.
  await page.getByRole("textbox", { name: "Address" }).fill("https://crm2.example.com/hook");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page)).toHaveText("Endpoint saved.");
  await expect(page.getByRole("heading", { name: "crm2.example.com/hook" })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(dialog(page)).toContainText("Its delivery history is deleted.");
  await dialog(page).getByRole("button", { name: "Delete endpoint" }).click();
  await expect(page).toHaveURL(/\/settings\/webhooks$/);
  await expect(toast(page)).toHaveText("Endpoint deleted.");
  await expect(page.getByRole("heading", { name: "No endpoints here." })).toBeVisible();
});

test("Nhà phát triển: lần giao của mọi endpoint, lọc lỗi, tải OpenAPI", async ({
  page,
  request,
}) => {
  await signIn(page, "/settings/webhooks");
  for (const url of ["https://ok.example.com/in", "https://fail.example.com/in"]) {
    await page.getByRole("button", { name: "Add endpoint" }).click();
    await dialog(page).getByLabel("Address").fill(url);
    await dialog(page).getByLabel("Every event").check();
    await dialog(page).getByRole("button", { name: "Add endpoint" }).click();
    await dialog(page).getByRole("button", { name: "I have stored it" }).click();
  }
  await request.post(`${CORE}/__webhooks/fire`, { data: { event: "notes.note_created" } });

  // Lần giao gần nhất đi cùng danh sách (`last_delivery`); lọc đang bật / đã tắt ở core (`status`).
  await page.goto("/settings/webhooks");
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: "fail.example.com/in" })).toContainText("HTTP 502");
  await expect(rows(page).filter({ hasText: "fail.example.com/in" })).toContainText("Failing");
  await expect(rows(page).filter({ hasText: "ok.example.com/in" })).toContainText("Receiving");
  await page.getByRole("link", { name: "Turned off" }).click();
  await expect(page).toHaveURL(/status=disabled/);
  await expect(page.getByRole("heading", { name: "No endpoints here." })).toBeVisible();

  await page.goto("/settings/developers");
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("link", { name: /^Failed/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("HTTP 502");

  const download = await page.request.get("/settings/developers/openapi.json");
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("autoxide-openapi.json");
  expect((await download.json()).openapi).toBe("3.1.0");

  // Dữ liệu mẫu: nhật ký request lọc 5xx, event theo bản ghi.
  await page.goto("/settings/developers/requests?status=5xx");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("502");
  await page.goto("/settings/developers/events");
  await page.getByLabel("Code or id").fill("BM-2611-0412");
  await page.getByRole("button", { name: "Show events" }).click();
  await expect(page.locator(".timeline li")).toHaveCount(4);
});

test("API key: lỗi gom một lần, sai mật khẩu, khoá hiện một lần, thu hồi", async ({ page }) => {
  await signIn(page, "/settings/api-keys");
  await expect(page.getByRole("heading", { name: "You have no API keys." })).toBeVisible();
  await page.getByRole("link", { name: "Create API key" }).click();
  await expect(page).toHaveURL(/\/settings\/api-keys\/new$/);

  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("3 fields need fixing.");
  await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Name", { exact: true }).fill("nightly-report");
  await page.getByLabel(/auth\.users\.read/).check();
  await page.getByLabel("Expires").selectOption("30d");
  await page.getByLabel("Current password").fill("wrong");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByLabel("Current password")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("p[role=alert]")).toHaveAttribute("data-code", "auth.wrong_password");
  // Lựa chọn permission không mất khi core báo lỗi.
  await expect(page.getByLabel(/auth\.users\.read/)).toBeChecked();

  await page.getByLabel("Current password").fill("admin password");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByTestId("created-key").getByTestId("secret").first()).toHaveText(/^axk_/);
  await expect(page.getByTestId("created-key")).toContainText("Authorization: Bearer axk_");
  await page.getByRole("link", { name: "I have stored it" }).click();

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("nightly-report");
  await expect(rows(page).first()).toContainText("auth.users.read");
  await rows(page).first().getByRole("button", { name: "Revoke" }).click();
  await expect(dialog(page)).toContainText("Requests with this key get 401 at once.");
  await dialog(page).getByRole("button", { name: "Revoke key" }).click();
  await expect(toast(page)).toHaveText("Revoked nightly-report.");
  await expect(page.getByRole("heading", { name: "You have no API keys." })).toBeVisible();

  await page.getByRole("link", { name: "MCP connection" }).click();
  await expect(page.getByTestId("mcp-endpoint")).toHaveText("http://127.0.0.1:4010/mcp");
});

test("API key: xác nhận bằng passkey hay mã của app; quản trị viên xem và thu hồi key của mọi người", async ({
  page,
  context,
}) => {
  // Authenticator ảo của Chromium: thêm một passkey cho admin, rồi dùng nó để xác nhận khi tạo key.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  await signIn(page, "/account/security");
  await page.getByRole("button", { name: "Add passkey" }).click();
  await dialog(page).getByLabel("Name").fill("Laptop");
  await dialog(page).getByLabel("Current password").fill("admin password");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await expect(toast(page)).toHaveText("Passkey added.");

  await page.goto("/settings/api-keys/new");
  // Sổ permission của chính mình (`/me/permissions`), kèm mô tả và mức rủi ro.
  await expect(page.getByText("See and revoke the API keys of every user.")).toBeVisible();
  const confirm = page.getByRole("radiogroup", { name: "Confirm it is you" });
  await expect(confirm.getByRole("radio")).toHaveCount(2);
  await confirm.getByText("Passkey").click();
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("passkey-agent");
  await page.getByLabel(/auth\.users\.read/).check();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByTestId("created-key").getByTestId("secret").first()).toHaveText(/^axk_/);

  // Người đã bật app xác thực xác nhận bằng mã (sai thì báo dưới ô).
  await context.clearCookies();
  await page.goto("/login?next=%2Fsettings%2Fapi-keys%2Fnew");
  await page.getByLabel("Email").fill("mfa@example.com");
  await page.getByLabel("Password").fill("mfa password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/settings\/api-keys\/new$/);
  await page
    .getByRole("radiogroup", { name: "Confirm it is you" })
    .getByText("Authenticator app")
    .click();
  await page.getByLabel("Name", { exact: true }).fill("mfa-agent");
  await page.getByLabel(/notes\.read/).check();
  await page.getByLabel("Code from your authenticator app").fill("000000");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByLabel("Code from your authenticator app")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Code from your authenticator app").fill("123456");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByTestId("created-key").getByTestId("secret").first()).toHaveText(/^axk_/);

  // Quản trị viên: tab "Key của mọi người", thu hồi key của người khác.
  await context.clearCookies();
  await signIn(page, "/settings/api-keys/all");
  await expect(page).toHaveURL(/\/settings\/api-keys\/all$/);
  await expect(rows(page)).toHaveCount(2);
  const other = rows(page).filter({ hasText: "mfa-agent" });
  await expect(other).toContainText("mfa@example.com");
  await other.getByRole("button", { name: "Revoke" }).click();
  await expect(dialog(page)).toContainText("The audit log records that you revoked it.");
  await dialog(page).getByRole("button", { name: "Revoke key" }).click();
  await expect(toast(page)).toHaveText("Revoked mfa-agent.");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("passkey-agent");
});

test("cài đặt của khách (core thật): đặt, secret không hiện lại, gỡ", async ({ page }) => {
  await signIn(page, "/settings/connections");
  const url = page.getByTestId("tset-kernel.public_url");
  await expect(url).toContainText("the server-wide configuration applies");
  await url.getByRole("button", { name: "Set kernel.public_url" }).click();
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(dialog(page).getByLabel("Value")).toHaveAttribute("aria-invalid", "true");
  await dialog(page).getByLabel("Value").fill("https://shop.example");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(toast(page)).toHaveText("Saved kernel.public_url.");
  await expect(url).toContainText("https://shop.example");

  // Kết nối đối tác (nhóm `connection` của core) đứng riêng một khối, trước cấu hình nghiệp vụ.
  await expect(
    page.getByTestId("tset-connections").getByTestId("tset-mail.connection.smtp.from"),
  ).toBeVisible();
  await expect(
    page.getByTestId("tset-business").getByTestId("tset-kernel.public_url"),
  ).toBeVisible();
  await expect(
    page.getByTestId("tset-connections").getByTestId("tset-kernel.public_url"),
  ).toHaveCount(0);

  const smtp = page.getByTestId("tset-mail.connection.smtp.url");
  await smtp.getByRole("button", { name: "Set mail.connection.smtp.url" }).click();
  await expect(dialog(page).getByLabel("Value")).toHaveAttribute("type", "password");
  await dialog(page).getByLabel("Value").fill("smtp://user:secret@mail.example:587");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(toast(page)).toHaveText("Saved mail.connection.smtp.url.");
  await expect(smtp).toContainText("set");
  await expect(page.getByText("secret@mail.example")).toHaveCount(0);

  await url.getByRole("button", { name: "Remove" }).click();
  await dialog(page).getByRole("button", { name: "Remove" }).click();
  await expect(toast(page)).toHaveText(
    "Removed kernel.public_url; the server-wide configuration applies.",
  );
  await expect(url).toContainText("the server-wide configuration applies");
});

test("lệnh chờ duyệt (mẫu): hộp xác nhận nêu hệ quả, lệnh rủi ro dùng nút đỏ", async ({ page }) => {
  await signIn(page, "/settings/api-keys/approvals");
  const pending = page.getByTestId("approval");
  // Kho mẫu mới theo mỗi lần khởi động ứng dụng (gate dựng bản build mới): ba yêu cầu chờ.
  await expect(pending).toHaveCount(3);
  const risky = pending.filter({ hasText: "Xoá dữ liệu cá nhân" });
  await risky.getByRole("button", { name: "Approve…" }).click();
  await expect(dialog(page)).toContainText("DSR-2611-0007");
  await expect(dialog(page)).toContainText("original Idempotency-Key");
  await expect(dialog(page).getByRole("button", { name: "Approve and run" })).toHaveClass(
    /danger-solid/,
  );
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await pending.first().getByRole("button", { name: "Reject" }).click();
  await expect(toast(page)).toHaveText("Rejected; the agent gets the reason over MCP.");
  await expect(pending).toHaveCount(2);
});

test("nhật ký audit: lọc theo module, mở một mục thấy trước / sau", async ({ page }) => {
  await signIn(page, "/settings/audit");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Module").selectOption("notes");
  await expect(page).toHaveURL(/module=notes/);
  await expect(page.locator(".empty")).toHaveText("No entries match.");
  await page.getByRole("link", { name: "Clear filters" }).click();
  await rows(page).first().locator("a.open").click();
  await expect(page.getByRole("heading", { name: "auth.user_updated" })).toBeVisible();
  await expect(page.locator("pre.json").first()).toContainText("Old name");
  await expect(page.locator("pre.json").nth(1)).toContainText("New name");
});

test("tên miền: một khách thì giải thích; nhiều khách thì thêm, bản ghi TXT, kiểm tra, gỡ", async ({
  page,
  request,
}) => {
  await signIn(page, "/settings/domains");
  await expect(page.getByTestId("domains-single")).toContainText("single-tenant mode");
  await expect(page.getByRole("button", { name: "Add domain" })).toHaveCount(0);

  await request.post(`${CORE}/__tenancy`, { data: { mode: "multi" } });
  await page.reload();
  await page.getByRole("button", { name: "Add domain" }).click();
  await dialog(page).getByLabel("Domain").fill("10.0.0.1");
  await dialog(page).getByRole("button", { name: "Add domain" }).click();
  await expect(dialog(page).getByLabel("Domain")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog(page).getByText("is not a domain that can be used")).toBeVisible();
  await dialog(page).getByLabel("Domain").fill("Shop.Example.com.");
  await dialog(page).getByRole("button", { name: "Add domain" }).click();
  await expect(toast(page)).toHaveText("Domain added. Create its TXT record.");
  const row = rows(page).filter({ hasText: "shop.example.com" });
  await expect(row.getByTestId("txt-name")).toHaveText("_autoxide-challenge.shop.example.com");
  await expect(row.getByTestId("txt-value")).toContainText("autoxide-verify=");
  await expect(row).toContainText("Waiting for the DNS record");
  await expect(row).toContainText("Fails if not verified by");
  await expect(row.getByRole("button", { name: "Copy value" })).toBeVisible();

  // Chưa có bản ghi: core trả 200, lý do ở `check_error`.
  await row.getByRole("button", { name: "Check shop.example.com now" }).click();
  await expect(toast(page)).toContainText("Not verified yet: No TXT record found");
  await expect(row.getByTestId("check-error")).toContainText("No TXT record found");

  await request.post(`${CORE}/__domains/dns`, { data: { domain: "shop.example.com" } });
  await row.getByRole("button", { name: "Check shop.example.com now" }).click();
  await expect(toast(page)).toHaveText("shop.example.com is verified.");
  await expect(row).toContainText("Verified since");
  await expect(row.getByRole("button", { name: /Check .* now/ })).toHaveCount(0);

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(dialog(page)).toContainText("Another account can then add and verify the domain");
  await dialog(page).getByRole("button", { name: "Remove domain" }).click();
  await expect(toast(page)).toHaveText("Domain removed.");
  await expect(page.locator(".empty")).toHaveText("No domains yet. Add the first one.");
});

test("dữ liệu mẫu: kết nối đối tác có AI thật, job chạy lại", async ({ page }) => {
  await signIn(page, "/settings/connections");
  await expect(page.getByTestId("ai-status")).toContainText("Off");
  // Thư đã có cài đặt thật của core (`mail.connection.smtp.…`): bản mẫu của nó không hiện nữa.
  await expect(page.getByTestId("conn-mail")).toHaveCount(0);
  const sms = page.getByTestId("conn-sms");
  await sms.getByRole("button", { name: /Set up|Change/ }).click();
  await expect(dialog(page).getByLabel("sms.connection.gateway.api_key")).toHaveAttribute(
    "type",
    "password",
  );

  await page.goto("/settings/jobs");
  const dead = rows(page).filter({ hasText: "Dead-letter" });
  await dead.getByRole("button", { name: "Retry" }).click();
  await expect(dialog(page)).toContainText("written to the audit log");
  await dialog(page).getByRole("button", { name: "Retry job" }).click();
  await expect(toast(page)).toHaveText("Job queued again.");
  await expect(rows(page).filter({ hasText: "Dead-letter" })).toHaveCount(0);
  await expect(page.locator(".badge[data-sample]")).toHaveText(
    "Sample data · waiting for API step 52",
  );
});

test("người thiếu permission: Cài đặt chỉ còn API key; mở thẳng webhook thì báo rõ", async ({
  page,
}) => {
  await signIn(page, "/settings", "viewer@example.com");
  await expect(page).toHaveURL(/\/settings\/api-keys$/);
  await page.goto("/settings/webhooks");
  await expect(page.getByText(/webhooks\.manage/)).toBeVisible();
  await page.goto("/settings/developers");
  await expect(page.getByText("Not allowed")).toBeVisible();
});

test("điện thoại: bảng thành thẻ, không tràn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/settings/plan");
  for (const path of ["/settings/plan", "/settings/webhooks", "/settings/api-keys/mcp"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
