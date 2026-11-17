import { expect, type Page, test } from "@playwright/test";

// Màn "Người dùng và role" (phân hệ Tổ chức) với core giả (`mock-access.ts`), và các tab dữ liệu
// mẫu (W-006; Playwright bật `AUTOXIDE_WEB_SAMPLE_DATA=true`).

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

test("thanh bên có Tổ chức; danh sách người dùng có role, trạng thái, tìm", async ({ page }) => {
  await signIn(page, "/");
  await page
    .getByRole("navigation", { name: "Areas" })
    .getByRole("link", { name: "Organization" })
    .click();
  // Màn đầu của phân hệ là Cây tổ chức (dữ liệu mẫu, W-012); Người dùng và role đứng sau.
  await expect(page).toHaveURL(/\/org$/);
  await page
    .getByRole("navigation", { name: "Organization", exact: true })
    .getByRole("link", { name: "Users and roles" })
    .click();
  await expect(page).toHaveURL(/\/org\/access\/users$/);
  await expect(page.getByRole("heading", { level: 1, name: "Users and roles" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(rows(page)).toHaveCount(3);
  const admin = rows(page).filter({ hasText: "admin@example.com" });
  await expect(admin.locator(".tag")).toHaveText("admin");
  await expect(admin.getByText("Active")).toBeVisible();
  await expect(rows(page).filter({ hasText: "viewer@example.com" })).toContainText("No role");
  // Lần đăng nhập gần nhất đi cùng danh sách: admin vừa đăng nhập, viewer chưa.
  await expect(rows(page).filter({ hasText: "viewer@example.com" })).toContainText("Not yet");
  await expect(admin).not.toContainText("Not yet");

  // Lọc theo trạng thái ở core (`status`), không chỉ trên trang đang xem.
  const byStatus = page.getByRole("navigation", { name: "Filter by status" });
  await byStatus.getByRole("link", { name: "Disabled" }).click();
  await expect(page).toHaveURL(/status=disabled/);
  await expect(page.getByText("No user has this status.")).toBeVisible();
  await byStatus.getByRole("link", { name: "Active" }).click();
  await expect(rows(page)).toHaveCount(3);
  await byStatus.getByRole("link", { name: "All" }).click();

  await page.getByRole("searchbox", { name: "Find users" }).fill("view");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/search=view/);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(rows(page)).toHaveCount(3);

  await page.getByRole("searchbox", { name: "Find users" }).fill("nobody");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText("No user matches “nobody”.")).toBeVisible();
});

test("người không có permission không thấy phân hệ Tổ chức", async ({ page }) => {
  await signIn(page, "/", "viewer@example.com");
  await expect(page.getByTestId("me")).toHaveText("viewer@example.com");
  await expect(
    page.getByRole("navigation", { name: "Areas" }).getByRole("link", { name: "Organization" }),
  ).toHaveCount(0);
  await page.goto("/org/access/users");
  await expect(page.locator("main [role=alert]")).toContainText("auth.users.read");
});

test("tạo người dùng gom lỗi; gán role, đổi tên, đặt mật khẩu đầu tiên", async ({ page }) => {
  await signIn(page, "/org/access/users");
  await page.getByRole("button", { name: "New user" }).click();
  const box = dialog(page);
  await box.getByRole("button", { name: "Create user" }).click();
  await expect(box.getByRole("alert")).toHaveText("2 fields need fixing.");
  await expect(box.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(box.getByLabel("Email")).toBeFocused();

  await box.getByLabel("Email").fill("viewer@example.com");
  await box.getByLabel("Display name").fill("Ada");
  await box.getByRole("button", { name: "Create user" }).click();
  await expect(box.getByText("An account has this email.")).toBeVisible();
  await expect(box.getByRole("alert")).toHaveAttribute("data-code", "auth.email_taken");
  await expect(box.getByLabel("Display name")).toHaveValue("Ada");

  await box.getByLabel("Email").fill("ada@example.com");
  await box.getByRole("button", { name: "Create user" }).click();
  await expect(page).toHaveURL(/\/org\/access\/users\/[0-9a-f-]+$/);
  await expect(toast(page)).toHaveText("User created. Give them roles below.");
  await expect(page.getByTestId("user-email")).toHaveText("ada@example.com");
  // Trang con vẫn thuộc tab Người dùng.
  await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByLabel(/^editor/).check();
  await page.getByRole("button", { name: "Save roles" }).click();
  await expect(toast(page)).toHaveText("Roles saved.");
  await page.reload();
  await expect(page.getByLabel(/^editor/)).toBeChecked();

  await page.getByLabel("Display name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(toast(page)).toHaveText("Name saved.");
  await expect(page.getByRole("heading", { level: 2, name: "Ada Lovelace" })).toBeVisible();

  // Tài khoản chưa có mật khẩu (`has_password`): có "Đặt mật khẩu đầu tiên"; đặt xong thì không còn.
  await expect(page.getByTestId("user-sign-in")).toContainText("No password");
  await page.getByRole("button", { name: "Set password" }).click();
  await dialog(page).getByLabel("Password").fill("short");
  await dialog(page).getByRole("button", { name: "Set password" }).click();
  await expect(dialog(page).getByText("must be between 12 and 128 characters long")).toBeVisible();
  await dialog(page).getByLabel("Password").fill("ada first password");
  await dialog(page).getByRole("button", { name: "Set password" }).click();
  await expect(toast(page)).toHaveText("Password set; they can sign in with it.");
  await expect(page.getByRole("button", { name: "Set password" })).toHaveCount(0);
  await expect(page.getByTestId("user-sign-in")).toContainText("Password");
});

test("thao tác quản trị: đăng xuất, gỡ MFA, khoá có hỏi lại, quản trị viên cuối, xoá", async ({
  page,
  request,
}) => {
  await request.post(`${CORE}/__sessions`, {
    data: { email: "viewer@example.com", user_agent: "Firefox" },
  });
  await signIn(page, "/org/access/users");
  await page.getByRole("link", { name: "viewer", exact: true }).click();
  await expect(page.getByTestId("user-email")).toHaveText("viewer@example.com");

  await page.getByRole("button", { name: "Send reset mail" }).click();
  await expect(toast(page)).toHaveText(
    "If the account is active, a reset mail is on its way to viewer@example.com.",
  );
  expect((await (await request.get(`${CORE}/__resets`)).json()).emails).toEqual([
    "viewer@example.com",
  ]);

  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(dialog(page)).toContainText("disable the account instead");
  await dialog(page).getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(toast(page)).toHaveText("Ended 1 session.");

  // Đã có mật khẩu, chưa bật xác thực hai bước: không có hai nút đó.
  await expect(page.getByTestId("user-sign-in")).toContainText("two-step sign-in off");
  await expect(page.getByRole("button", { name: "Turn off two-step" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set password" })).toHaveCount(0);

  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(dialog(page)).toContainText("access tokens stop working at once");
  await dialog(page).getByRole("button", { name: "Disable account" }).click();
  await expect(toast(page)).toHaveText("Account disabled; they were signed out everywhere.");
  await expect(page.getByText("Disabled since")).toBeVisible();
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(toast(page)).toHaveText("Account enabled.");

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog(page).getByRole("textbox").fill("someone@example.com");
  await dialog(page).getByRole("button", { name: "Delete account" }).click();
  await expect(dialog(page).getByText("Type viewer@example.com exactly.")).toBeVisible();
  await dialog(page).getByRole("textbox").fill("viewer@example.com");
  await dialog(page).getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/org\/access\/users$/);
  await expect(toast(page)).toHaveText("The account was deleted.");
  await expect(rows(page)).toHaveCount(2);

  // Người đã bật xác thực hai bước: có nút tắt; tắt xong thì nút không còn.
  await page.getByRole("link", { name: "mfa", exact: true }).click();
  await expect(page.getByTestId("user-sign-in")).toContainText("two-step sign-in on");
  await page.getByRole("button", { name: "Turn off two-step" }).click();
  await dialog(page).getByRole("button", { name: "Turn off two-step sign-in" }).click();
  await expect(toast(page)).toHaveText("Two-step sign-in is off for this account.");
  await expect(page.getByRole("button", { name: "Turn off two-step" })).toHaveCount(0);
  await page.getByRole("link", { name: "All users" }).click();

  // Quản trị viên cuối cùng: core từ chối, giao diện hiện `detail` và giữ `code`.
  await page.getByRole("link", { name: "admin", exact: true }).click();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Disable account" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveAttribute("data-code", "auth.last_admin");
});

test("role: dựng sẵn chỉ xem; tạo bằng bộ chọn permission, sửa, xoá có hỏi lại", async ({
  page,
}) => {
  await signIn(page, "/org/access/roles");
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("Every permission");
  await expect(rows(page).first()).toContainText("Built in");
  await page.getByRole("link", { name: "admin", exact: true }).click();
  await expect(page.getByText(/Built-in role: it grants every permission/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete role" })).toHaveCount(0);

  await page.getByRole("link", { name: "All roles" }).click();
  await page.getByRole("link", { name: "New role" }).click();
  await page.getByLabel("Name", { exact: true }).fill("editor");
  await page.getByLabel("Find permissions").fill("ghi chu");
  await expect(page.getByText("No permission matches “ghi chu”.")).toBeVisible();
  await page.getByLabel("Find permissions").fill("notes");
  await page.getByRole("button", { name: "Choose all of notes" }).click();
  await expect(page.getByTestId("chosen-count")).toHaveText("2 of 8 chosen");
  await page.getByLabel("Find permissions").fill("");
  await page.getByLabel(/auth\.users\.read/).check();
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("A role named `editor` already exists.")).toBeVisible();
  // Lựa chọn vẫn còn sau khi core báo lỗi.
  await expect(page.getByTestId("chosen-count")).toHaveText("3 of 8 chosen");

  await page.getByLabel("Name", { exact: true }).fill("support");
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page).toHaveURL(/\/org\/access\/roles\/[0-9a-f-]+$/);
  await expect(toast(page)).toHaveText("Role created.");
  await expect(page.getByRole("heading", { level: 2, name: "support" })).toBeVisible();
  await expect(page.getByTestId("chosen-count")).toHaveText("3 of 8 chosen");

  await page.getByLabel("Description (optional)").fill("Answers customers");
  await page.getByLabel(/notes\.write/).uncheck();
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(toast(page)).toHaveText("Role saved.");
  await page.reload();
  await expect(page.getByTestId("chosen-count")).toHaveText("2 of 8 chosen");
  // Lưu lần nữa với ETag mới (trang tải lại sau lần lưu trước): không bị 412.
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(toast(page)).toHaveText("Role saved.");

  // Nhân bản: form tạo điền sẵn mô tả và permission, tên thêm `-copy`; tạo như role mới.
  const original = page.url();
  await page.getByRole("link", { name: "Duplicate" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Copy of support" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("support-copy");
  await expect(page.getByLabel("Description (optional)")).toHaveValue("Answers customers");
  await expect(page.getByTestId("chosen-count")).toHaveText("2 of 8 chosen");
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page).toHaveURL(/\/org\/access\/roles\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 2, name: "support-copy" })).toBeVisible();
  await expect(page.getByTestId("chosen-count")).toHaveText("2 of 8 chosen");
  await page.getByRole("button", { name: "Delete role" }).click();
  await dialog(page).getByRole("button", { name: "Delete role" }).click();
  await expect(page).toHaveURL(/\/org\/access\/roles$/);
  await page.goto(original);

  await page.getByRole("button", { name: "Delete role" }).click();
  await expect(dialog(page)).toContainText("loses its permissions on their next request");
  await dialog(page).getByRole("button", { name: "Delete role" }).click();
  await expect(page).toHaveURL(/\/org\/access\/roles$/);
  await expect(toast(page)).toHaveText("Role deleted.");
  await expect(rows(page)).toHaveCount(2);
});

test("điện thoại: bảng người dùng thành thẻ có nhãn cột", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/org/access/users");
  const cell = rows(page).first().locator('td[data-label="Roles"]');
  await expect(cell).toBeVisible();
  const label = await cell.evaluate((td) => getComputedStyle(td, "::before").content);
  expect(label).toContain("Roles");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("tab dữ liệu mẫu: lời mời, uỷ quyền, quyền vào hỗ trợ", async ({ page }) => {
  await signIn(page, "/org/access/invitations");
  await expect(page.getByText("Sample data · waiting for API step 34")).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
  await page.getByRole("link", { name: "Pending" }).click();
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole("button", { name: "Invite staff" }).click();
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("2 fields need fixing.");
  await expect(dialog(page).getByText("Choose at least one role.")).toBeVisible();
  await dialog(page).getByLabel("Email").fill("new.staff@example.com");
  await dialog(page).getByLabel("editor").check();
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(toast(page)).toHaveText("Invitation sent; follow it in this list.");
  await expect(rows(page)).toHaveCount(3);
  const added = rows(page).filter({ hasText: "new.staff@example.com" });
  await added.getByRole("button", { name: "Revoke" }).click();
  await dialog(page).getByRole("button", { name: "Revoke invitation" }).click();
  await expect(toast(page)).toHaveText("Invitation revoked.");
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole("link", { name: /Delegation/ }).click();
  await page.getByRole("button", { name: "New delegation" }).click();
  await dialog(page).getByLabel("Reason").fill("short");
  await dialog(page).getByRole("button", { name: "Delegate" }).click();
  await expect(dialog(page).getByText("Write 10 to 500 characters.")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Monthly reconciliation");
  await dialog(page).getByRole("button", { name: "Delegate" }).click();
  await expect(toast(page)).toHaveText("Delegated; the event is recorded at both customers.");
  await expect(rows(page)).toHaveCount(4);

  await page.getByRole("link", { name: /Support access/ }).click();
  await expect(page).toHaveURL(/\/org\/access\/support$/);
  await page.getByRole("button", { name: "Revoke" }).click();
  await dialog(page).getByRole("button", { name: "Revoke now" }).click();
  await expect(toast(page)).toHaveText("Access revoked.");
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
});

test("quản trị viên xem và gỡ passkey của người mất thiết bị (một chiếc, rồi tất cả)", async ({
  page,
  request,
}) => {
  // AAGUID của Windows Hello: core trả tên loại authenticator kèm passkey.
  const hello = "08987058-cadc-4b81-b6e1-30de50dcbe96";
  for (const name of ["iPhone của Lan", "Laptop cơ quan", "Khoá USB"]) {
    await request.post(`${CORE}/__passkeys`, {
      data: {
        email: "viewer@example.com",
        name,
        ...(name === "Laptop cơ quan" ? { aaguid: hello } : {}),
      },
    });
  }
  await signIn(page, "/org/access/users");
  await page.getByRole("link", { name: "viewer", exact: true }).click();
  const section = page.getByRole("region", { name: "Passkeys" });
  await expect(section.locator(".item-title")).toHaveText([
    "Khoá USB",
    "Laptop cơ quan",
    "iPhone của Lan",
  ]);
  await expect(section.locator(".item").filter({ hasText: "Laptop cơ quan" })).toContainText(
    "Windows Hello",
  );

  await section.getByRole("button", { name: "Remove passkey iPhone của Lan" }).click();
  await expect(dialog(page)).toContainText("Their password, other passkeys and sessions stay");
  await dialog(page).getByRole("button", { name: "Remove passkey" }).click();
  await expect(toast(page)).toHaveText("Passkey removed.");
  await expect(section.locator(".item-title")).toHaveText(["Khoá USB", "Laptop cơ quan"]);

  await section.getByRole("button", { name: "Remove every passkey" }).click();
  await dialog(page).getByRole("button", { name: "Remove every passkey" }).click();
  await expect(toast(page)).toHaveText("Every passkey removed.");
  await expect(section).toContainText("This person has no passkey.");
});
