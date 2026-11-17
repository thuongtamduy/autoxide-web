import { expect, type Page, test } from "@playwright/test";

// Bước 34 của core, đợt 2 của giao diện (W-046): role theo độ sâu và bắt buộc MFA, lời mời và trang
// nhận lời mời, đăng nhập bằng link, uỷ quyền, quyền vào hỗ trợ, hồ sơ và nơi làm việc của mình, role
// ở các nút khác gốc. Core giả: `mock-team.ts`; token trong thư lấy bằng `GET /__team/tokens`.

const CORE = "http://127.0.0.1:4010";

test.beforeEach(async ({ request }) => {
  await request.post(`${CORE}/__reset`);
});

async function signIn(page: Page, path: string, email = "admin@example.com", password?: string) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel("Password")
    .fill(password ?? (email.startsWith("viewer") ? "viewer password" : "admin password"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function tokens(page: Page): Promise<{
  invites: Record<string, string>;
  links: Record<string, string>;
}> {
  return (await page.request.get(`${CORE}/__team/tokens`)).json();
}

const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page) => page.locator(".toast[role=status]");
const rows = (page: Page) => page.locator("tbody tr");

test("role: độ sâu theo permission, bắt buộc MFA; người giữ role chưa bật MFA thấy dải nhắc", async ({
  page,
}) => {
  await signIn(page, "/org/access/roles");
  await page.getByRole("link", { name: "editor", exact: true }).click();
  // `notes.write` cấp được theo nút: ô độ sâu hiện khi đã chọn.
  const depth = page.getByLabel("Depth of notes.write");
  await expect(depth).toHaveValue("tenant");
  await depth.selectOption("unit");
  await page.getByLabel("Requires two-step sign-in").check();
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(toast(page)).toHaveText("Role saved.");
  await page.reload();
  await expect(page.getByLabel("Depth of notes.write")).toHaveValue("unit");
  await expect(page.getByLabel("Requires two-step sign-in")).toBeChecked();

  // Gán role cho viewer, rồi đăng nhập bằng viewer: dải nhắc bật MFA.
  await page.goto("/org/access/users");
  await page.getByRole("link", { name: "viewer", exact: true }).click();
  await page.getByLabel(/^editor/).check();
  await page.getByRole("button", { name: "Save roles" }).first().click();
  await expect(toast(page)).toHaveText("Roles saved.");
  await page.context().clearCookies();
  await signIn(page, "/", "viewer@example.com");
  await expect(page.getByTestId("mfa-banner")).toContainText("Turn on two-step sign-in.");
  await page.getByTestId("mfa-banner").getByRole("link", { name: "Set it up" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
});

test("lời mời: gom lỗi, mời, gửi lại, thu hồi; người mới nhận và được đăng nhập", async ({
  page,
}) => {
  await signIn(page, "/org/access/invitations");
  await expect(page.getByText(/Sample data/)).toHaveCount(0);
  await expect(page.getByText("No invitation in this status.")).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).click();
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await dialog(page).getByLabel("Email").fill("new.staff@example.com");
  await dialog(page).getByLabel("Unit").selectOption({ label: "— — CN Quận 3" });
  await dialog(page).getByLabel("editor").check();
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(toast(page)).toHaveText("Invitation sent; follow it in this list.");
  const row = rows(page).filter({ hasText: "new.staff@example.com" });
  await expect(row).toContainText("CN Quận 3");
  await expect(row).toContainText("Pending");
  await row.getByRole("button", { name: "Resend" }).click();
  await expect(toast(page)).toContainText("Sent again to new.staff@example.com");

  // Lời mời thứ hai, rồi thu hồi.
  await page.getByRole("button", { name: "Invite staff" }).click();
  await dialog(page).getByLabel("Email").fill("gone@example.com");
  await dialog(page).getByLabel("editor").check();
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(toast(page)).toHaveText("Invitation sent; follow it in this list.");
  const gone = rows(page).filter({ hasText: "gone@example.com" });
  await gone.getByRole("button", { name: "Revoke" }).click();
  await dialog(page).getByRole("button", { name: "Revoke invitation" }).click();
  await expect(toast(page)).toHaveText("Invitation revoked.");
  await expect(gone).toContainText("Revoked");

  // Lời mời đang chờ hiện ở nút được mời trên màn Cây tổ chức.
  await page.goto("/org");
  await page.locator(".ot-node", { hasText: "CN Quận 3" }).click();
  await expect(rows(page).filter({ hasText: "new.staff@example.com" })).toContainText(
    "Invited · waiting",
  );

  // Người mới mở link trong thư (không đăng nhập).
  const token = (await tokens(page)).invites["new.staff@example.com"] ?? "";
  await page.context().clearCookies();
  await page.goto(`/invitation?token=${token}`);
  await page.getByLabel("Your name").fill("Thu Ngân");
  await page.getByLabel("Password (optional)").fill("short");
  await page.getByRole("button", { name: "Accept and create my account" }).click();
  await expect(page.getByText("must be 12 to 128 characters")).toBeVisible();
  await page.getByLabel("Password (optional)").fill("a long new password");
  await page.getByRole("button", { name: "Accept and create my account" }).click();
  await expect(page).toHaveURL(/\/\?welcome=1$/);
  await page.goto("/account");
  await expect(page.getByTestId("account-email")).toHaveText("new.staff@example.com");
  // Người mới không có `organizations.units.read`: core chưa trả tên nút kèm membership của mình.
  await expect(page.getByTestId("my-units")).toContainText("editor");

  // Link đã dùng: báo lỗi của core.
  await page.context().clearCookies();
  await page.goto(`/invitation?token=${token}`);
  await page.getByRole("button", { name: "Accept and create my account" }).click();
  await expect(page.locator("[data-code]")).toHaveAttribute("data-code", "auth.invitation_invalid");
});

test("lời mời cho email đã có tài khoản: đăng nhập rồi nhận", async ({ page }) => {
  await signIn(page, "/org/access/invitations");
  await page.getByRole("button", { name: "Invite staff" }).click();
  await dialog(page).getByLabel("Email").fill("viewer@example.com");
  await dialog(page).getByLabel("editor").check();
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(toast(page)).toHaveText("Invitation sent; follow it in this list.");
  const token = (await tokens(page)).invites["viewer@example.com"] ?? "";
  await page.context().clearCookies();
  await page.goto(`/invitation?token=${token}`);
  await page.getByRole("button", { name: "Accept and create my account" }).click();
  await expect(page.locator("[data-code]")).toHaveAttribute(
    "data-code",
    "auth.invitation_sign_in_required",
  );
  await page.getByRole("link", { name: "Sign in, then accept" }).first().click();
  await page.getByLabel("Email").fill("viewer@example.com");
  await page.getByLabel("Password").fill("viewer password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/invitation\?token=/);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText("Invitation accepted: the new roles work")).toBeVisible();
});

test("đăng nhập bằng link qua email", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign in with a link by email" }).click();
  await expect(page).toHaveURL(/\/sign-in\/link$/);
  await page.getByRole("button", { name: "Mail me a link" }).click();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByRole("button", { name: "Mail me a link" }).click();
  await expect(page.getByRole("status")).toContainText("If admin@example.com has an account");
  // Sai token: lỗi của core, có link xin lại.
  await page.goto("/sign-in/link?token=wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("[data-code]")).toHaveAttribute("data-code", "auth.login_link_invalid");
  await expect(page.getByRole("link", { name: "Ask for a new link" })).toBeVisible();
  const token = (await tokens(page)).links["admin@example.com"] ?? "";
  await page.goto(`/sign-in/link?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Account menu of admin" })).toBeVisible();
});

test("đăng nhập bằng link khi tài khoản bật xác thực hai bước: sang bước nhập mã", async ({
  page,
}) => {
  await page.goto("/sign-in/link");
  await page.getByLabel("Email").fill("mfa@example.com");
  await page.getByRole("button", { name: "Mail me a link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const token = (await tokens(page)).links["mfa@example.com"] ?? "";
  await page.goto(`/sign-in/link?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("uỷ quyền và quyền vào hỗ trợ", async ({ page }) => {
  await signIn(page, "/org/access/delegations");
  await expect(rows(page).first()).toContainText("Đối soát doanh thu tháng");
  await page.getByRole("button", { name: "New delegation" }).click();
  // Khách cấp dưới chọn từ danh sách của core (D-333), hiện bằng tên trong bảng.
  await expect(rows(page).first()).toContainText("Chi nhánh Đà Nẵng");
  await dialog(page)
    .getByLabel("Customer below this one")
    .selectOption({ label: "Chi nhánh Đà Nẵng · da-nang" });
  await dialog(page).getByLabel("Reason").fill("short");
  await dialog(page).getByRole("button", { name: "Delegate" }).click();
  await expect(dialog(page).getByText("must be 10 to 500 characters")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Kiểm kho cuối quý");
  await dialog(page).getByRole("button", { name: "Delegate" }).click();
  await expect(toast(page)).toHaveText("Delegated; the event is recorded at both customers.");
  const added = rows(page).filter({ hasText: "Kiểm kho cuối quý" });
  await added.getByRole("button", { name: "Revoke" }).click();
  await dialog(page).getByRole("button", { name: "Revoke delegation" }).click();
  await expect(toast(page)).toHaveText("Delegation revoked.");
  await expect(added).toContainText("Revoked");

  await page.getByRole("link", { name: "Support access" }).click();
  await expect(page).toHaveURL(/\/org\/access\/support$/);
  // Lần cấp theo yêu cầu của cơ quan không thu hồi được; lần cấp hỗ trợ thì được.
  await expect(rows(page).filter({ hasText: "CV 123/2026" }).getByRole("button")).toHaveCount(0);
  const support = rows(page).filter({ hasText: "Kiểm tra lỗi đồng bộ" });
  await support.getByRole("button", { name: "Revoke" }).click();
  await dialog(page).getByRole("button", { name: "Revoke now" }).click();
  await expect(toast(page)).toHaveText("Access revoked.");
  await expect(support).toContainText("Revoked");
  const allow = page.getByLabel(/Platform staff may enter when you report a problem/);
  await allow.uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page)).toHaveText("Saved; new grants follow this setting.");
  await page.reload();
  await expect(allow).not.toBeChecked();
});

test("hồ sơ của mình: tên, ngôn ngữ, múi giờ; nơi làm việc", async ({ page }) => {
  await signIn(page, "/account");
  await expect(page.getByTestId("my-units")).toContainText("admin");
  await page.getByLabel("Time zone").fill("Mars/Base");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("is not an IANA time zone")).toBeVisible();
  await page.getByLabel("Display name", { exact: true }).fill("Lan Phạm");
  await page.getByLabel("Preferred language").selectOption("vi");
  await page.getByLabel("Time zone").fill("Asia/Ho_Chi_Minh");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(toast(page)).toHaveText("Profile saved.");
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Lan Phạm");
  await expect(page.getByLabel("Preferred language")).toHaveValue("vi");
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Ho_Chi_Minh");
});

test("role ở nút khác gốc: thêm, sửa, rời", async ({ page }) => {
  await signIn(page, "/org/access/users");
  await page.getByRole("link", { name: "viewer", exact: true }).click();
  const units = page.getByTestId("unit-roles");
  await expect(units).toContainText("Not assigned at any other unit.");
  await units.getByRole("button", { name: "Add a unit" }).click();
  await dialog(page).getByLabel("Unit").selectOption({ label: "— CN Quận 3" });
  await dialog(page)
    .getByLabel(/^editor/)
    .check();
  await dialog(page).getByRole("button", { name: "Save roles" }).click();
  await expect(toast(page)).toHaveText("Roles at the unit saved.");
  await expect(units).toContainText("CN Quận 3");
  await expect(units).toContainText("editor");
  await units.getByRole("button", { name: "Edit roles at CN Quận 3" }).click();
  await dialog(page)
    .getByLabel(/^editor/)
    .uncheck();
  await dialog(page).getByRole("button", { name: "Save roles" }).click();
  await expect(units).toContainText("Not assigned at any other unit.");
});

test("trang đăng nhập chỉ hiện cách đăng nhập máy chủ bật (client-config, D-333)", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Sign in with a link by email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
  await page.request.post(`${CORE}/__auth-config`, {
    data: { login_link: false, passkeys: false },
  });
  await page.reload();
  await expect(page.getByRole("link", { name: "Sign in with a link by email" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toHaveCount(0);
});

test("chuyển khách đang làm việc: vào khách con qua uỷ quyền, quay về; hết quyền thì báo", async ({
  page,
}) => {
  const child = "00000000-0000-7000-8000-0000000000d1";
  await page.request.post(`${CORE}/__team/entry`, {
    data: { id: child, name: "Chi nhánh Đà Nẵng", slug: "da-nang", access: "delegation" },
  });
  await signIn(page, "/");
  await page.getByRole("button", { name: "Change organization unit" }).click();
  const others = page.getByTestId("other-tenants");
  await expect(others).toContainText("Delegation");
  await others.getByRole("button", { name: /Chi nhánh Đà Nẵng/ }).click();
  const banner = page.getByTestId("entered-banner");
  await expect(banner).toContainText("You are working in Chi nhánh Đà Nẵng through Delegation");
  await expect(page.getByTestId("tenant-name")).toHaveText("Chi nhánh Đà Nẵng");

  await banner.getByRole("button", { name: "Back to my customer" }).click();
  await expect(page.getByTestId("entered-banner")).toHaveCount(0);

  // Vào lại rồi khách cha thu hồi uỷ quyền: trang báo quyền đã hết, cho quay về.
  await page.getByRole("button", { name: "Change organization unit" }).click();
  await others.getByRole("button", { name: /Chi nhánh Đà Nẵng/ }).click();
  await expect(page.getByTestId("entered-banner")).toBeVisible();
  await page.request.post(`${CORE}/__team/entry`, { data: { id: child, revoke: true } });
  await page.reload();
  await expect(page.getByTestId("entry-ended")).toContainText(
    "Your access to this customer has ended",
  );
  await page.getByRole("button", { name: "Back to my customer" }).click();
  await expect(page.getByTestId("entry-ended")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
